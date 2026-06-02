"""Shared HTTPX client utilities for upstream API calls."""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator, Optional

import httpx

from app.config import get_settings


class UpstreamError(Exception):
    """Raised when an upstream call fails after normalization attempts."""

    def __init__(self, message: str, *, status_code: int = 502, provider: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.provider = provider


class CircuitBreakerOpen(UpstreamError):
    """Raised when the circuit breaker is open."""

    def __init__(self, provider: str):
        super().__init__(f"Circuit breaker OPEN for {provider}", status_code=503, provider=provider)


@dataclass(slots=True)
class TimedResponse:
    """An upstream HTTP response paired with the latency we observed."""

    response: httpx.Response
    latency_ms: int


_shared_client: Optional[httpx.AsyncClient] = None


def get_http_client() -> httpx.AsyncClient:
    """Return a lazily-initialized process-wide async HTTP client."""
    global _shared_client
    if _shared_client is None:
        settings = get_settings()
        _shared_client = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.upstream_timeout_seconds),
            headers={"User-Agent": "APIForge/0.1"},
        )
    return _shared_client


def set_http_client(client: httpx.AsyncClient) -> None:
    """Override the shared HTTP client (intended for tests)."""
    global _shared_client
    _shared_client = client


async def close_http_client() -> None:
    global _shared_client
    if _shared_client is not None:
        try:
            await _shared_client.aclose()
        except Exception:  # pragma: no cover
            pass
        _shared_client = None


class RedisCircuitBreaker:
    """Redis-backed circuit breaker with half-open probe support.

    States:
    - CLOSED  : normal operation, failures counted in Redis.
    - OPEN     : cb:open key exists (TTL = recovery_timeout). All requests
                 rejected immediately with CircuitBreakerOpen.
    - HALF-OPEN: cb:open expired but cb:probe key exists. Exactly one request
                 is allowed through as a trial. Success → CLOSED. Failure →
                 back to OPEN for another recovery_timeout window.
    """

    def __init__(self, provider: str, failure_threshold: int = 5, recovery_timeout: int = 30):
        self.provider = provider
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.fail_key = f"cb:fails:{provider}"
        self.open_key = f"cb:open:{provider}"
        self.probe_key = f"cb:probe:{provider}"

    async def check(self) -> None:
        """Raise CircuitBreakerOpen if the breaker is OPEN.

        If the OPEN TTL has expired (half-open window), allow exactly one
        probe request through by acquiring a short-lived probe lock (SET NX).
        Any concurrent request during the probe window is still rejected.
        """
        from app.redis_client import get_redis
        redis = get_redis()

        is_open = await redis.get(self.open_key)
        if not is_open:
            # CLOSED or half-open window — check if we're in probe mode.
            return

        # OPEN: check whether the probe window has opened (open key still live).
        # We're still within the OPEN TTL — reject.
        raise CircuitBreakerOpen(self.provider)

    async def check_half_open(self) -> bool:
        """Return True if this call is the designated half-open probe.

        Called after the OPEN TTL expires. Uses SET NX so only one concurrent
        caller becomes the probe; the rest are still rejected.
        """
        from app.redis_client import get_redis
        redis = get_redis()

        is_open = await redis.get(self.open_key)
        if is_open:
            raise CircuitBreakerOpen(self.provider)

        # Try to claim the probe slot (short TTL = one probe attempt window).
        acquired = await redis.set(self.probe_key, "1", nx=True, ex=self.recovery_timeout)
        if acquired:
            return True  # This caller is the probe.
        # Another caller already holds the probe — reject this one.
        raise CircuitBreakerOpen(self.provider)

    async def record_success(self) -> None:
        from app.redis_client import get_redis
        redis = get_redis()
        await redis.delete(self.fail_key, self.probe_key)

    async def record_failure(self) -> None:
        from app.redis_client import get_redis
        redis = get_redis()
        # Clean up any probe lock so the next recovery cycle can start fresh.
        await redis.delete(self.probe_key)
        fails = await redis.incr(self.fail_key)
        if fails == 1:
            await redis.expire(self.fail_key, self.recovery_timeout * 2)
        if fails >= self.failure_threshold:
            # Trip the breaker — open for recovery_timeout seconds.
            await redis.set(self.open_key, "1", ex=self.recovery_timeout)


@asynccontextmanager
async def timed_get(
    url: str, *, params: dict | None = None, provider: str
) -> AsyncIterator[TimedResponse]:
    """Async context manager: GET with latency tracking and circuit breaking.

    State machine:
    - CLOSED  → request goes through normally.
    - OPEN     → CircuitBreakerOpen raised immediately (no HTTP call).
    - HALF-OPEN → one probe request allowed through. Success resets the
                  breaker to CLOSED; failure re-opens it.
    """
    cb = RedisCircuitBreaker(provider=provider)

    # Determine if we're OPEN, HALF-OPEN (probe), or CLOSED.
    # check() raises if still within the OPEN window.
    # check_half_open() raises for non-probe callers after the window expires.
    from app.redis_client import get_redis
    redis = get_redis()
    is_open = await redis.get(cb.open_key)
    if is_open:
        # Still within OPEN window — reject immediately.
        raise CircuitBreakerOpen(provider)
    # Either CLOSED or the OPEN TTL just expired (half-open window).
    # check_half_open enforces that only one caller probes at a time.
    probe_key_exists = await redis.get(cb.probe_key)
    fail_count_raw = await redis.get(cb.fail_key)
    fail_count = int(fail_count_raw) if fail_count_raw else 0
    if fail_count >= cb.failure_threshold or probe_key_exists:
        # Breaker recently tripped and OPEN key expired — half-open state.
        await cb.check_half_open()  # raises for non-probe callers

    client = get_http_client()
    start = time.perf_counter()
    try:
        response = await client.get(url, params=params)
        response.raise_for_status()
        await cb.record_success()
    except httpx.HTTPError as exc:
        await cb.record_failure()
        raise UpstreamError(
            f"{provider} request failed: {exc}", status_code=504, provider=provider
        ) from exc

    latency_ms = int((time.perf_counter() - start) * 1000)
    yield TimedResponse(response=response, latency_ms=latency_ms)
