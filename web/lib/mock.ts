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

export function mockUsage(): UsageSummary {
  const now = new Date();
  const hourly = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(now);
    d.setHours(now.getHours() - (23 - i), 0, 0, 0);
    const base = 8 + Math.sin(i / 2.5) * 6 + (i % 5);
    return {
      hour: `${d.getHours().toString().padStart(2, "0")}:00`,
      requests: Math.max(0, Math.round(base + Math.random() * 4)),
    };
  });
  const today = hourly.reduce((a, b) => a + b.requests, 0);
  const week = today * 6 + 42;

  const recent = Array.from({ length: 12 }, (_, i) => {
    const statuses = [200, 200, 200, 200, 429, 200, 200, 502];
    const latency = [820, 1240, 695, 1410, 88, 1670, 980, 745];
    return {
      id: `req_${i}`,
      endpoint: "/api/v1/chat/completions",
      status: statuses[i % statuses.length],
      latency_ms: latency[i % latency.length] + (i % 3) * 25,
      timestamp: new Date(now.getTime() - i * 3 * 60 * 1000).toISOString(),
    };
  });

  return {
    today,
    week,
    hourly_limit: 100,
    remaining: Math.max(0, 100 - hourly[hourly.length - 1].requests),
    hourly,
    by_endpoint: [
      { endpoint: "/api/v1/chat/completions", requests: 286 },
      { endpoint: "/auth/register", requests: 34 },
    ],
    recent,
  };
}
