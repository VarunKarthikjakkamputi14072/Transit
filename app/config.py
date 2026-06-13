"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for Transit.

    Values are read from environment variables (see `.env.example`).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    env: str = Field(default="development", alias="APIFORGE_ENV")

    secret_key: str = Field(default="dev-insecure-secret-change-me", alias="SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expire_minutes: int = Field(default=60, alias="JWT_EXPIRE_MINUTES")

    database_url: str = Field(
        default="sqlite:///./apiforge.db",
        alias="DATABASE_URL",
    )

    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # NVIDIA NIM (build.nvidia.com) — OpenAI-compatible inference backend for the
    # gateway's /api/v1/chat/completions route.
    nvidia_api_key: str = Field(default="", alias="NVIDIA_API_KEY")
    nvidia_base_url: str = Field(
        default="https://integrate.api.nvidia.com/v1", alias="NVIDIA_BASE_URL"
    )
    nvidia_model: str = Field(
        default="meta/llama-3.3-70b-instruct", alias="NVIDIA_MODEL"
    )
    nvidia_embedding_model: str = Field(
        default="nvidia/nv-embedqa-e5-v5", alias="NVIDIA_EMBEDDING_MODEL"
    )

    free_tier_requests_per_hour: int = Field(
        default=100, alias="FREE_TIER_REQUESTS_PER_HOUR"
    )
    pro_tier_requests_per_hour: int = Field(
        default=5000, alias="PRO_TIER_REQUESTS_PER_HOUR"
    )

    # Response cache TTLs (seconds). Identical chat/embedding requests within the
    # window are served from Redis — no upstream call, no tokens billed. This is
    # the cost-control core: RAG apps re-ask the same questions and re-embed the
    # same chunks constantly. 0 disables caching for that route.
    cache_ttl_chat: int = Field(default=86400, alias="CACHE_TTL_CHAT")
    cache_ttl_embeddings: int = Field(default=604800, alias="CACHE_TTL_EMBEDDINGS")

    upstream_timeout_seconds: float = Field(default=30.0, alias="UPSTREAM_TIMEOUT_SECONDS")


@lru_cache
def get_settings() -> Settings:
    return Settings()
