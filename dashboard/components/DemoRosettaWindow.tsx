"use client";

import * as React from "react";

type Mode = "Human" | "AI Bot";

type Scenario = {
  title: string;
  url: string;
  userAgent: string;
  requestPath: string;
  inputHtml: string;
  outputMarkdown: string;
};

const SCENARIOS: Scenario[] = [
  {
    title: "Marketing landing page",
    url: "https://example.com/",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36",
    requestPath: "/",
    inputHtml: `<!doctype html>
<html>
  <head>
    <title>Rosetta</title>
    <script src="/app.bundle.js" defer></script>
  </head>
  <body>
    <main>
      <h1>Make your site visible to AI</h1>
      <p>AI crawlers can’t execute JavaScript.</p>
      <div id="app"></div>
    </main>
  </body>
</html>`,
    outputMarkdown: `# Make your site visible to AI

AI crawlers can’t execute JavaScript.

- Humans get your site unchanged.
- AI bots get clean Markdown (no JS required).`,
  },
  {
    title: "Docs page (JS-heavy)",
    url: "https://example.com/docs",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    requestPath: "/docs",
    inputHtml: `<!doctype html>
<html>
  <head>
    <title>Docs</title>
    <script src="/docs.bundle.js" defer></script>
  </head>
  <body>
    <div id="root"></div>
    <noscript>This site requires JavaScript.</noscript>
  </body>
</html>`,
    outputMarkdown: `# Docs

## Quickstart

1. Install the middleware
2. Detect AI crawlers by user-agent
3. Serve Markdown to bots, HTML to humans`,
  },
  {
    title: "Pricing page",
    url: "https://example.com/pricing",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    requestPath: "/pricing",
    inputHtml: `<!doctype html>
<html>
  <head>
    <title>Pricing</title>
  </head>
  <body>
    <main>
      <h1>Pricing</h1>
      <p>1,000 free renders/month. No credit card required.</p>
    </main>
  </body>
</html>`,
    outputMarkdown: `# Pricing

1,000 free renders/month. No credit card required.`,
  },
];

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-full border-r border-border px-3 text-[13px] transition-colors",
        active ? "bg-background text-foreground" : "bg-card text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function DemoRosettaWindow() {
  const [mode, setMode] = React.useState<Mode>("AI Bot");
  const [scenarioIdx, setScenarioIdx] = React.useState(0);
  const [tab, setTab] = React.useState<"request" | "middleware" | "response">("request");

  const scenario = SCENARIOS[scenarioIdx]!;

  const responseBody =
    mode === "Human"
      ? scenario.inputHtml
      : scenario.outputMarkdown;

  const responseLabel =
    mode === "Human"
      ? "Response (HTML unchanged)"
      : "Response (clean Markdown for crawler)";

  return (
    <div className="relative grid grid-cols-1 grid-rows-1">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "url(https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/misc/asset-cc24ca462279ca23250c.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(0.92) contrast(0.98)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 p-4 sm:p-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="border border-border bg-[rgba(243,242,238,0.72)] backdrop-blur-sm">
            {/* Window chrome */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[rgba(38,37,30,0.22)]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[rgba(38,37,30,0.22)]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[rgba(38,37,30,0.22)]" />
              </div>
              <div className="text-[13px] text-muted-foreground">Rosetta</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode("Human")}
                  className={[
                    "border border-border px-2 py-1 text-[12px] transition-colors",
                    mode === "Human" ? "bg-background text-foreground" : "bg-card text-muted-foreground hover:bg-[var(--bg-hover)]",
                  ].join(" ")}
                >
                  Human
                </button>
                <button
                  type="button"
                  onClick={() => setMode("AI Bot")}
                  className={[
                    "border border-border px-2 py-1 text-[12px] transition-colors",
                    mode === "AI Bot" ? "bg-background text-foreground" : "bg-card text-muted-foreground hover:bg-[var(--bg-hover)]",
                  ].join(" ")}
                >
                  AI Bot
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="grid min-h-[520px] grid-cols-1 md:grid-cols-[260px_1fr_360px]">
              {/* Left: scenarios */}
              <aside className="border-r border-border bg-card">
                <div className="px-3 py-3">
                  <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Requests <span className="opacity-60">{SCENARIOS.length}</span>
                  </div>
                  <div className="space-y-1">
                    {SCENARIOS.map((s, idx) => (
                      <button
                        key={s.title}
                        type="button"
                        onClick={() => setScenarioIdx(idx)}
                        className={[
                          "w-full border px-3 py-2 text-left text-[13px] transition-colors",
                          idx === scenarioIdx
                            ? "border-border bg-background text-foreground"
                            : "border-transparent text-muted-foreground hover:bg-[var(--card-hover)]",
                        ].join(" ")}
                      >
                        {s.title}
                        <div className="mt-1 text-[12px] opacity-60">{s.requestPath}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>

              {/* Center: tabs + code */}
              <div className="bg-background">
                <div className="flex h-9 items-center border-b border-border bg-card">
                  <TabButton active={tab === "request"} onClick={() => setTab("request")}>
                    request.json
                  </TabButton>
                  <TabButton active={tab === "middleware"} onClick={() => setTab("middleware")}>
                    rosetta-middleware.ts
                  </TabButton>
                  <TabButton active={tab === "response"} onClick={() => setTab("response")}>
                    response.txt
                  </TabButton>
                </div>

                <div className="p-4 font-mono text-[12px] leading-relaxed text-foreground/90">
                  {tab === "request" && (
                    <pre className="whitespace-pre-wrap">{`{
  "url": "${scenario.url}",
  "path": "${scenario.requestPath}",
  "headers": {
    "user-agent": "${mode === "AI Bot" ? "GPTBot/1.0 (+https://openai.com/gptbot)" : scenario.userAgent}",
    "accept": "${mode === "AI Bot" ? "text/markdown, text/plain;q=0.9, */*;q=0.1" : "text/html,application/xhtml+xml"}"
  }
}`}</pre>
                  )}

                  {tab === "middleware" && (
                    <pre className="whitespace-pre-wrap">{`export function rosetta(req) {
  const ua = req.headers["user-agent"] ?? ""
  const isBot = /GPTBot|ClaudeBot|PerplexityBot|Google-Extended|Bingbot/i.test(ua)

  if (!isBot) return next()          // Humans: unchanged HTML

  const html = fetchOriginHTML(req)  // Bots: render → extract → Markdown
  const md = htmlToMarkdown(html)
  return respond(200, md, { "content-type": "text/markdown; charset=utf-8" })
}`}</pre>
                  )}

                  {tab === "response" && (
                    <pre className="whitespace-pre-wrap">{`HTTP/1.1 200 OK
content-type: ${mode === "AI Bot" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8"}
cache-control: ${mode === "AI Bot" ? "public, max-age=300" : "no-cache"}

${responseBody}`}</pre>
                  )}
                </div>
              </div>

              {/* Right: response preview */}
              <aside className="border-l border-border bg-card">
                <div className="flex h-9 items-center border-b border-border px-3 text-[13px] font-medium">
                  {responseLabel}
                </div>
                <div className="p-3">
                  <div className="border border-border bg-background px-3 py-2">
                    <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-foreground/90">
                      {responseBody}
                    </pre>
                  </div>
                  <div className="mt-3 text-[12px] text-muted-foreground">
                    Toggle <span className="text-foreground">Human</span> vs{" "}
                    <span className="text-foreground">AI Bot</span> to see Rosetta switch outputs.
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


