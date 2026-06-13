"use client";

import { useMemo, useState } from "react";
import { Play, Terminal } from "lucide-react";
import { CodeSnippet } from "@/components/CodeSnippet";
import { useApiKey } from "@/lib/apiKey";
import {
  API_BASE_URL,
  HAS_LIVE_BACKEND,
  callChat,
  type ChatResult,
} from "@/lib/api";
import { MOCK_API_KEY } from "@/lib/mock";
import { buildChatSnippets } from "@/lib/snippets";

const SAMPLE_PROMPTS = [
  "Write a python script that pings a URL and prints the latency.",
  "Explain what an API gateway does in two sentences.",
  "Write a SQL query that finds the top 5 endpoints by request count.",
];

export default function ExplorerPage() {
  const { apiKey, hydrated } = useApiKey();
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0]);
  const [temperature, setTemperature] = useState("0.2");
  const [maxTokens, setMaxTokens] = useState("512");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChatResult | null>(null);

  const effectiveKey = hydrated && apiKey ? apiKey : "";
  const baseUrl = HAS_LIVE_BACKEND ? API_BASE_URL : "https://api.transitapi.dev";

  const snippets = useMemo(
    () =>
      buildChatSnippets({
        baseUrl,
        apiKey: effectiveKey || MOCK_API_KEY,
      }),
    [baseUrl, effectiveKey],
  );

  async function run() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    const res = await callChat(
      [{ role: "user", content: prompt.trim() }],
      effectiveKey,
      {
        temperature: Number(temperature) || 0.2,
        maxTokens: Number(maxTokens) || 512,
      },
    );
    setResult(res);
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <div className="section-title">Explorer</div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-50">
          Try the AI gateway
        </h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Send a prompt to <span className="mono">POST /api/v1/chat/completions</span>.
          Transit forwards it to NVIDIA NIM with the server-side key and meters
          the call against your quota. <span className="text-slate-300">Send the
          same prompt twice</span> — the second returns <span className="mono">CACHE
          HIT</span> from Redis, instantly, billing zero tokens.
        </p>
      </header>

      {!HAS_LIVE_BACKEND && (
        <div className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <strong className="font-semibold">Demo mode.</strong>{" "}
          <span className="text-amber-200/90">
            Set <span className="mono">NEXT_PUBLIC_APIFORGE_BASE_URL</span> to call
            the live gateway.
          </span>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Request panel */}
        <section className="panel">
          <header className="panel-header">
            <div className="flex items-center gap-2">
              <span className="badge mono bg-sky-500/15 text-sky-300">POST</span>
              <span className="mono text-sm text-slate-100">
                /api/v1/chat/completions
              </span>
            </div>
          </header>
          <div className="space-y-4 px-4 py-4">
            <div>
              <label className="label mb-1 block" htmlFor="prompt">
                Prompt
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                className="w-full rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-sm text-slate-100 outline-none focus:border-terminal-accent"
                placeholder="Write a python script that..."
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {SAMPLE_PROMPTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPrompt(s)}
                    className="rounded-full border border-terminal-border px-3 py-1 text-xs text-slate-400 transition hover:border-terminal-accent hover:text-terminal-accent"
                  >
                    {s.length > 44 ? `${s.slice(0, 44)}…` : s}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label mb-1 block" htmlFor="temperature">
                  Temperature (0–2)
                </label>
                <input
                  id="temperature"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="w-full rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-sm text-slate-100 outline-none focus:border-terminal-accent"
                />
              </div>
              <div>
                <label className="label mb-1 block" htmlFor="max-tokens">
                  Max tokens (1–4096)
                </label>
                <input
                  id="max-tokens"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                  className="w-full rounded-md border border-terminal-border bg-terminal-bg px-3 py-2 text-sm text-slate-100 outline-none focus:border-terminal-accent"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={run}
              disabled={loading || !prompt.trim()}
              className="btn-primary w-full"
            >
              <Play className="h-4 w-4" />
              {loading ? "Calling NIM…" : "Send request"}
            </button>

            {!effectiveKey && (
              <p className="text-xs text-slate-500">
                No API key yet — generate one on the{" "}
                <a className="text-terminal-accent hover:underline" href="/dashboard">
                  Dashboard
                </a>{" "}
                first.
              </p>
            )}

            <CodeSnippet title="Request" tabs={snippets} />
          </div>
        </section>

        {/* Response panel */}
        <section className="panel">
          <header className="panel-header">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-terminal-accent" />
              <h3 className="text-sm font-semibold text-slate-100">Response</h3>
            </div>
            {result && (
              <span className="flex items-center gap-2 text-xs text-slate-500">
                {result.ok && (
                  <span
                    className={`badge mono ${
                      result.cached
                        ? "bg-terminal-accentDim/40 text-terminal-accent"
                        : "bg-slate-500/15 text-slate-300"
                    }`}
                    title={
                      result.cached
                        ? "Served from Redis — 0 tokens billed"
                        : "Forwarded to NVIDIA NIM"
                    }
                  >
                    {result.cached ? "CACHE HIT" : "CACHE MISS"}
                  </span>
                )}
                <span>
                  <span
                    className={`mono ${
                      result.ok ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {result.status || "ERR"}
                  </span>{" "}
                  · {result.latencyMs}ms
                  {result.rateLimit.remaining !== null && (
                    <>
                      {" "}
                      · quota {result.rateLimit.remaining}/{result.rateLimit.limit}
                    </>
                  )}
                </span>
              </span>
            )}
          </header>
          <div className="px-4 py-4">
            {!result ? (
              <p className="py-12 text-center text-sm text-slate-500">
                Send a prompt to see the completion, token usage, latency, and
                rate-limit headers.
              </p>
            ) : result.ok ? (
              <div className="space-y-4">
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-terminal-border bg-terminal-bg px-3 py-3 text-sm text-slate-100">
                  {result.content}
                </pre>
                <div className="grid grid-cols-3 gap-3 text-center text-xs">
                  <Meta label="Model" value={result.model} />
                  <Meta
                    label="Tokens"
                    value={String(result.usage.total_tokens)}
                  />
                  <Meta label="Latency" value={`${result.latencyMs}ms`} />
                </div>
              </div>
            ) : (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-red-900/50 bg-terminal-bg px-3 py-3 text-sm text-red-300">
                {result.error || `Request failed with status ${result.status}`}
              </pre>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-terminal-border bg-terminal-bg px-2 py-2">
      <div className="label">{label}</div>
      <div className="mono mt-1 truncate text-slate-200" title={value}>
        {value}
      </div>
    </div>
  );
}
