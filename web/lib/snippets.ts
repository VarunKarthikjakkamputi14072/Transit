import type { CodeTab } from "@/components/CodeSnippet";

export type SnippetSpec = {
  baseUrl: string;
  apiKey: string;
  path: string;
};

export function buildLanguageSnippets({ baseUrl, apiKey, path }: SnippetSpec): CodeTab[] {
  const url = `${baseUrl}${path}`;
  return [
    {
      label: "curl",
      language: "shell",
      code: `curl -s "${url}" \\
  -H "X-API-Key: ${apiKey}" | jq`,
    },
    {
      label: "Python",
      language: "python",
      code: `import httpx

API_KEY = "${apiKey}"
BASE = "${baseUrl}"

response = httpx.get(
    f"{BASE}${path}",
    headers={"X-API-Key": API_KEY},
    timeout=10.0,
)
response.raise_for_status()
print(response.json())`,
    },
    {
      label: "JavaScript",
      language: "javascript",
      code: `const apiKey = "${apiKey}";
const res = await fetch("${url}", {
  headers: { "X-API-Key": apiKey },
});
if (!res.ok) {
  throw new Error(\`Transit returned \${res.status}\`);
}
const data = await res.json();
console.log(data);`,
    },
  ];
}

/** POST chat-completion snippets (OpenAI-compatible body). */
export function buildChatSnippets({ baseUrl, apiKey }: { baseUrl: string; apiKey: string }): CodeTab[] {
  const url = `${baseUrl}/api/v1/chat/completions`;
  const body = `{"messages":[{"role":"user","content":"Write a python script that pings a URL"}]}`;
  return [
    {
      label: "curl",
      language: "shell",
      code: `curl -s -X POST "${url}" \\
  -H "X-API-Key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '${body}' | jq`,
    },
    {
      label: "Python",
      language: "python",
      code: `import httpx

API_KEY = "${apiKey}"

response = httpx.post(
    "${url}",
    headers={"X-API-Key": API_KEY},
    json={
        "messages": [
            {"role": "user", "content": "Write a python script that pings a URL"}
        ]
    },
    timeout=60.0,
)
response.raise_for_status()
print(response.json()["content"])`,
    },
    {
      label: "JavaScript",
      language: "javascript",
      code: `const res = await fetch("${url}", {
  method: "POST",
  headers: {
    "X-API-Key": "${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messages: [
      { role: "user", content: "Write a python script that pings a URL" },
    ],
  }),
});
if (!res.ok) throw new Error(\`Transit returned \${res.status}\`);
const { content, usage } = await res.json();
console.log(content, usage);`,
    },
  ];
}
