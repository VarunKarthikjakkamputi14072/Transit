# APIForge

APIForge is a developer-facing API gateway that unifies third-party APIs
(OpenWeather · NewsAPI · Alpha Vantage) behind one rate-limited, authenticated,
analytics-rich REST endpoint.

The project is split into two stacks that live in this monorepo:

| Stack | Path | Purpose |
| --- | --- | --- |
| **Gateway** | `app/`, `tests/` | FastAPI + SQLAlchemy + Redis + httpx — the API itself (auth, rate limiting, caching, analytics, normalization). |
| **Developer portal** | [`web/`](./web/README.md) | Next.js 14 + Tailwind dashboard — landing, dashboard, interactive explorer, analytics, docs. |

## Developer portal (this PR)

A dark, terminal-themed developer console built with Next.js 14 (App Router,
TypeScript) and Tailwind CSS.

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

## License

MIT
