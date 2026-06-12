/**
 * Transit load test — k6
 *
 * Measures the GATEWAY control-plane overhead (auth → rate-limit → logging),
 * not the LLM's generation time. Run it with NVIDIA_API_KEY unset on the server:
 * the chat route then short-circuits to a fast 503 *after* the full auth +
 * rate-limit + middleware path has run — so the latency reflects the gateway
 * itself, with no real tokens burned.
 *
 * Two scenarios:
 *   1. auth_ramp  — 0→200 concurrent VUs (exposes the per-request DB key lookup)
 *   2. sustained  — steady 30 VUs (steady-state gateway overhead)
 *
 * Usage:
 *   k6 run docs/benchmarks/load_test.js \
 *     -e API_KEY=af_your_key_here \
 *     -e BASE_URL=http://localhost:8000
 *
 * Install k6:  brew install k6
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";

const gatewayLatency = new Trend("gateway_overhead_ms", true);
const rateLimitHits = new Counter("rate_limit_429_total");

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const API_KEY = __ENV.API_KEY || "af_replace_with_real_key";

export const options = {
  scenarios: {
    auth_ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "60s", target: 200 }, // DB key-lookup pressure shows here
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
      exec: "chatScenario",
      tags: { scenario: "auth_ramp" },
    },
    sustained: {
      executor: "constant-vus",
      vus: 30,
      duration: "60s",
      exec: "chatScenario",
      tags: { scenario: "sustained" },
      startTime: "130s",
    },
  },
  thresholds: {
    // Gateway overhead p99 under 50ms once the key→tier cache is warm.
    gateway_overhead_ms: ["p(99)<50"],
    // p95 end-to-end under 200ms.
    http_req_duration: ["p(95)<200"],
  },
};

const headers = {
  "X-API-Key": API_KEY,
  "Content-Type": "application/json",
};

const body = JSON.stringify({
  messages: [{ role: "user", content: "ping" }],
  max_tokens: 16,
});

/**
 * POST /api/v1/chat/completions — exercises the full auth + rate-limit + logging
 * middleware. With no server-side NVIDIA key the upstream short-circuits to 503,
 * so the measured latency is pure gateway overhead.
 */
export function chatScenario() {
  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/chat/completions`, body, { headers });
  gatewayLatency.add(Date.now() - start);

  check(res, {
    "responded": (r) => r.status > 0,
    "auth + middleware ran": (r) => r.status !== 0,
  });

  if (res.status === 429) rateLimitHits.add(1);
  sleep(0.1);
}
