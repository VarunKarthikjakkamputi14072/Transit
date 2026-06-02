"""Redis-backed response cache helpers.

Includes single-flight (cache stampede) protection: when multiple concurrent
requests miss the same cache key, only one upstream call goes out. The rest
wait on a Redis lock and read the value the winner populated.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from typing import Any, Callable, Coroutine, Mapping

from app.redis_client import get_redis

# How long a single-flight lock is held before it expires automatically.
# Gives the winning coroutine time to finish the upstream call.
_LOCK_TTL = 10  # seconds
# How often waiters poll for the value while the winner fetches it.
_POLL_INTERVAL = 0.05  # seconds


def _params_hash(params: Mapping[str, Any]) -> str:
    normalized = json.dumps(params, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]


def cache_key(route: str, params: Mapping[str, Any]) -> str:
    return f"cache:{route}:{_params_hash(params)}"


def _lock_key(route: str, params: Mapping[str, Any]) -> str:
    return f"lock:{route}:{_params_hash(params)}"


async def get_cached(route: str, params: Mapping[str, Any]) -> Any | None:
    redis = get_redis()
    raw = await redis.get(cache_key(route, params))
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


async def set_cached(
    route: str, params: Mapping[str, Any], value: Any, ttl_seconds: int
) -> None:
    redis = get_redis()
    payload = json.dumps(value, default=str, separators=(",", ":"))
    await redis.set(cache_key(route, params), payload, ex=ttl_seconds)


async def get_or_fetch(
    route: str,
    params: Mapping[str, Any],
    ttl_seconds: int,
    fetch_fn: Callable[[], Coroutine[Any, Any, Any]],
) -> Any:
    """Return cached value if present; otherwise fetch exactly once.

    Uses a Redis NX lock so that when N coroutines all miss the same key
    simultaneously, only one calls fetch_fn. The rest wait and read the
    value the winner stored — no stampede, no N upstream calls.

    Args:
        route: Cache namespace (e.g. "weather").
        params: Request parameters used to derive the cache key.
        ttl_seconds: TTL to set on the populated cache entry.
        fetch_fn: Async callable that returns the value to cache.

    Returns:
        The cached or freshly fetched value.
    """
    # Fast path: value already in cache.
    cached = await get_cached(route, params)
    if cached is not None:
        return cached

    redis = get_redis()
    lk = _lock_key(route, params)
    ck = cache_key(route, params)

    # Try to acquire the single-flight lock (SET NX EX).
    acquired = await redis.set(lk, "1", nx=True, ex=_LOCK_TTL)

    if acquired:
        # We won the race — call upstream and populate the cache.
        try:
            value = await fetch_fn()
            payload = json.dumps(value if not hasattr(value, "model_dump") else value, default=str, separators=(",", ":"))
            await redis.set(ck, payload, ex=ttl_seconds)
            return json.loads(payload)
        finally:
            await redis.delete(lk)
    else:
        # Another coroutine is fetching — wait for it to populate the cache.
        deadline = asyncio.get_event_loop().time() + _LOCK_TTL
        while asyncio.get_event_loop().time() < deadline:
            await asyncio.sleep(_POLL_INTERVAL)
            raw = await redis.get(ck)
            if raw is not None:
                try:
                    return json.loads(raw)
                except json.JSONDecodeError:
                    break
        # Fallback: lock expired or decode failed — call upstream ourselves.
        return await fetch_fn()
