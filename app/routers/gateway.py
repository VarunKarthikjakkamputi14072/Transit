"""Gateway routes — AI chat completions backed by NVIDIA NIM."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Request

from app.deps import require_api_key
from app.models import APIKey
from app.schemas import ChatCompletionRequest, ChatCompletionResponse
from app.upstream.base import UpstreamError
from app.upstream.llm import fetch_chat_completion

router = APIRouter(prefix="/api", tags=["gateway"])


def _record_upstream_latency(request: Request, latency_ms: int) -> None:
    """Stash upstream latency on `request.state` so the middleware can log it."""
    request.state.upstream_latency_ms = (
        getattr(request.state, "upstream_latency_ms", 0) or 0
    ) + latency_ms


@router.post("/v1/chat/completions", response_model=ChatCompletionResponse)
async def chat_completions(
    request: Request,
    body: ChatCompletionRequest = Body(...),
    api_key: APIKey = Depends(require_api_key),
) -> ChatCompletionResponse:
    """OpenAI-compatible chat completion, backed by NVIDIA NIM.

    The upstream NVIDIA_API_KEY never leaves the server — clients authenticate
    with their Transit `af_` key, and the rate-limit middleware meters every
    call against their tier quota. Responses are intentionally NOT cached:
    each completion is unique and must count against the caller's quota.
    """
    try:
        completion, latency_ms = await fetch_chat_completion(body)
    except UpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    _record_upstream_latency(request, latency_ms)
    return completion
