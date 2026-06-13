"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Activity, History, KeyRound, Loader2, PiggyBank } from "lucide-react";
import { ApiKeyCard } from "@/components/ApiKeyCard";
import { CodeSnippet } from "@/components/CodeSnippet";
import { UsageChart } from "@/components/UsageChart";
import { useApiKey } from "@/lib/apiKey";
import { mockUsage } from "@/lib/mock";
import { buildChatSnippets } from "@/lib/snippets";
import { API_BASE_URL, HAS_LIVE_BACKEND, fetchUsage, registerDeveloper } from "@/lib/api";

export default function DashboardPage() {
  const { apiKey, createdAt, setApiKey, hydrated } = useApiKey();

  // Real gateway traffic (global) with a mock fallback only when no backend.
  const [usage, setUsage] = useState(() => mockUsage());
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchUsage("24h").then((real) => {
      if (!cancelled && real) setUsage(real);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const avgLatency = useMemo(() => {
    if (!usage.recent.length) return 0;
    return Math.round(
      usage.recent.reduce((a, b) => a + b.latency_ms, 0) / usage.recent.length,
    );
  }, [usage.recent]);

  const last24h = useMemo(
    () => usage.hourly.reduce((a, b) => a + b.requests, 0),
    [usage.hourly],
  );

  async function generateKey() {
    setGenerating(true);
    const result = await registerDeveloper();
    if (result) setApiKey(result.apiKey);
    setGenerating(false);
  }

  const baseUrlForSnippets = HAS_LIVE_BACKEND ? API_BASE_URL : "https://api.transitapi.dev";
  const snippetKey = apiKey || "af_your_key_here";

  const chatSnippets = buildChatSnippets({
    baseUrl: baseUrlForSnippets,
    apiKey: snippetKey,
  });

  const showEmptyState = hydrated && !apiKey;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Dashboard"
        subtitle="Generate a real API key, watch live gateway traffic, and grab copy-paste-ready snippets."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {showEmptyState ? (
            <EmptyKeyState onGenerate={generateKey} generating={generating} />
          ) : (
            <ApiKeyCard
              apiKey={hydrated ? apiKey : ""}
              createdAt={hydrated ? createdAt : ""}
              onRotate={generateKey}
              onRevoke={() => setApiKey("")}
            />
          )}
        </div>
        <div className="grid gap-6">
          <StatCard
            icon={<PiggyBank className="h-4 w-4" />}
            label="Tokens saved by cache"
            value={usage.tokens_saved.toLocaleString()}
            footnote={`${Math.round(usage.cache_hit_rate * 100)}% cache hit rate · ${usage.cache_hits.toLocaleString()} hits`}
            tone="accent"
          />
          <StatCard
            icon={<Activity className="h-4 w-4" />}
            label="Requests today"
            value={usage.today.toLocaleString()}
            footnote={`${usage.week.toLocaleString()} this week · gateway-wide`}
          />
          <StatCard
            icon={<History className="h-4 w-4" />}
            label="Last 24 hours"
            value={`${last24h.toLocaleString()} req`}
            footnote={`${avgLatency} ms avg · see analytics for breakdowns`}
          />
        </div>
      </div>

      <section className="mt-10 panel">
        <header className="panel-header">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Usage · last 24h</h3>
            <p className="text-xs text-slate-500">
              Hourly request volume across the gateway
            </p>
          </div>
          <Link
            href="/analytics"
            className="text-xs font-medium text-terminal-accent hover:underline"
          >
            Full analytics →
          </Link>
        </header>
        <div className="px-4 py-4">
          <UsageChart data={usage.hourly} />
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Quick start</h2>
            <p className="text-sm text-slate-400">
              {apiKey
                ? "These use your real key — paste and run."
                : "Generate a key above to drop your real credential into these."}
            </p>
          </div>
          <Link
            href="/docs"
            className="hidden text-sm text-terminal-accent hover:underline sm:inline-flex items-center gap-1"
          >
            All endpoints <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-6">
          <CodeSnippet
            title="POST /api/v1/chat/completions"
            tabs={chatSnippets}
          />
        </div>
      </section>
    </div>
  );
}

function EmptyKeyState({
  onGenerate,
  generating,
}: {
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <section className="panel flex h-full flex-col items-start justify-center gap-4 px-6 py-10">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-terminal-accent" />
        <h3 className="text-base font-semibold text-slate-100">No API key yet</h3>
      </div>
      <p className="max-w-md text-sm text-slate-400">
        Generate a real Transit key. It registers a developer account on the
        live gateway and returns a working <span className="mono">af_</span> key
        you can use against every endpoint right away.
      </p>
      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        className="btn-primary"
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <KeyRound className="h-4 w-4" />
            Generate API key
          </>
        )}
      </button>
      <p className="text-xs text-slate-500">
        Stored only in your browser. The gateway keeps an HMAC-SHA256 hash, never
        the raw key.
      </p>
    </section>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex flex-col gap-2">
      <div className="section-title">Console</div>
      <h1 className="text-3xl font-bold tracking-tight text-slate-50">{title}</h1>
      <p className="max-w-2xl text-sm text-slate-400">{subtitle}</p>
    </header>
  );
}

function StatCard({
  icon,
  label,
  value,
  footnote,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  footnote?: string;
  tone?: "default" | "accent";
}) {
  return (
    <div className={`panel p-4 ${tone === "accent" ? "shadow-glow" : ""}`}>
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
        <span>{label}</span>
        <span
          className={tone === "accent" ? "text-terminal-accent" : "text-slate-500"}
        >
          {icon}
        </span>
      </div>
      <div className="mt-2 mono text-2xl font-semibold text-slate-50">{value}</div>
      {footnote && <div className="mt-1 text-xs text-slate-500">{footnote}</div>}
    </div>
  );
}
