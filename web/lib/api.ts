export const API_BASE_URL =
  process.env.NEXT_PUBLIC_APIFORGE_BASE_URL?.replace(/\/$/, "") ?? "";

export const HAS_LIVE_BACKEND = API_BASE_URL.length > 0;

export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

export type ChatResult = {
  ok: boolean;
  status: number;
  latencyMs: number;
  content: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  rateLimit: { limit: number | null; remaining: number | null };
  error?: string;
};

/**
 * Call the gateway's NVIDIA-NIM-backed chat completion endpoint.
 * Returns the assistant message plus the X-RateLimit-* headers so the UI can
 * show the caller's quota dropping with every request.
 */
export async function callChat(
  messages: ChatTurn[],
  apiKey: string,
  opts?: { temperature?: number; maxTokens?: number },
): Promise<ChatResult> {
  const empty: ChatResult = {
    ok: false,
    status: 0,
    latencyMs: 0,
    content: "",
    model: "",
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    rateLimit: { limit: null, remaining: null },
  };

  if (!HAS_LIVE_BACKEND) {
    return {
      ...empty,
      error:
        "Live backend not configured. Set NEXT_PUBLIC_APIFORGE_BASE_URL to call the gateway.",
    };
  }

  const started = performance.now();
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      cache: "no-store",
      body: JSON.stringify({
        messages,
        temperature: opts?.temperature ?? 0.2,
        max_tokens: opts?.maxTokens ?? 512,
      }),
    });
    const latencyMs = Math.round(performance.now() - started);
    const limitH = response.headers.get("X-RateLimit-Limit");
    const remainingH = response.headers.get("X-RateLimit-Remaining");
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      return {
        ...empty,
        status: response.status,
        latencyMs,
        rateLimit: {
          limit: limitH ? Number(limitH) : null,
          remaining: remainingH ? Number(remainingH) : null,
        },
        error:
          (parsed.detail as string) ||
          (parsed.error as string) ||
          `Gateway returned ${response.status}`,
      };
    }

    const usage = (parsed.usage as ChatResult["usage"]) ?? empty.usage;
    return {
      ok: true,
      status: response.status,
      latencyMs,
      content: String(parsed.content ?? ""),
      model: String(parsed.model ?? ""),
      usage,
      rateLimit: {
        limit: limitH ? Number(limitH) : null,
        remaining: remainingH ? Number(remainingH) : null,
      },
    };
  } catch (err) {
    return {
      ...empty,
      latencyMs: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : "Unknown network error",
    };
  }
}

/**
 * Fetch real usage analytics from the backend's /api/analytics/usage endpoint.
 * Returns a normalized UsageSummary, or null if there's no live backend or the
 * request fails (callers fall back to mock data in that case).
 *
 * The endpoint returns global gateway traffic (today/week/hourly/by_endpoint/
 * recent) read from the request_logs table — i.e. real requests this gateway
 * has served.
 */
export async function fetchUsage(
  period: "24h" | "7d" | "30d" = "24h",
): Promise<import("./types").UsageSummary | null> {
  if (!HAS_LIVE_BACKEND) return null;
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/analytics/usage?period=${period}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const d = await res.json();
    const recent = (d.recent ?? []).map(
      (r: Record<string, unknown>, i: number) => ({
        id: String(r.timestamp ?? i),
        endpoint: String(r.endpoint ?? ""),
        status: Number(r.status ?? 0),
        latency_ms: Number(r.latency_ms ?? 0),
        timestamp: String(r.timestamp ?? ""),
      }),
    );
    return {
      today: Number(d.today ?? 0),
      week: Number(d.week ?? 0),
      hourly_limit: 100,
      remaining: 0,
      hourly: d.hourly ?? [],
      by_endpoint: d.by_endpoint ?? [],
      recent,
    };
  } catch {
    return null;
  }
}

/**
 * Register a developer against the live backend and return a real `af_` API key.
 * Used by the dashboard's "Generate API key" action so the key shown is a real,
 * working credential (not a mock). Returns null if there's no live backend or
 * the request fails.
 *
 * The portal has no login, so each generate creates a fresh throwaway developer
 * account; the returned key is persisted client-side (localStorage) and works
 * against every /api/* endpoint.
 */
export async function registerDeveloper(): Promise<{ apiKey: string; tier: string } | null> {
  if (!HAS_LIVE_BACKEND) return null;
  const rand = Math.random().toString(36).slice(2, 10);
  try {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `demo+${rand}@transitapi.dev`,
        password: `demo-${rand}-${Math.random().toString(36).slice(2, 10)}`,
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d.api_key) return null;
    return { apiKey: String(d.api_key), tier: String(d.tier ?? "free") };
  } catch {
    return null;
  }
}
