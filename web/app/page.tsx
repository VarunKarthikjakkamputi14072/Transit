import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  Cpu,
  Gauge,
  KeyRound,
  PiggyBank,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { CodeSnippet } from "@/components/CodeSnippet";

const ARCHITECTURE_INSIGHTS = [
  {
    name: "Response Caching",
    metric: "$0",
    context: "Cost of a repeated query",
    description: "I built Transit because my RAG apps (MedQuery, ChatDoc) were re-asking the same questions and re-embedding the same chunks — and the bills were climbing. Transit caches identical chat + embedding requests in Redis, so a repeat costs nothing.",
    features: [
      "Exact-match cache on a SHA-256 of the request",
      "Cache hit → instant, 0 upstream tokens billed",
      "tokens_saved counter to measure the savings",
    ],
    accent: true,
  },
  {
    name: "Per-Key Rate Limiting",
    metric: "276 req/s",
    context: "Gateway overhead at 200 VUs",
    description: "One runaway retrieval loop shouldn't drain a month's token budget. Transit meters every call against a per-key tier quota with an atomic Redis sliding window, and fails open if Redis blips so a cache outage never takes the gateway down.",
    features: [
      "Atomic Lua sliding window in Redis",
      "429 + Retry-After / X-RateLimit headers",
      "Fail-open: Redis outage degrades, not breaks",
    ],
    accent: false,
  },
];

const FEATURES = [
  {
    icon: PiggyBank,
    title: "Caches what you already paid for",
    body: "Identical chat questions and repeated chunk embeddings are served from Redis — zero upstream tokens. The portal shows exactly how many tokens the cache saved.",
  },
  {
    icon: KeyRound,
    title: "Your key, not the provider's",
    body: "Apps authenticate with Transit af_ keys. The upstream NVIDIA key lives server-side only — never shipped to a browser or mobile client.",
  },
  {
    icon: ShieldCheck,
    title: "Metered LLM access",
    body: "Redis-backed per-key quotas and X-RateLimit-* headers on every call. One runaway loop can't burn the whole token budget.",
  },
  {
    icon: Cpu,
    title: "Chat + embeddings via NVIDIA NIM",
    body: "OpenAI-compatible /v1/chat/completions and /v1/embeddings backed by NVIDIA NIM. Point any RAG app's base_url at Transit — it's a drop-in.",
  },
];

export default function LandingPage() {
  return (
    <div className="grid-bg">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-terminal-border bg-terminal-panel/60 px-3 py-1 text-xs text-slate-300">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-terminal-accent" />
              <span className="mono">v0.1</span>
              <span className="text-slate-500">/</span>
              <span>Public beta — free tier live</span>
            </span>
            <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight text-slate-50 sm:text-6xl">
              Stop paying twice for the{" "}
              <span className="bg-gradient-to-r from-terminal-accent to-emerald-200 bg-clip-text text-transparent">
                same LLM call
              </span>
              .
            </h1>
            <p className="mt-5 text-balance text-base text-slate-300 sm:text-lg">
              Transit is a caching, rate-limited gateway for NVIDIA&apos;s open
              LLMs. Point your RAG apps at one endpoint — repeated questions and
              embeddings come straight from Redis, the upstream key stays
              server-side, and every key is metered.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/dashboard" className="btn-primary">
                Get an API key
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/docs" className="btn-ghost">
                <Code2 className="h-4 w-4" />
                Read the docs
              </Link>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              No credit card. 100 requests/hour free, forever.
            </p>
          </div>

          {/* Hero terminal */}
          <div className="mx-auto mt-14 max-w-3xl">
            <CodeSnippet
              title="Try it"
              tabs={[
                {
                  label: "curl",
                  language: "shell",
                  code: `# Register, get an API key, ask an open LLM.
curl -s -X POST https://api.transitapi.dev/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com","password":"supersecret123"}'

curl -s -X POST "https://api.transitapi.dev/api/v1/chat/completions" \\
  -H "X-API-Key: af_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Write a python script that pings a URL"}]}' | jq`,
                },
                {
                  label: "Python",
                  language: "python",
                  code: `import httpx

api_key = "af_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
completion = httpx.post(
    "https://api.transitapi.dev/api/v1/chat/completions",
    headers={"X-API-Key": api_key},
    json={"messages": [{"role": "user", "content": "Write a python script that pings a URL"}]},
    timeout=60.0,
).json()

print(completion["content"])`,
                },
                {
                  label: "JavaScript",
                  language: "javascript",
                  code: `const apiKey = "af_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const res = await fetch("https://api.transitapi.dev/api/v1/chat/completions", {
  method: "POST",
  headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Write a python script that pings a URL" }],
  }),
});
const { content, usage } = await res.json();
console.log(content, usage);`,
                },
              ]}
            />
          </div>
        </div>
      </section>

      {/* Endpoint pills */}
      <section className="border-y border-terminal-border bg-terminal-panel/30">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {[
            { icon: Bot, label: "Chat completions", path: "POST /api/v1/chat/completions" },
            { icon: Cpu, label: "Embeddings", path: "POST /api/v1/embeddings" },
            { icon: PiggyBank, label: "Cached", path: "X-Cache: HIT · 0 tokens" },
            { icon: Gauge, label: "Rate limits", path: "X-RateLimit-* headers" },
          ].map(({ icon: Icon, label, path }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-lg border border-terminal-border bg-terminal-bg px-4 py-3"
            >
              <Icon className="h-5 w-5 text-terminal-accent" />
              <div>
                <div className="text-sm font-semibold text-slate-100">{label}</div>
                <div className="mono text-xs text-slate-400">{path}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="section-title">Why Transit</div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
            Production plumbing, on tap.
          </h2>
          <p className="mt-3 text-slate-400">
            Auth, rate limiting, caching, analytics. The boring-but-critical
            scaffolding you&apos;d otherwise build for every project.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="panel p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-terminal-border bg-terminal-bg text-terminal-accent">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-100">{title}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture Insights */}
      <section id="architecture" className="border-t border-terminal-border bg-terminal-panel/30">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="section-title">Engineering Context</div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
              Why this was built
            </h2>
            <p className="mt-3 text-slate-400">
              Transit is a portfolio project designed to demonstrate production backend patterns, system resilience, and high-concurrency handling.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2">
            {ARCHITECTURE_INSIGHTS.map((insight) => (
              <div
                key={insight.name}
                className={`panel p-6 flex flex-col ${
                  insight.accent ? "border-terminal-accent/50 shadow-glow" : ""
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg font-semibold text-slate-100">{insight.name}</h3>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-slate-50">{insight.metric}</span>
                  <span className="text-sm text-slate-400">{insight.context}</span>
                </div>
                <p className="mt-4 text-sm text-slate-400 flex-grow">{insight.description}</p>
                <ul className="mt-6 space-y-2 text-sm text-slate-200">
                  {insight.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-terminal-accent" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-bold text-slate-50 sm:text-4xl">
          Ship the integration in an hour, not a sprint.
        </h2>
        <p className="mt-3 text-slate-400">
          Sign up, grab a key, and you&apos;ll be making normalized API calls in
          your terminal in under five minutes.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/dashboard" className="btn-primary">
            Get your API key
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/explorer" className="btn-ghost">
            Try the explorer
          </Link>
        </div>
      </section>
    </div>
  );
}
