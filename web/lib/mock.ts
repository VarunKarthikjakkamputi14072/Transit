import type { UsageSummary } from "./types";

export const MOCK_API_KEY = "af_8a72c1d349b04f0c91e7b6d2a4e51c63";

/** Example chat-completion payload shown in the docs (matches the live schema). */
export function mockChatCompletion() {
  return {
    model: "meta/llama-3.3-70b-instruct",
    content:
      "import httpx\n\nresponse = httpx.get(\"https://example.com\")\nprint(response.status_code)",
    usage: { prompt_tokens: 14, completion_tokens: 28, total_tokens: 42 },
    provider: "nvidia-nim",
  };
}

/**
 * Zeroed usage — the honest starting state for the dashboard/analytics.
 *
 * The pages render this until the live /api/analytics/usage fetch resolves, and
 * keep it if the backend is unreachable. We deliberately do NOT fabricate
 * traffic: the portal shows real numbers from request_logs + Redis, or zeros —
 * never invented charts.
 */
export function emptyUsage(): UsageSummary {
  const now = new Date();
  const hourly = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(now);
    d.setHours(now.getHours() - (23 - i), 0, 0, 0);
    return { hour: `${d.getHours().toString().padStart(2, "0")}:00`, requests: 0 };
  });
  return {
    today: 0,
    week: 0,
    hourly_limit: 100,
    remaining: 100,
    hourly,
    by_endpoint: [],
    recent: [],
    cache_hits: 0,
    cache_hit_rate: 0,
    tokens_saved: 0,
  };
}
