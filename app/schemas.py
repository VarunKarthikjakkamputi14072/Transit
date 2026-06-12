"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# --- Auth ---------------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class RegisterResponse(BaseModel):
    id: int
    email: EmailStr
    tier: str
    api_key: str = Field(description="Plaintext API key. Shown ONCE at registration.")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class DeveloperOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    tier: str
    created_at: datetime


class APIKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key_prefix: str
    is_active: bool
    created_at: datetime
    last_used_at: Optional[datetime] = None


# --- LLM / chat completions (NVIDIA NIM backed) ------------------------------


class ChatMessage(BaseModel):
    role: str = Field(description="One of: system, user, assistant.")
    content: str


class ChatCompletionRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    model: Optional[str] = Field(
        default=None,
        description="Override the gateway's default NIM model. Optional.",
    )
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(default=512, ge=1, le=4096)


class ChatUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatCompletionResponse(BaseModel):
    model: str
    content: str
    usage: ChatUsage
    provider: str = "nvidia-nim"


# --- Errors -------------------------------------------------------------------


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    retry_after_seconds: Optional[int] = None
