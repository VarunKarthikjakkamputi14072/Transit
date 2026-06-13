"""Redis response cache for LLM/embedding calls — the cost-control core.

Identical requests (same model + inputs) are served from Redis instead of being
forwarded upstream, so repeated questions and repeated chunk-embeddings cost
nothing. Every cache hit increments a `tokens_saved` counter so the savings are
measurable, not just claimed.

Caching is exact-match on a SHA-256 of the normalized request. It degrades
gracefully: if Redis is unreachable, lookups miss and stores no-op (the request
still goes upstream), so a Redis blip never breaks the gateway.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping

from redis.exceptions import RedisError

from app.redis_client import get_redis

# Redis counter keys for the "money saved" metrics shown in the portal.
_TOKENS_SAVED_KEY = "transit:tokens_saved_total"
_CACHE_HITS_KEY = "transit:cache_hits_total"
_CACHE_MISSES_KEY = "transit:cache_misses_total"


def request_hash(route: str, payload: Mapping[str, Any]) -> str:
    """Stable SHA-256 of a normalized request — the cache key."""
    normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]
    return f"cache:{route}:{digest}"


async def get_cached(key: str) -> Any | None:
    """Return the cached JSON value for ``key``, or None on miss/Redis error."""
    try:
        raw = await get_redis().get(key)
    except RedisError:
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


async def set_cached(key: str, value: Any, ttl_seconds: int) -> None:
    """Store ``value`` under ``key`` for ``ttl_seconds`` (no-op on Redis error)."""
    if ttl_seconds <= 0:
        return
    try:
        payload = json.dumps(value, separators=(",", ":"), default=str)
        await get_redis().set(key, payload, ex=ttl_seconds)
    except RedisError:
        pass


async def record_hit(tokens_saved: int) -> None:
    """Count a cache hit and the tokens it saved (best-effort)."""
    try:
        redis = get_redis()
        pipe = redis.pipeline()
        pipe.incr(_CACHE_HITS_KEY)
        if tokens_saved > 0:
            pipe.incrby(_TOKENS_SAVED_KEY, tokens_saved)
        await pipe.execute()
    except RedisError:
        pass


async def record_miss() -> None:
    """Count a cache miss (best-effort)."""
    try:
        await get_redis().incr(_CACHE_MISSES_KEY)
    except RedisError:
        pass


async def get_savings() -> dict[str, int]:
    """Return cumulative {cache_hits, cache_misses, tokens_saved} for analytics."""
    try:
        redis = get_redis()
        pipe = redis.pipeline()
        pipe.get(_CACHE_HITS_KEY)
        pipe.get(_CACHE_MISSES_KEY)
        pipe.get(_TOKENS_SAVED_KEY)
        hits, misses, tokens = await pipe.execute()
    except RedisError:
        return {"cache_hits": 0, "cache_misses": 0, "tokens_saved": 0}
    return {
        "cache_hits": int(hits or 0),
        "cache_misses": int(misses or 0),
        "tokens_saved": int(tokens or 0),
    }
