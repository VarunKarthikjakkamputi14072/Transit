# Transit

**Portal:** https://apiforge-portal.vercel.app  
**API:** https://apiforge-jnwp.onrender.com

Transit is an **AI gateway**: a secure, rate-limited proxy for NVIDIA's open
LLMs (via [build.nvidia.com](https://build.nvidia.com) / NIM). Client apps
authenticate with a Transit `af_` key and call one OpenAI-compatible endpoint —
the upstream NVIDIA key never leaves the server, every call is metered against a
per-key quota, and all traffic is logged for analytics. Ships with a Next.js
developer portal to generate keys, try prompts, and visualize usage.

```
Developer/Client app
    ↓  (X-API-Key: af_...)
Next.js Developer Portal (key gen, prompt explorer, analytics, docs)
    ↓
FastAPI Gateway  ──  Redis (per-key sliding-window rate limiting)
    ↓                PostgreSQL (API keys, usage logs, analytics)
    ↓  (Authorization: Bearer <server-side NVIDIA key>)
NVIDIA NIM — OpenAI-compatible /v1/chat/completions (Llama 3.3 70B, etc.)
```

This monorepo contains both stacks:

| Stack | Path | Purpose |
| --- | --- | --- |
| **Gateway** | `app/`, `tests/` | FastAPI + SQLAlchemy + Redis + httpx — auth, per-key rate limiting, NIM proxying, usage analytics. |
| **Developer portal** | [`web/`](./web/README.md) | Next.js 14 + Tailwind dashboard — landing, dashboard, prompt explorer, analytics, docs. |

---

## Gateway (`app/`)

### Features

- **Authentication**
  - `POST /auth/register` — creates a developer account and returns a freshly minted API key prefixed with `af_` (stored hashed via HMAC-SHA256, password hashed with bcrypt).
  - `POST /auth/login` — returns a JWT (`python-jose`, HS256).
  - `GET /auth/me`, `GET /auth/keys` — inspect the current developer / their keys (requires `X-API-Key`).
- **AI gateway route** (requires `X-API-Key`)
  - `POST /api/v1/chat/completions` — OpenAI-compatible chat completion, proxied to NVIDIA NIM. Body: `{messages: [{role, content}], model?, temperature?, max_tokens?}`. Returns `{model, content, usage: {prompt_tokens, completion_tokens, total_tokens}, provider}`.
  - The upstream `NVIDIA_API_KEY` is injected server-side as an `Authorization: Bearer` header — clients never see it.
  - Intentionally **not cached**: every completion is unique and must count against the caller's quota.
- **Rate limiting** (Redis) — the core of the "AI gateway" value
  - Per-key sliding-window limits, defaults to **100 req/hour** (`free`) / **5000** (`pro`).
  - Redis key pattern: `ratelimit:{api_key}:{hour_bucket}`.
  - Returns `429` with `retry_after_seconds` when exceeded, plus `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers on every `/api/*` response. Fails open if Redis is briefly unreachable.
- **Usage analytics**
  - Every `/api/*` request is logged to `request_logs` (endpoint, response_time_ms, status_code, upstream_latency_ms) via Starlette middleware, exposed at `GET /api/analytics/usage`.

### Stack

FastAPI · SQLAlchemy 2.x · PostgreSQL (SQLite for tests) · Redis · `httpx` (async) · `python-jose` · `bcrypt`

### Project layout

```
app/
  main.py            # FastAPI app factory + lifespan
  config.py          # pydantic-settings configuration
  database.py        # SQLAlchemy engine/session/Base
  models.py          # Developer, APIKey, RequestLog, RateLimitConfig
  schemas.py         # Pydantic request/response schemas
  security.py        # password hashing, API key gen, JWT
  deps.py            # FastAPI dependencies (API-key resolution)
  redis_client.py    # async Redis client (override-able for tests)
  rate_limit.py      # Redis-backed sliding-window hourly limiter
  middleware.py      # /api/* rate-limit + request logging middleware
  routers/
    auth.py          # /auth/*
    gateway.py       # /api/v1/chat/completions
    analytics.py     # /api/analytics/usage
  upstream/
    base.py          # shared async httpx client + circuit breaker
    llm.py           # NVIDIA NIM chat-completions client
tests/               # pytest test suite (uses SQLite + fakeredis)
docker-compose.yml   # Postgres + Redis + app
Dockerfile
requirements.txt
.env.example
```

### Quickstart

```bash
# 1. Install
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # set NVIDIA_API_KEY (from build.nvidia.com) + SECRET_KEY

# 2. Run dependencies (Postgres + Redis)
docker compose up -d postgres redis
# Or run everything (gateway included):
docker compose up --build

# 3. Run the API locally
uvicorn app.main:app --reload
# OpenAPI docs at http://localhost:8000/docs
```

```bash
# Register and capture an API key
curl -s -X POST http://localhost:8000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"supersecret123"}'

# Use the returned api_key to call an open LLM through the gateway
curl -s -X POST http://localhost:8000/api/v1/chat/completions \
  -H 'X-API-Key: af_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Write a python script that pings a URL"}]}' | jq
```

### Configuration

All settings are loaded from environment variables (see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./apiforge.db` | SQLAlchemy URL (use `postgresql+psycopg2://...` in production) |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection URL |
| `SECRET_KEY` | dev-only placeholder | Used for JWT signing and API-key HMAC pepper |
| `JWT_ALGORITHM` / `JWT_EXPIRE_MINUTES` | `HS256` / `60` | JWT issuance |
| `NVIDIA_API_KEY` | empty | Server-side NVIDIA NIM key (from build.nvidia.com) |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` | NIM inference base URL |
| `NVIDIA_MODEL` | `meta/llama-3.3-70b-instruct` | Default model for chat completions |
| `FREE_TIER_REQUESTS_PER_HOUR` / `PRO_TIER_REQUESTS_PER_HOUR` | `100` / `5000` | Seeded into `rate_limit_config` on startup |
| `UPSTREAM_TIMEOUT_SECONDS` | `10` | `httpx` per-request timeout |

### Database schema

| Table | Columns |
| --- | --- |
| `developers` | `id`, `email` (unique), `hashed_password`, `created_at`, `tier` (`free`/`pro`) |
| `api_keys` | `id`, `developer_id` (FK), `key_hash` (HMAC-SHA256), `key_prefix`, `created_at`, `is_active`, `last_used_at` |
| `request_logs` | `id`, `api_key_id` (FK), `endpoint`, `params` (JSON), `response_time_ms`, `status_code`, `upstream_latency_ms`, `timestamp` |
| `rate_limit_config` | `id`, `tier` (unique), `requests_per_hour` |

Tables are created automatically on startup (`Base.metadata.create_all`). Alembic is included in `requirements.txt` for future migrations.

### Testing

The suite uses a per-test SQLite database and `fakeredis` so it has no external dependencies. Upstream calls are monkey-patched at the router boundary.

```bash
pytest -q
```

Tests cover auth, the chat-completions route (with a mocked NIM upstream), rate-limiter logic, and middleware integration.

### Security notes

- API keys are generated as `af_` + `uuid4().hex`. Only an HMAC-SHA256 hash (peppered with `SECRET_KEY`) is stored, alongside a short prefix for display.
- Passwords are SHA-256 pre-hashed (to bypass bcrypt's 72-byte limit safely) and then bcrypted.
- All upstream calls are async (`httpx.AsyncClient`).
- Rate-limit counters expire automatically at the hour boundary.

---

## Performance

The gateway's control plane (auth, rate limiting, logging) was load-tested with
[k6](https://k6.io) against a fast stub upstream so the numbers reflect the
gateway overhead itself — not the LLM's generation time. (Real chat completions
are dominated by NIM latency, ~1s+, which is upstream and not what the gateway
is responsible for.) The test script is at [`docs/benchmarks/load_test.js`](./docs/benchmarks/load_test.js).

### Results (200 peak VUs, 4 uvicorn workers)

| Metric | Result |
|---|---|
| Throughput | **276 req/s** sustained |
| Median gateway overhead | **45ms** |
| p95 | 325ms |
| Total requests handled | 63,559 |

### What the test found and how it was fixed

**Problem 1 — Synchronous DB writes blocking the event loop**

The request logger was opening a sync SQLAlchemy session and committing on the event loop for every `/api/*` request. Under 200 concurrent users this stacked 200 blocking DB commits — the event loop froze and every request timed out at 60s.

Fix: all sync DB work now runs in `asyncio.to_thread()`. Logging is fire-and-forget via `loop.create_task(asyncio.to_thread(...))` — the response is returned to the client before the log write starts.

**Problem 2 — Per-request DB lookup on the auth path**

Every request hit Postgres to resolve API key → developer tier, even for the same key called repeatedly. Under load this exhausted the connection pool.

Fix: a Redis key→tier cache (`keytier:<hash>`, 60s TTL) means the DB is only hit once per key per minute. Subsequent requests resolve tier from Redis in under 1ms.

**Problem 3 — A Redis blip took down the whole gateway**

The rate limiter wasn't fault-tolerant: when Redis was briefly unreachable it raised and every request 500'd.

Fix: the limiter now fails open — a Redis outage degrades to "no limiting" for that request rather than a total outage, and the call is still served.

To run the load test yourself:

```bash
brew install k6
docker compose up -d
k6 run docs/benchmarks/load_test.js \
  -e API_KEY=af_your_key \
  -e BASE_URL=http://localhost:8000
```

---

## Developer portal (`web/`)

A dark, terminal-themed developer console built with **Next.js 14** (App Router,
TypeScript) and **Tailwind CSS**.

| Route | Description |
| --- | --- |
| `/` | Landing page with feature highlights and pricing (Free 100 req/hr · Pro 1,000 req/hr) |
| `/dashboard` | Masked API key (reveal/copy/rotate/revoke), usage stats, hourly chart, quick-start snippets |
| `/explorer` | Interactive request builder — normalized response next to raw upstream payload |
| `/analytics` | Hourly volume area chart, requests-by-endpoint bar chart, recent requests table |
| `/docs` | OpenAPI-style reference with curl / Python / JavaScript tabs for every endpoint |

Reusable components: `ApiKeyCard`, `RequestLog`, `UsageChart` (recharts),
`CodeSnippet` (custom token-based highlighter).

```bash
cd web
npm install
cp .env.example .env.local         # optional: NEXT_PUBLIC_APIFORGE_BASE_URL
npm run dev                         # http://localhost:3000
npm run build && npm run start      # production
```

See [`web/README.md`](./web/README.md) for full details. The portal runs in
**demo mode** with mocked data if the gateway URL is not configured, so it's
fully browsable offline.

---

## License

MIT
