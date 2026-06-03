import type { EndpointId } from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_APIFORGE_BASE_URL?.replace(/\/$/, "") ?? "";

export const HAS_LIVE_BACKEND = API_BASE_URL.length > 0;

export type ApiResult<T> = {
  ok: boolean;
  status: number;
  latencyMs: number;
  data: T | null;
  raw: unknown;
  error?: string;
};

const ENDPOINT_PATHS: Record<EndpointId, (params: Record<string, string>) => string> = {
  weather: (p) => `/api/weather/${encodeURIComponent(p.city || "Berlin")}`,
  news: (p) => {
    const q = new URLSearchParams({ topic: p.topic || "ai", limit: p.limit || "5" });
    return `/api/news?${q.toString()}`;
  },
  finance: (p) => {
    const q = new URLSearchParams({ symbol: p.symbol || "AAPL" });
    return `/api/finance/quote?${q.toString()}`;
  },
  aggregate: (p) => {
    const q = new URLSearchParams({
      city: p.city || "Berlin",
      topic: p.topic || "ai",
    });
    return `/api/aggregate?${q.toString()}`;
  },
};

export function buildPath(endpoint: EndpointId, params: Record<string, string>): string {
  return ENDPOINT_PATHS[endpoint](params);
}

export async function callEndpoint<T = unknown>(
  endpoint: EndpointId,
  params: Record<string, string>,
  apiKey: string,
): Promise<ApiResult<T>> {
  const path = buildPath(endpoint, params);
  if (!HAS_LIVE_BACKEND) {
    return {
      ok: false,
      status: 0,
      latencyMs: 0,
      data: null,
      raw: null,
      error:
        "Live backend not configured. Set NEXT_PUBLIC_APIFORGE_BASE_URL to call the gateway.",
    };
  }

  const url = `${API_BASE_URL}${path}`;
  const started = performance.now();
  try {
    const response = await fetch(url, {
      headers: apiKey ? { "X-API-Key": apiKey } : undefined,
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - started);
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return {
      ok: response.ok,
      status: response.status,
      latencyMs,
      data: response.ok ? (parsed as T) : null,
      raw: parsed,
      error: response.ok
        ? undefined
        : `Upstream returned ${response.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latencyMs: Math.round(performance.now() - started),
      data: null,
      raw: null,
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
        email: `demo+${rand}@apiforge.dev`,
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
