# Load Test — Transit

Measures the gateway control-plane overhead (auth → rate-limit → logging), not
the LLM's generation time. Run with `NVIDIA_API_KEY` unset on the server so the
chat route short-circuits to a fast 503 *after* the full middleware path runs —
no real tokens burned, latency reflects the gateway itself.

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
| `auth_ramp` | gateway p99 under 200 concurrent users — collapses without the Redis key→tier cache | `middleware.py` keytier cache + `asyncio.to_thread` |
| `sustained` | steady-state gateway overhead at 30 VUs | all middleware fixes combined |

## What to look for in the summary

```
gateway_overhead_ms.........: p(99)=18ms   ← target <50ms (was ~340ms before fix)
rate_limit_429_total........: >0           ← rate limiter engaging once quota is hit
http_req_duration...........: p(95)<200ms
```

## Grafana

Open http://localhost:3000 while the test runs — request rate and p99 latency
update in real time. Screenshot the dashboard during `auth_ramp` (before vs.
after the Redis key→tier cache warms up) — that's the graph for the README.

## Saving results

```bash
k6 run docs/benchmarks/load_test.js \
  -e API_KEY=$API_KEY \
  -e BASE_URL=$BASE_URL \
  --out json=docs/benchmarks/results.json
```

Results JSON can be imported into Grafana or parsed for the README table.
