"""NVIDIA NIM (build.nvidia.com) chat-completions client.

The endpoint is OpenAI-compatible, so this is a thin POST wrapper around the
shared HTTP client with latency tracking and error normalization. The
server-side NVIDIA_API_KEY is injected as an Authorization: Bearer header so it
never reaches the client.
"""

from __future__ import annotations

import time

from app.config import get_settings
from app.schemas import (
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatUsage,
    EmbeddingItem,
    EmbeddingRequest,
    EmbeddingResponse,
)
from app.upstream.base import UpstreamError, get_http_client


async def fetch_chat_completion(
    req: ChatCompletionRequest,
) -> tuple[ChatCompletionResponse, int]:
    """Return ``(completion, upstream_latency_ms)`` from NVIDIA NIM."""
    settings = get_settings()
    if not settings.nvidia_api_key:
        raise UpstreamError(
            "NVIDIA NIM API key is not configured (set NVIDIA_API_KEY).",
            status_code=503,
            provider="nvidia-nim",
        )

    model = req.model or settings.nvidia_model
    payload = {
        "model": model,
        "messages": [m.model_dump() for m in req.messages],
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
        "stream": False,
    }
    headers = {
        "Authorization": f"Bearer {settings.nvidia_api_key}",
        "Content-Type": "application/json",
    }

    client = get_http_client()
    url = f"{settings.nvidia_base_url.rstrip('/')}/chat/completions"
    start = time.perf_counter()
    try:
        response = await client.post(url, json=payload, headers=headers)
    except Exception as exc:  # network / timeout
        raise UpstreamError(
            f"NVIDIA NIM request failed: {exc}",
            status_code=504,
            provider="nvidia-nim",
        ) from exc
    latency_ms = int((time.perf_counter() - start) * 1000)

    if response.status_code >= 400:
        raise UpstreamError(
            f"NVIDIA NIM error {response.status_code}: {response.text[:300]}",
            status_code=502,
            provider="nvidia-nim",
        )

    data = response.json()
    return _normalize(data, model), latency_ms


def _normalize(data: dict, model: str) -> ChatCompletionResponse:
    choices = data.get("choices") or []
    content = ""
    if choices:
        message = choices[0].get("message") or {}
        content = message.get("content") or ""

    usage_raw = data.get("usage") or {}
    usage = ChatUsage(
        prompt_tokens=int(usage_raw.get("prompt_tokens", 0) or 0),
        completion_tokens=int(usage_raw.get("completion_tokens", 0) or 0),
        total_tokens=int(usage_raw.get("total_tokens", 0) or 0),
    )

    return ChatCompletionResponse(
        model=str(data.get("model") or model),
        content=content,
        usage=usage,
    )


async def fetch_embeddings(
    req: EmbeddingRequest,
) -> tuple[EmbeddingResponse, int]:
    """Return ``(embeddings, upstream_latency_ms)`` from NVIDIA NIM.

    Used by RAG apps (MedQuery, ChatDoc) to embed document chunks and queries.
    The gateway caches these aggressively — re-embedding identical text is pure
    waste, so a content-hash cache hit returns instantly with zero token cost.
    """
    settings = get_settings()
    if not settings.nvidia_api_key:
        raise UpstreamError(
            "NVIDIA NIM API key is not configured (set NVIDIA_API_KEY).",
            status_code=503,
            provider="nvidia-nim",
        )

    model = req.model or settings.nvidia_embedding_model
    payload = {
        "model": model,
        "input": req.input,
        # NVIDIA embedding models require an input_type; "passage" suits both
        # indexing and query embedding for retrieval-style models.
        "input_type": "passage",
    }
    headers = {
        "Authorization": f"Bearer {settings.nvidia_api_key}",
        "Content-Type": "application/json",
    }

    client = get_http_client()
    url = f"{settings.nvidia_base_url.rstrip('/')}/embeddings"
    start = time.perf_counter()
    try:
        response = await client.post(url, json=payload, headers=headers)
    except Exception as exc:  # network / timeout
        raise UpstreamError(
            f"NVIDIA NIM embeddings request failed: {exc}",
            status_code=504,
            provider="nvidia-nim",
        ) from exc
    latency_ms = int((time.perf_counter() - start) * 1000)

    if response.status_code >= 400:
        raise UpstreamError(
            f"NVIDIA NIM embeddings error {response.status_code}: {response.text[:300]}",
            status_code=502,
            provider="nvidia-nim",
        )

    data = response.json()
    items = [
        EmbeddingItem(
            index=int(d.get("index", i)),
            embedding=[float(x) for x in (d.get("embedding") or [])],
        )
        for i, d in enumerate(data.get("data") or [])
    ]
    usage_raw = data.get("usage") or {}
    usage = ChatUsage(
        prompt_tokens=int(usage_raw.get("prompt_tokens", 0) or 0),
        total_tokens=int(usage_raw.get("total_tokens", 0) or 0),
    )
    return (
        EmbeddingResponse(
            model=str(data.get("model") or model),
            data=items,
            usage=usage,
        ),
        latency_ms,
    )
