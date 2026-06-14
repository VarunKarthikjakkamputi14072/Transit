"""Tests for the chat provider waterfall (NVIDIA → Groq → OpenRouter → Gemini)."""

from __future__ import annotations

import pytest

from app.config import get_settings
from app.schemas import ChatCompletionRequest, ChatMessage
from app.upstream import llm
from app.upstream.base import UpstreamError


class _FakeResponse:
    def __init__(self, status_code: int, data: dict | None = None):
        self.status_code = status_code
        self._data = data or {}
        self.text = "error body"

    def json(self) -> dict:
        return self._data


def _good_body(model: str) -> dict:
    return {
        "model": model,
        "choices": [{"message": {"content": f"served by {model}"}}],
        "usage": {"prompt_tokens": 3, "completion_tokens": 4, "total_tokens": 7},
    }


def _req() -> ChatCompletionRequest:
    return ChatCompletionRequest(messages=[ChatMessage(role="user", content="hi")])


def _providers_order():
    return [n for (n, *_rest) in llm._chat_providers(get_settings())]


def test_provider_chain_includes_only_configured(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "nvidia_api_key", "k-nvidia")
    monkeypatch.setattr(s, "groq_api_key", "k-groq")
    monkeypatch.setattr(s, "openrouter_api_key", "")
    monkeypatch.setattr(s, "gemini_api_key", "")
    assert _providers_order() == ["nvidia-nim", "groq"]


@pytest.mark.asyncio
async def test_waterfall_falls_through_to_groq_when_nvidia_errors(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "nvidia_api_key", "k-nvidia")
    monkeypatch.setattr(s, "groq_api_key", "k-groq")
    monkeypatch.setattr(s, "openrouter_api_key", "")
    monkeypatch.setattr(s, "gemini_api_key", "")

    calls: list[str] = []

    class FakeClient:
        async def post(self, url, json=None, headers=None):
            calls.append(url)
            if "nvidia" in url or "integrate.api.nvidia" in url:
                return _FakeResponse(503)  # primary down
            return _FakeResponse(200, _good_body("groq-llama"))

    monkeypatch.setattr(llm, "get_http_client", lambda: FakeClient())

    completion, latency = await llm.fetch_chat_completion(_req())
    assert completion.provider == "groq"  # fell through to the fallback
    assert "groq-llama" in completion.content
    assert len(calls) == 2  # tried nvidia first, then groq


@pytest.mark.asyncio
async def test_waterfall_raises_when_all_providers_fail(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "nvidia_api_key", "k-nvidia")
    monkeypatch.setattr(s, "groq_api_key", "k-groq")
    monkeypatch.setattr(s, "openrouter_api_key", "")
    monkeypatch.setattr(s, "gemini_api_key", "")

    class FakeClient:
        async def post(self, url, json=None, headers=None):
            return _FakeResponse(500)

    monkeypatch.setattr(llm, "get_http_client", lambda: FakeClient())

    with pytest.raises(UpstreamError) as exc:
        await llm.fetch_chat_completion(_req())
    assert "All chat providers failed" in str(exc.value)
