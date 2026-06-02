# Load Test — APIForge

Three scenarios that prove the performance fixes aren't theoretical.

## Setup

```bash
# Install k6
brew install k6

# Start the stack
docker compose up -d

# Register a developer + get an API key via the portal or API
# Then:
export API_KEY=af_your_key_here
export BASE_URL=http://localhost:8000
```

## Run

```bash
k6 run docs/benchmarks/load_test.js \
  -e API_KEY=$API_KEY \
  -e BASE_URL=$BASE_URL
```

## What each scenario measures

| Scenario | What it finds | Fixed by |
|---|---|---|
| `auth_ramp` | p99 latency under 200 concurrent users — collapses without Redis key→tier cache | `middleware.py` keytier cache |
| `stampede` | `upstream_calls_total` — should be 1 not 50 on cold cache | `cache.py` single-flight lock |
| `sustained` | Steady-state p95 with warm caches | All fixes combined |

## What to look for in the summary

```
auth_latency_ms.............: p(99)=18ms   ← target <50ms (was ~340ms before fix)
upstream_calls_total........: 1            ← stampede test: 50 VUs, 1 upstream call
cache_hit_rate..............: 94%          ← sustained: caches working
http_req_failed.............: 0.00%        ← circuit breaker not tripping on healthy upstream
```

## Grafana

Open http://localhost:3000 while the test runs — the request rate, p99 latency,
and circuit breaker state update in real time. Screenshot the dashboard during
`auth_ramp` (before and after the Redis cache warms up) — that's the graph that
goes in the README.

## Saving results

```bash
k6 run docs/benchmarks/load_test.js \
  -e API_KEY=$API_KEY \
  -e BASE_URL=$BASE_URL \
  --out json=docs/benchmarks/results.json
```

Results JSON can be imported into Grafana or parsed for the README table.
