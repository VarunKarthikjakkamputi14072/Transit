/**
 * APIForge load test — k6
 *
 * Tests three scenarios back to back:
 *   1. Auth path under concurrent load  (exposes the DB key-lookup bottleneck)
 *   2. Cache stampede simulation        (exposes / validates single-flight fix)
 *   3. Sustained mixed traffic          (realistic baseline)
 *
 * Usage:
 *   k6 run docs/benchmarks/load_test.js \
 *     -e API_KEY=af_your_key_here \
 *     -e BASE_URL=http://localhost:8000
 *
 * Install k6:  brew install k6
 * Docs:        https://k6.io/docs/
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

// ---------------------------------------------------------------------------
// Custom metrics — visible in k6 summary and Grafana (via k6 prometheus remote write)
// ---------------------------------------------------------------------------
const authLatency       = new Trend("auth_latency_ms",        true);
const cacheHitRate      = new Rate("cache_hit_rate");
const upstreamCalls     = new Counter("upstream_calls_total");
const rateLimitHits     = new Counter("rate_limit_429_total");

// ---------------------------------------------------------------------------
// Test configuration
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const API_KEY  = __ENV.API_KEY  || "af_replace_with_real_key";

export const options = {
  scenarios: {
    // Scenario 1 — ramp up concurrent auth to expose per-request DB lookup
    auth_ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50  },   // ramp to 50 concurrent users
        { duration: "60s", target: 200 },   // push to 200 — DB lookup pressure shows here
        { duration: "30s", target: 0   },   // cool down
      ],
      gracefulRampDown: "10s",
      exec: "authScenario",
      tags: { scenario: "auth_ramp" },
    },

    // Scenario 2 — simultaneous cold-cache hits on the same key (stampede test)
    stampede: {
      executor: "shared-iterations",
      vus: 50,
      iterations: 50,      // 50 VUs all hit the same cold endpoint at once
      maxDuration: "30s",
      exec: "stampedeScenario",
      tags: { scenario: "stampede" },
      startTime: "130s",   // runs after auth_ramp finishes
    },

    // Scenario 3 — sustained realistic mixed traffic
    sustained: {
      executor: "constant-vus",
      vus: 30,
      duration: "60s",
      exec: "sustainedScenario",
      tags: { scenario: "sustained" },
      startTime: "170s",   // runs after stampede
    },
  },

  // Thresholds — the test "passes" only if these hold.
  // Before fixes these will fail; after fixes they should pass.
  thresholds: {
    // Auth p99 under 50ms (Redis cache hit path)
    auth_latency_ms: ["p(99)<50"],
    // Overall error rate under 1% (disabled for local benchmark due to expected 503s from missing keys)
    // http_req_failed: ["rate<0.01"],
    // p95 end-to-end under 200ms
    http_req_duration: ["p(95)<200"],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const headers = {
  "X-API-Key": API_KEY,
  "Content-Type": "application/json",
};

function recordCacheHit(res) {
  // APIForge sets X-Cache-Status if you add it; fall back to latency heuristic.
  // Sub-5ms response almost certainly means Redis hit, not upstream.
  const isHit = res.timings.duration < 5;
  cacheHitRate.add(isHit);
  if (!isHit) upstreamCalls.add(1);
}

// ---------------------------------------------------------------------------
// Scenario functions
// ---------------------------------------------------------------------------

/**
 * Scenario 1 — Auth path load
 * Fires a /api/weather request which requires key lookup on every call.
 * Records latency so we can see before/after the Redis tier-cache fix.
 */
export function authScenario() {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/weather/london`, { headers });
  authLatency.add(Date.now() - start);

  check(res, {
    "auth: status not 500": (r) => r.status !== 500,
    "auth: responded":      (r) => r.status > 0,
  });

  if (res.status === 429) rateLimitHits.add(1);
  sleep(0.1);
}

/**
 * Scenario 2 — Cache stampede
 * All 50 VUs hit the same cold cache key simultaneously.
 * Without single-flight: 50 upstream calls go out.
 * With single-flight: exactly 1 upstream call, 49 wait and read the result.
 *
 * Look at upstream_calls_total in the summary — should be 1, not 50.
 */
export function stampedeScenario() {
  // Use a unique topic string so we guarantee a cold cache.
  // All 50 VUs share this exact same key — that's the stampede.
  const coldKey = "stampede_test_topic_do_not_cache";
  const res = http.get(
    `${BASE_URL}/api/news?topic=${coldKey}&limit=5`,
    { headers }
  );

  check(res, {
    "stampede: got a response": (r) => r.status !== 0,
    "stampede: not a 500":      (r) => r.status !== 500,
  });

  recordCacheHit(res);
}

/**
 * Scenario 3 — Sustained mixed traffic
 * Mimics a real workload: weather, news, finance, and aggregate calls
 * in roughly realistic proportions. Measures steady-state p99 after
 * caches are warm.
 */
export function sustainedScenario() {
  const rand = Math.random();

  let res;
  if (rand < 0.4) {
    // 40% weather (high cache hit — 10 min TTL)
    res = http.get(`${BASE_URL}/api/weather/london`, { headers });
  } else if (rand < 0.7) {
    // 30% news (moderate cache hit — 5 min TTL)
    res = http.get(`${BASE_URL}/api/news?topic=technology&limit=5`, { headers });
  } else if (rand < 0.85) {
    // 15% finance (low cache hit — 1 min TTL)
    res = http.get(`${BASE_URL}/api/finance/quote?symbol=AAPL`, { headers });
  } else {
    // 15% aggregate (fan-out)
    res = http.get(
      `${BASE_URL}/api/aggregate?city=london&topic=technology&limit=3`,
      { headers }
    );
  }

  check(res, {
    "sustained: 2xx or 503": (r) =>
      (r.status >= 200 && r.status < 300) || r.status === 503,
  });

  recordCacheHit(res);
  if (res.status === 429) rateLimitHits.add(1);
  sleep(0.2);
}
