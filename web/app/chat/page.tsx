"use client";

import { useRef, useState } from "react";
import { Send, Sparkles, Cpu, Gauge, Timer } from "lucide-react";
import { useApiKey } from "@/lib/apiKey";
import { callChat, HAS_LIVE_BACKEND, type ChatTurn } from "@/lib/api";

type Turn = ChatTurn & { id: string };

const SUGGESTIONS = [
  "Explain what an API gateway does in two sentences.",
  "Write a haiku about rate limiting.",
  "Summarize the tradeoffs of caching at the gateway.",
];

export default function ChatPage() {
  const { apiKey, hydrated } = useApiKey();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<{
    model: string;
    latencyMs: number;
    totalTokens: number;
    limit: number | null;
    remaining: number | null;
    status: number;
    error?: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || loading) return;

    const userTurn: Turn = { id: crypto.randomUUID(), role: "user", content: prompt };
    const history: ChatTurn[] = [...turns, userTurn].map(({ role, content }) => ({
      role,
      content,
    }));
    setTurns((t) => [...t, userTurn]);
    setInput("");
    setLoading(true);

    const result = await callChat(history, apiKey, { temperature: 0.3, maxTokens: 512 });

    setMeta({
      model: result.model,
      latencyMs: result.latencyMs,
      totalTokens: result.usage.total_tokens,
      limit: result.rateLimit.limit,
      remaining: result.rateLimit.remaining,
      status: result.status,
      error: result.error,
    });

    if (result.ok) {
      setTurns((t) => [
        ...t,
        { id: crypto.randomUUID(), role: "assistant", content: result.content },
      ]);
    } else {
      setTurns((t) => [
        ...t,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `⚠️ ${result.error ?? "Request failed."}`,
        },
      ]);
    }
    setLoading(false);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const pct =
    meta?.limit && meta.remaining !== null
      ? Math.max(0, Math.min(100, (meta.remaining / meta.limit) * 100))
      : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <div className="section-title flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-terminal-accent" />
          AI Chat
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-50">
          Inference through the gateway
        </h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Every message is a real <span className="mono text-slate-300">POST /api/v1/chat/completions</span>{" "}
          call, authenticated with your API key, metered against your rate limit, and
          served by an NVIDIA NIM model. Watch your quota drop on the right.
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr,320px]">
        {/* Chat column */}
        <section className="panel flex h-[560px] flex-col">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-terminal-accent" />
              <span className="mono text-sm text-slate-100">
                {meta?.model || "meta/llama-3.3-70b-instruct"}
              </span>
            </div>
            <span className="badge bg-emerald-500/15 text-emerald-300">NVIDIA NIM</span>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-auto px-4 py-4">
            {turns.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <p className="text-sm text-slate-500">
                  Start a conversation — your API key authorizes each call.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="btn-ghost text-xs"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t) => (
              <div
                key={t.id}
                className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
                    t.role === "user"
                      ? "bg-terminal-accent/15 text-slate-100 ring-1 ring-terminal-accent/30"
                      : "bg-terminal-bg/70 text-slate-200 ring-1 ring-terminal-border"
                  }`}
                >
                  {t.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-terminal-bg/70 px-3.5 py-2.5 text-sm text-slate-400 ring-1 ring-terminal-border">
                  <span className="mono animate-pulse">▍ generating…</span>
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-terminal-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={hydrated && apiKey ? "Ask anything…" : "Generate an API key in the Dashboard first"}
              disabled={loading}
              className="input mono flex-1"
            />
            <button type="submit" disabled={loading || !input.trim()} className="btn-primary">
              <Send className="h-3.5 w-3.5" />
              Send
            </button>
          </form>
        </section>

        {/* Metering rail */}
        <aside className="space-y-4">
          <div className="panel">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-terminal-accent" />
                <h2 className="text-sm font-semibold text-slate-100">Live metering</h2>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <Metric
                icon={<Gauge className="h-3.5 w-3.5" />}
                label="Rate limit remaining"
                value={
                  meta?.remaining !== null && meta?.remaining !== undefined
                    ? `${meta.remaining}${meta.limit ? ` / ${meta.limit}` : ""}`
                    : "—"
                }
              />
              {pct !== null && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-terminal-bg">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      pct > 25 ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              <Metric
                icon={<Timer className="h-3.5 w-3.5" />}
                label="Last latency"
                value={meta ? `${meta.latencyMs} ms` : "—"}
              />
              <Metric
                icon={<Cpu className="h-3.5 w-3.5" />}
                label="Tokens (last call)"
                value={meta ? String(meta.totalTokens) : "—"}
              />
              <Metric
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Status"
                value={meta ? String(meta.status || "ERR") : "—"}
              />
            </div>
          </div>

          {!HAS_LIVE_BACKEND && (
            <div className="panel p-4 text-xs text-amber-300">
              Live backend not configured. Set{" "}
              <span className="mono">NEXT_PUBLIC_APIFORGE_BASE_URL</span> to point the
              portal at your running gateway.
            </div>
          )}
          {meta?.status === 429 && (
            <div className="panel p-4 text-xs text-amber-300">
              Rate limit hit — this is the gateway protecting the upstream. Wait for the
              window to reset or upgrade the tier.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="text-slate-500">{icon}</span>
        {label}
      </div>
      <span className="mono text-sm text-slate-100">{value}</span>
    </div>
  );
}
