# Rosetta AI Engineering Rules v2.4
# AI Crawler Optimization Service
# Last Updated: December 2025

> **Philosophy**: Build like a Jane Street infra engineer constrained by startup velocity.
> Rigor where it prevents 3am pages. Speed where correctness is recoverable.
> This is production. Ship it.

---

## 0. SYSTEM CONTEXT (READ FIRST)

### 0.1 What Rosetta Does

Rosetta is an **AI crawler optimization service** (Prerender for AI bots):

1. **The Problem**: AI crawlers (GPTBot, ClaudeBot) can't execute JavaScript. SPAs return empty `<div id="root"></div>`. Even server-rendered sites have 10x more tokens than needed.
2. **The Solution**: Customer middleware intercepts AI bot requests → calls Rosetta API → returns clean Markdown
3. **The Value**: AI crawlers see your content. 99% token reduction. Better AI search citations.

### 0.2 Business Model (Prerender Playbook)
```
Customer Integration:
1. Customer deploys middleware (10 lines)
2. Middleware detects AI bot User-Agent
3. Middleware calls: GET api.rosetta.ai/render?url=X
4. Rosetta returns Markdown
5. Middleware returns MD to bot
6. Bot never knows Rosetta exists

Key insight: Customer initiates connection. We're never in the critical path for humans.
```

### 0.3 Architecture Overview
```
┌─────────────────────────────────────────────────────────────────────┐
│                         ROSETTA SYSTEM                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Customer Server                                                     │
│  ┌──────────────┐                                                   │
│  │  Middleware  │─── if AI bot ───┐                                 │
│  │  (10 lines)  │                 │                                 │
│  └──────────────┘                 │                                 │
│        │                          ▼                                 │
│        │                 ┌──────────────────┐                       │
│        │                 │  Rosetta API     │                       │
│        │                 │  (CF Worker)     │                       │
│        │                 │                  │                       │
│        │                 │  1. Auth (KV)    │                       │
│        │                 │  2. Validate URL │                       │
│        │                 │  3. Cache check  │                       │
│        │                 │  4. Extract (FC) │                       │
│        │                 │  5. Return MD    │                       │
│        │                 └──────────────────┘                       │
│        │                          │                                 │
│        │                          ▼                                 │
│        │                 ┌──────────────────┐                       │
│        │                 │  Firecrawl API   │                       │
│        │                 │  (extraction)    │                       │
│        │                 └──────────────────┘                       │
│        │                                                            │
│        ▼                                                            │
│  Human request → serve normal HTML                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 0.4 Repository Structure
```
rosetta/
├── worker/
│   ├── index.js              # Cloudflare Worker (CORE PRODUCT)
│   ├── package.json
│   └── wrangler.toml
│
├── packages/
│   ├── vercel/               # @rosetta/vercel middleware
│   │   ├── index.ts
│   │   └── package.json
│   └── express/              # @rosetta/express middleware
│       ├── index.ts
│       └── package.json
│
├── dashboard/                # Next.js dashboard app
│   ├── app/
│   │   ├── page.tsx          # Home
│   │   ├── [domain]/         # Per-domain views
│   │   └── api/              # API routes
│   ├── components/
│   └── lib/
│
├── pnpm-workspace.yaml       # Monorepo workspace config
├── .gitignore
└── rules.md                  # This file
```

### 0.5 Document Precedence

When this document contains contradictions:

1. **Invariants (Section 1)** override everything else
2. **Rules in prose** override code examples
3. **Code examples** are illustrative, not canonical

If you find a code example that violates a stated rule, the code example is wrong.
Update the code example; do not infer that the rule has exceptions.

When editing this document, ensure code examples stay consistent with rules.

### 0.6 Proxy Mode (Experimental)

> ⚠️ **Proxy Mode is a separate operational mode with different security properties.**
> It is NOT the primary product. Do not conflate with API Mode.

The worker supports an **experimental Proxy Mode** for demos and self-hosted deployments:

| Mode | Auth | Use Case | Status |
|------|------|----------|--------|
| **API Mode** | Token + domain allowlist | Multi-tenant SaaS (primary) | Production |
| **Proxy Mode** | Origin allowlist only | Demo sites, self-hosted | Experimental |

**Proxy Mode Security:**
- No API token required
- Bot detection happens at the edge (worker)
- Only configured origins can be proxied (`ALLOWED_PROXY_ORIGINS`)
- Different SSRF surface (we fetch whatever the origin returns)

**When to use Proxy Mode:**
- Demo deployments (`rosetta-demo.vercel.app`)
- Customers who can't deploy middleware
- Self-hosted single-tenant deployments

**Proxy Mode MUST NOT:**
- Be enabled by default
- Share auth infrastructure with API Mode
- Be documented as the "normal" way to use Rosetta

**Configuration:**
```javascript
const ALLOWED_PROXY_ORIGINS = [
  'https://rosetta-demo.vercel.app',
  // Add customer origins here for proxy mode
];
```

---

## 1. INVARIANTS (NON-NEGOTIABLE)

### 1.1 Protected Paths

| Path | Status | Reason |
|------|--------|--------|
| `worker/index.js` | CRITICAL | Production traffic. Changes affect all customers instantly. |
| `packages/*/index.ts` | CAREFUL | Published to npm. Breaking changes affect integrations. |
| `dashboard/components/ui/*` | FROZEN | Shadcn generated. Modify via CLI only. |

Before editing a protected path, respond with:
```
🚨 PROTECTED PATH: [path]

This is production code serving live traffic.

Change requested: [describe]
Impact assessment: [who/what is affected]
Rollback plan: [how to revert if broken]

Proceed? [await confirmation]
```

Do not continue without explicit approval.

### 1.2 Security Invariants
```javascript
// REQUIRED: Domain allowlist check (SSRF prevention)
const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
if (!customer.domains?.includes(hostname)) {
  return json({ error: 'Domain not allowed' }, 403);
}

// REQUIRED: Private IP blocking
if (isPrivateHost(parsed.hostname)) {
  return json({ error: 'Private address' }, 400);
}

// REQUIRED: HTTPS only
if (parsed.protocol !== 'https:') {
  return json({ error: 'HTTPS required' }, 400);
}

// REQUIRED: Strip sensitive headers before proxying
const STRIP_HEADERS = [
  'x-rosetta-token',
  'cf-connecting-ip',
  'cf-ray',
  'authorization',
];

// REQUIRED: Token hashing (Phase 2+)
// Never store or log plaintext API tokens. Hash on creation, lookup by hash.
const tokenHash = sha256(token).toString('hex');  // 64-char lowercase hex
const customer = await kv.get(`apikeyhash:${tokenHash}`, 'json');
```

### 1.3 Response Invariants

There are two distinct response surfaces with different rules:

#### 1.3.1 API Responses (Worker → Middleware)

The `/render` endpoint returns JSON errors with appropriate HTTP status codes.
Middleware handles these and decides what to serve the bot.

```javascript
// API errors use standard HTTP semantics
return json({ error: 'Missing token', requestId }, 401);
return json({ error: 'Domain not allowed', requestId }, 403);
return json({ error: 'Invalid URL', requestId }, 400);
```

```typescript
// API error response schema
interface ApiError {
  error: string;
  requestId?: string;  // For customer debugging
}
```

#### 1.3.2 Bot-Facing Responses (Middleware → Crawler)

When serving content TO the AI crawler, NEVER return non-200.
Crawlers won't retry. They'll skip your content.

```javascript
// ✅ Correct: Always 200 to crawlers
return new Response(markdown, { status: 200 });
return new Response(fallbackHtml, { status: 200 }); // Fallback is still 200

// ❌ Wrong: Crawler will skip
return new Response('Processing', { status: 202 });
return new Response('Error', { status: 500 });
```

**The middleware is responsible for this guarantee.** If the API returns an error,
middleware falls back to origin content and serves that with 200.

### 1.4 Content Equivalence Policy

Rosetta transforms content for AI crawlers. This is **not cloaking** because we preserve semantic equivalence.

**Rosetta MAY:**
- Compress content (remove boilerplate, navigation, footers)
- Convert HTML → Markdown
- Restructure content for clarity
- Remove styling and non-semantic elements

**Rosetta MUST NOT:**
- Introduce claims absent from the original HTML
- Remove material claims that change meaning
- Serve content with different factual intent to AI vs humans
- Add promotional content not present in source

> ⚠️ **If a customer requests behavior that violates this policy — refuse.**
> This protects Rosetta from legal liability, reputation risk, and future AI compliance regimes.

### 1.5 Abuse / Quota Policy

Usage counters exist in KV (`usage:${customer_id}:${YYYY-MM}`). Define behavior when things go wrong.

**Soft Limits (Phase 1+):**

If usage exceeds plan limit by >10× in a short time window, Rosetta MAY:
- Temporarily bypass extraction (return origin HTML as fallback)
- Return `{ error: 'Soft limit exceeded', requestId }` with 429 status
- Require customer remediation before resuming full service

**Why this matters:**
- Someone leaks their `ROSETTA_TOKEN` in a public repo
- Malicious actor pipes millions of requests through our infra
- We discover when the Firecrawl bill arrives

**Enforcement priority:**
1. **Phase 1:** Manual intervention, monitoring alerts
2. **Phase 2:** Automated soft kill-switch (KV-based, approximate)
3. **Phase 3+:** Durable Objects for exact counting

> This is NOT billing enforcement. This prevents runaway costs.

### 1.6 Data Retention Policy

This will be required for enterprise security questionnaires.

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| Request logs | 30–90 days | Configurable per deployment |
| Full URLs | NOT logged by default | `urlHash` only (privacy) |
| Request bodies | NOT stored | Never captured |
| Extracted content | KV cache TTL only (24h) | Auto-expires |
| Customer configs | Until deletion | Postgres is source of truth |

**Customer-specific options (Enterprise):**
- Opt-in to full URL logging for debugging
- Custom log retention periods
- Dedicated log export

### 1.7 SDK ↔ Worker Compatibility Contract

**Guarantees:**

1. **SDKs are backwards compatible with newer workers.**
   - A middleware deployed today must work with worker updates for at least 6 months.

2. **Workers must accept older SDKs for at least 6 months after any breaking change.**
   - Breaking changes: new required headers, changed bot detection behavior, response format changes.

3. **Hash formats are stable.**
   - `sha256_hex` (lowercase, 64 chars) will not change.
   - KV key prefixes (`md:`, `apikey:`, `apikeyhash:`) are versioned, not renamed.

4. **Bot list changes are NOT breaking.**
   - Adding/removing bots is expected evolution.

**Deprecation process:**
1. Announce deprecation (changelog, dashboard notification)
2. 6-month grace period
3. Remove support only after grace period

---

## 2. CORE DOMAIN TYPES (MEMORIZE THESE)

### 2.1 Result<T> - THE Error Handling Primitive
```typescript
type Result<T, E = Error> = 
  | { ok: true; value: T } 
  | { ok: false; error: E };

const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

**Rules:**
- NEVER throw exceptions for expected failures
- ALWAYS pattern match on Result, never cast or assume ok
- NEVER use try/catch for business logic errors
- Worker converts internal Result → external 200 response

### 2.2 Branded Types for IDs
```typescript
type CustomerId = string & { __brand: 'CustomerId' };
type UrlHash = string & { __brand: 'UrlHash' };
type ApiToken = string & { __brand: 'ApiToken' };

// Prevents mixing up IDs:
function getCustomer(id: CustomerId): Promise<Customer> { }
const hash: UrlHash = await sha256(url);
getCustomer(hash); // ❌ Type error: UrlHash not assignable to CustomerId
```

### 2.3 Customer Config Schema
```typescript
// Phase 1: Stored in KV as apikey:{token} (manual provisioning)
interface CustomerConfig {
  id: CustomerId;
  domains: string[];           // Allowlisted domains
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  created: string;             // ISO date
}

// Phase 2+: Stored in KV as apikeyhash:{sha256_hex} (dashboard provisioning)
interface CustomerConfigV2 {
  v: 2;
  customerId: string;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  domains: string[];           // Normalized hostnames
  updatedAt: string;           // ISO date, for cache invalidation debugging
}
```

### 2.4 KV Storage Schema
```typescript
// API keys - Phase 1 (plaintext lookup, manual provisioning)
`apikey:${token}` → CustomerConfig  // DEPRECATED after Phase 2 migration

// API keys - Phase 2+ (hash-based lookup, dashboard provisioning)
`apikeyhash:${sha256_hex}` → CustomerConfigV2  // No TTL, delete on revoke

// Cached markdown (structured payload, JSON string)
`md:${sha256_hash}` → JSON string: CachedMd  // TTL: 86400

type CachedMd = { 
  kind: 'md'; 
  body: string; 
  fetchedAt: string;
  v: 1;  // Schema version — increment when format changes
};

// Single-flight markers
`pending:${sha256_hash}` → "1"  // TTL: 30 seconds

// Usage counters (approximate)
`usage:${customer_id}:${YYYY-MM}` → string  // TTL: 90 days
```

> **Schema versioning:** The `v` field allows cache format evolution. 
> When changing the schema, increment `v` and treat old versions as cache misses.
> They'll expire naturally (24h TTL) or can be purged explicitly.

### 2.5 Auth Phases

| Phase | Lookup Key | Token Stored In KV? | Status |
|------:|------------|---------------------|--------|
| 1 | `apikey:${token}` | Plaintext token | **CURRENT PRODUCTION** |
| 1.5 | `apikeyhash:${sha256_hex}` + fallback to plaintext | Both (transitional) | OPTIONAL MIGRATION |
| 2 | `apikeyhash:${sha256_hex}` | Hash only | TARGET |

**Canonical Worker Behavior:**
- **Phase 1:** Plaintext lookup only (`apikey:${token}`)
- **Phase 1.5:** Dual lookup (try hash first, fall back to plaintext)
- **Phase 2:** Hash-only lookup (`apikeyhash:${sha256_hex}`)

> ⚠️ **Current Reality:** Production is Phase 1. Code examples in this doc reflect Phase 1 unless marked otherwise.

### 2.6 Database & Publish Contract (Phase 2+)

When the dashboard exists, Postgres is the source of truth:

```
Postgres (truth) → PublishJob → KV (cache for worker auth)
```

**Source of Truth Flow:**

| Layer | Responsibility |
|-------|----------------|
| Postgres | Customer, Domain, ApiToken (hashed), billing state |
| PublishJob | Ensures KV eventually reflects Postgres |
| KV | Fast auth lookup for worker (read-only from worker's perspective) |

**CustomerConfigV2 payload (what worker consumes):**
```typescript
type CustomerConfigV2 = {
  v: 2;
  customerId: string;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  domains: string[];
  updatedAt: string;  // ISO
};
```

**Invariants:**

1. **Never store plaintext tokens in Postgres.** Store `tokenHash = sha256(token)` only.
   - Hash format: lowercase hex, 64 characters
   - Store `tokenPrefix` (first 8 chars) for customer-facing identification

2. **No TTL on auth keys.** Dormant customers must not silently break. Delete explicitly on revoke.

3. **Publish must be reliable.** Any mutation affecting worker behavior (token create/revoke, domain add/remove, plan change) must:
   - Write DB transaction (source of truth)
   - Create PublishJob(state=pending)
   - Background retry until KV write succeeds (exponential backoff, max 5 attempts, then alert)

4. **Revocation window:** Revoked tokens may work for up to 60 seconds (KV propagation). Document this for customers.

5. **Hostname normalization:** Store normalized form in DB (`hostname.toLowerCase().replace(/^www\./, '')`). Must match worker canonicalization.

**Migration (one-time, Phase 1 → Phase 2):**
```javascript
// Worker dual-lookup during migration window
const tokenHash = sha256(token).toString('hex');
let customer = await env.KV.get(`apikeyhash:${tokenHash}`, 'json');

if (!customer) {
  // Legacy fallback (remove after migration)
  customer = await env.KV.get(`apikey:${token}`, 'json');
  if (customer) {
    // Optional: write-through to accelerate migration
    ctx.waitUntil(env.KV.put(`apikeyhash:${tokenHash}`, JSON.stringify(customer)));
  }
}
```
- After N days: Remove legacy lookup, sweep remaining `apikey:*` keys

---

## 3. AI BOT DETECTION

### 3.1 Bot Detection Source of Truth

The canonical bot list lives in `worker/index.js` (`AI_BOTS` and `isAIBot`).

If you update it, you MUST mirror the list into:
- `packages/vercel/index.ts`
- `packages/express/index.ts`

> We may consolidate this into a shared `@rosetta/bots` package later. Until then, drift between worker + SDKs is a correctness risk.

---

## 4. CORE REQUEST FLOW

### 4.1 API Handler Pattern (Phase 1)

> This example reflects **Phase 1** (plaintext token lookup). See Section 2.5 for phase definitions.

```javascript
// GET /render?url=X
// Header: X-Rosetta-Token: sk_xxx

// Canonicalization version — increment when changing canonicalize() logic
const CANON_VERSION = 'v1';

async function handleRender(request, env, ctx) {
  const requestId = request.headers.get('cf-ray') || crypto.randomUUID();

  // 1. Auth (Phase 1: plaintext token lookup)
  const token = request.headers.get('X-Rosetta-Token');
  if (!token) return json({ error: 'Missing token', requestId }, 401);
  
  // Phase 1: plaintext lookup. See Section 2.5 for Phase 2 (hash-based) migration.
  const customer = await env.KV.get(`apikey:${token}`, 'json');
  if (!customer) return json({ error: 'Invalid token', requestId }, 401);

  // 2. Validate URL
  const targetUrl = new URL(request.url).searchParams.get('url');
  if (!targetUrl) return json({ error: 'Missing url', requestId }, 400);

  let parsed;
  try { parsed = new URL(targetUrl); }
  catch { return json({ error: 'Invalid URL', requestId }, 400); }

  if (parsed.protocol !== 'https:') {
    return json({ error: 'HTTPS required', requestId }, 400);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!customer.domains?.includes(hostname)) {
    return json({ error: 'Domain not allowed', requestId }, 403);
  }

  if (isPrivateHost(parsed.hostname)) {
    return json({ error: 'Private address', requestId }, 400);
  }

  // 3. Cache check
  const canonical = canonicalize(targetUrl);
  const hash = await sha256(`${CANON_VERSION}:${canonical}`);
  const cacheKey = `md:${hash}`;

  const cached = await env.KV.get(cacheKey, 'json');
  if (cached?.kind === 'md' && cached?.v === 1) {
    return md(cached.body, 'hit');
  }

  // 4. Single-flight check (one retry, not polling)
  const pendingKey = `pending:${hash}`;
  const pending = await env.KV.get(pendingKey);

  if (pending) {
    // Give in-flight extraction 1s to complete
    await sleep(1000);
    const result = await env.KV.get(cacheKey, 'json');
    if (result?.kind === 'md' && result?.v === 1) {
      return md(result.body, 'hit');
    }
    // Still pending — fallback rather than block
    return fallback(canonical);
  }

  // 5. Extract
  await env.KV.put(pendingKey, '1', { expirationTtl: 30 });

  try {
    const content = await scrape(canonical, env.FIRECRAWL_KEY, 3000);
    if (content) {
      ctx.waitUntil(env.KV.put(cacheKey, JSON.stringify({
        kind: 'md',
        body: content,
        fetchedAt: new Date().toISOString(),
        v: 1
      }), { expirationTtl: 86400 }));
      ctx.waitUntil(env.KV.delete(pendingKey));
      return md(content, 'miss');
    }
  } catch (e) {
    console.error('Scrape failed:', e);
  }

  ctx.waitUntil(env.KV.delete(pendingKey));
  return fallback(canonical);
}
```

### 4.2 Response Helpers
```javascript
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function md(content, status) {
  return new Response(content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Rosetta-Status': status,
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

async function fallback(url) {
  try {
    const res = await fetch(url);
    return new Response(await res.text(), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Rosetta-Status': 'fallback'
      }
    });
  } catch {
    // Still return 200 - never 5xx to crawlers
    return new Response('<!-- Rosetta: Origin unavailable -->', {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Rosetta-Status': 'error'
      }
    });
  }
}
```

> **Browser Access Policy:**
> - The Worker API (`/render`) is server-to-server only. No CORS headers.
> - Browsers should never call the Worker API directly.
> - Dashboard frontend calls its own Next.js API routes, which call the Worker server-side.
> - If you need browser-callable endpoints later, create a separate `/dashboard/*` route surface with scoped CORS.

---

## 5. URL HANDLING

### 5.1 Canonicalization
```javascript
// Canonicalization version — increment when changing canonicalize() logic
const CANON_VERSION = 'v1';

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', '_ga', '_gl', 'ref', 'mc_cid', 'mc_eid'
];

function canonicalize(url) {
  const p = new URL(url);
  p.hash = '';
  p.hostname = p.hostname.toLowerCase().replace(/^www\./, '');
  TRACKING_PARAMS.forEach(k => p.searchParams.delete(k));
  p.searchParams.sort();
  return p.toString();
}
```

> **Versioning:** The `CANON_VERSION` prefix is included in the hash input.
> When changing canonicalization logic (e.g., adding new tracking params),
> increment the version. Old cache entries become unreachable and expire naturally.
> This prevents mysterious cache behavior during rollouts.

### 5.2 SSRF Reality (Phase 1)

> ⚠️ **Be honest about what we actually protect against.**

In Phase 1, SSRF protection is **effectively achieved via:**

1. **Domain allowlist enforcement** — The real protection. We only fetch URLs from pre-registered customer domains.
2. **Basic IP literal blocking** — Catches `https://127.0.0.1/...` style URLs.
3. **Private hostname blocking** — Catches `localhost`, `.local`, `.internal`.

**Known Limitations (accepted in Phase 1):**

| Gap | Impact | Mitigation |
|-----|--------|------------|
| DNS resolution NOT checked | DNS rebinding possible | Domain allowlist is pre-registered |
| IPv6 private ranges incomplete | IPv6 attacks possible | Domain allowlist is pre-registered |
| Cloud metadata (169.254.169.254) | Not blocked by hostname check | Domain allowlist is pre-registered |

**Why this is acceptable:** We ONLY allow pre-registered customer domains. Customers cannot request arbitrary URLs.

**Phase 2 hardening (if we ever allow arbitrary URLs):**
- Resolve DNS and check resolved IP against private ranges
- Block cloud metadata IPs explicitly
- Add IPv6 private range blocking

```javascript
const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // Loopback
  /^10\./,                           // Class A private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // Class B private
  /^192\.168\./,                     // Class C private
  /^169\.254\./,                     // Link-local
  /^0\./,                            // Current network
];

function isPrivateHost(hostname) {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
    return true;
  }
  // NOTE: This only catches literal IP hostnames, not DNS-resolved IPs.
  // Real SSRF protection comes from domain allowlist.
  return PRIVATE_IP_PATTERNS.some(p => p.test(hostname));
}
```

---

## 6. MIDDLEWARE SDK

### 6.1 Vercel Middleware

```typescript
// packages/vercel/index.ts
import { NextResponse } from 'next/server';

export function createMiddleware(token: string) {
  return async function middleware(req: Request) {
    const ua = req.headers.get('user-agent');

    if (!isAIBot(ua)) {
      return NextResponse.next();
    }

    try {
      const res = await fetch(
        `https://api.rosetta.ai/render?url=${encodeURIComponent(req.url)}`,
        {
          headers: { 'X-Rosetta-Token': token },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!res.ok) {
        // Log error but don't break the site
        return NextResponse.next(); // Fallback to origin
      }

      const body = await res.text();
      return new Response(body, {
        headers: {
          'Content-Type': res.headers.get('Content-Type') || 'text/markdown',
          'X-Rosetta-Status': res.headers.get('X-Rosetta-Status') || 'unknown',
        },
      });
    } catch {
      return NextResponse.next(); // Never break the site
    }
  };
}
```

### 6.2 Customer Usage
```typescript
// middleware.ts (customer's code - 5 lines)
import { createMiddleware } from '@rosetta/vercel';

export const middleware = createMiddleware(process.env.ROSETTA_TOKEN!);

export const config = {
  matcher: ['/((?!_next|api|static|favicon.ico).*)'],
};
```

---

## 7. COST MODEL

### 7.1 Infrastructure Costs
```
At 50K renders/month:

| Item                  | Cost    |
|-----------------------|---------|
| CF Workers ($5 base)  | $5.00   |
| KV reads (included)   | $0      |
| KV writes (150K)      | $0.75   |
| R2 ops (if used)      | $0.50   |
| Firecrawl (50K pages) | $33.00  |
| Total                 | ~$40/mo |

Extraction (Firecrawl) is 83% of cost.
Self-host Puppeteer at 500K+ pages/month.
```

### 7.2 Firecrawl Dependency

Firecrawl is the extraction layer and a critical external dependency.

**Degradation behavior:**
1. `scrape()` times out or returns error
2. Worker returns fallback (origin HTML)
3. Bot gets content, just not optimized

**Acceptable degradation:** Bots receive unoptimized HTML. Strictly better than nothing.

**Monitoring:**
Track `X-Rosetta-Status` values. Key metrics:
- `miss` → successful extraction
- `fallback` → extraction failed, served origin HTML
- `error` → complete failure

**Alerting thresholds (adjust based on baseline):**

| Condition | Level | Action |
|-----------|-------|--------|
| Fallback rate > 5% over 15min, AND volume > 100 req in that window | Warning | Investigate |
| Fallback rate > 25% over 5min, AND volume > 50 req in that window | Critical | Page on-call |
| Firecrawl 5xx rate > 10% | Critical | Check Firecrawl status page |

> **Note:** Volume gates prevent alerts during low-traffic periods or single-customer misconfigs.
> Separate Firecrawl errors from general fallback rate — customer origin issues also cause fallbacks.

**Phase 3 mitigation:** Self-hosted Puppeteer fleet eliminates single-vendor dependency.

### 7.3 Pricing
```
| Tier       | Price    | Renders/mo |
|------------|----------|------------|
| Free       | $0       | 1,000      |
| Pro        | $49/mo   | 50,000     |
| Team       | $149/mo  | 250,000    |
| Enterprise | Custom   | Unlimited  |

Overage: $0.001/render
```

---

## 8. CODE QUALITY INVARIANTS

### 8.1 TypeScript Standards
```typescript
// FORBIDDEN: The `any` escape hatch
function process(data: any) { }  // ❌ NEVER

// REQUIRED: Explicit types at boundaries
function process(data: unknown): Result<ProcessedData> {
  const parsed = Schema.safeParse(data);
  if (!parsed.success) return err(parsed.error);
  return ok(transform(parsed.data));
}

// REQUIRED: Explicit function signatures
function calculateScore(
  responses: Response[],
  weights: number[]
): number { }
```

### 8.2 Error Handling
```typescript
// ✅ Correct: Result for business logic
async function extractPage(url: string): Promise<Result<string, ExtractionError>> {
  const res = await firecrawl(url);
  if (!res.ok) return err({ code: 'EXTRACTION_FAILED', url });
  return ok(res.markdown);
}

// ❌ Wrong: Throwing for expected failures
async function extractPage(url: string): Promise<string> {
  const res = await firecrawl(url);
  if (!res.ok) throw new Error('Extraction failed');
  return res.markdown;
}
```

### 8.3 Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Functions | camelCase, verb prefix | `handleRender`, `isAIBot`, `canonicalize` |
| Types | PascalCase | `CustomerConfig`, `ExtractionError` |
| Constants | SCREAMING_SNAKE | `AI_BOTS`, `CACHE_TTL`, `PRIVATE_IP_PATTERNS` |
| KV keys | prefix:identifier | `md:${hash}`, `apikey:${token}` |

### 8.4 Logging Invariant

> ⚠️ **All logging MUST go through the `Logger` class. Direct `console.log` is FORBIDDEN.**

The worker has a `Logger` class that handles structured logging. Use it.

```typescript
// ✅ Correct: Use Logger
const logger = new Logger(request, ctx);
logger.info('Cache hit', { urlHash });
logger.error('Extraction failed', error);
logger.flush();  // Emits structured JSON at request end

// ❌ FORBIDDEN: Direct console.log
console.log('Debug:', url);  // NO! Unstructured, violates privacy rules.
```

**RequestLog Schema (emitted by Logger):**

```typescript
interface RequestLog {
  requestId: string;          // CF Ray ID or generated UUID
  customerId: CustomerId;     
  plan: 'free' | 'pro' | 'team' | 'enterprise';  // Cost attribution
  urlHash: UrlHash;           // Never log full URLs by default (privacy)
  status: 'hit' | 'miss' | 'fallback' | 'error';
  errorCode?: string;         // 'auth_failed' | 'domain_denied' | 'extraction_timeout' | ...
  latencyMs: number;
  timestamp: string;
}
```

**Rules:**
- Do NOT log full URLs unless explicitly enabled per-customer (PII risk)
- Include `requestId` in all error responses for customer debugging
- `status` is the canonical outcome field; don't add redundant booleans

**Debugging production issues:**
- Filter by `customerId` + time range
- Check `status` distribution (high fallback rate = extraction problem)
- Check `errorCode` for auth/validation failures

**Scaling note:** At high volumes (>1M req/day), consider sampling logs 
(e.g., 10% of `hit` requests, 100% of `error`/`fallback`). 
Always log 100% of errors for debugging.

---

## 9. TWO-PASS CODE GENERATION

### 9.1 Pre-Implementation Planning

Before ANY code edit:

1. **State understanding**: "I need to add X because Y"
2. **List files to examine**: Which files will this touch?
3. **Describe approach**: 3-5 numbered steps
4. **Identify risks**: Edge cases, breaking changes, security concerns

### 9.2 Self-Review Checklist

Before outputting code, verify:

- [ ] No `any` types
- [ ] All functions have explicit return types
- [ ] Error handling uses Result<T> internally
- [ ] No direct console.log (all logging via Logger class)
- [ ] Crawler responses are always 200
- [ ] Domain allowlist checked before any fetch
- [ ] Private IPs blocked
- [ ] Sensitive headers stripped

### 9.3 AI Slop Detection

Remove these patterns before outputting:

- [ ] `Array.isArray(x)` when `x: T[]` (redundant type guard)
- [ ] Orphaned numbered comments (`// 3.` without 1, 2)
- [ ] SAFETY:/NOTE:/IMPORTANT: prefixes
- [ ] `as any` casts
- [ ] Duplicate JSDoc lines
- [ ] Defensive checks on typed parameters

---

## 10. TASK DECOMPOSITION

For complex tasks, decompose into atomic steps:

**Bad (monolithic):**
```
"Add webhook invalidation to the worker"
```

**Good (decomposed):**
```
1. Define WebhookPayload type
2. Add POST /_rosetta/invalidate route
3. Validate webhook signature
4. Parse URL from payload
5. Delete cache key
6. Return 200
7. Add to README
```

Each step is atomic and independently verifiable.

---

## 11. TESTING CHECKLIST

### 11.1 Worker Tests
```
□ Auth: Invalid token returns 401
□ Auth: Missing token returns 401
□ URL: Missing url param returns 400
□ URL: Invalid URL returns 400
□ URL: HTTP (not HTTPS) returns 400
□ URL: Domain not in allowlist returns 403
□ URL: Private IP returns 400
□ Cache: Hit returns cached MD
□ Cache: Miss extracts and caches
□ Single-flight: Concurrent requests dedupe
□ Fallback: Extraction timeout returns origin HTML
□ Fallback: Extraction error returns origin HTML
```

### 11.2 Middleware Tests
```
□ Detects GPTBot → calls Rosetta API
□ Detects ClaudeBot → calls Rosetta API
□ Ignores Googlebot (regular) → passes through
□ Ignores Twitterbot (social) → passes through
□ Falls back on Rosetta error → passes through
□ Falls back on timeout → passes through
□ Never breaks the site
```

---

## 12. DECISION LOG

### Why Prerender model (not proxy)?
```
Proxy requires:
- Customer points DNS at us
- We handle ALL traffic
- High trust required
- We're in critical path

Prerender model:
- Customer deploys 10 lines of middleware
- We only see bot traffic
- Low trust required
- We're never in critical path for humans

Winner: Prerender model. Same as Prerender.io ($2.5M ARR).
```

### Why not llms.txt?
```
llms.txt is a proposed standard for AI crawler discovery.
Problem: No AI crawler actually reads it yet.

Semrush tested: "From mid-August to late October 2025, 
the llms.txt page received zero visits from GPTBot, 
ClaudeBot, or PerplexityBot."

We solve the actual problem (serve clean content to bots)
without waiting for standards adoption.
```

### Why only AI bots, not social/SEO?
```
Social bots (Twitterbot, Slackbot):
- Need HTML with OG meta tags for previews
- Serving MD breaks link previews

SEO bots (Ahrefs, Screaming Frog):
- Need real HTML for audits
- Serving MD breaks their analysis

Search engines (Googlebot, Bingbot):
- Execute JavaScript themselves
- Don't need our help

AI bots (GPTBot, ClaudeBot):
- Cannot execute JavaScript
- Need clean, token-efficient content
- This is our market
```

---

## 13. FUTURE PHASES

### Phase 2: Scale (100+ customers)

Add when Phase 1 breaks:
- CF Queues for async extraction
- R2 for cold storage
- Cache invalidation API
- **Best-effort rate limiting via KV counters (soft limits only)**

> **Rate limiting semantics:** KV is eventually consistent. KV-based counters 
> enforce soft limits (may allow small overages under concurrency). 
> Acceptable for preventing runaway usage, not for billing enforcement.
> 
> **Enterprise / strict enforcement:** Use Durable Objects for exact counting.

#### 13.1.1 Cache Invalidation API (Phase 2 Requirement)

Customers MUST have a way to invalidate cache on-demand. Without this, content updates can take up to 24h to propagate to AI crawlers.

**Implementation:**

1. Define `WebhookPayload` type:
```typescript
interface InvalidatePayload {
  url: string;           // URL to invalidate
  signature: string;     // HMAC-SHA256(url + timestamp, customerSecret)
  timestamp: string;     // ISO timestamp (reject if >5min old)
}
```

2. Add `POST /_rosetta/invalidate` route to worker
3. Validate HMAC signature (per-customer secret)
4. Canonicalize URL → compute hash
5. Delete `md:${hash}` from KV
6. Return `200 { status: 'ok', urlHash }`

**Dashboard integration:**
- "Re-crawl URL" button calls internal invalidate API
- Batch invalidation for path patterns (future)

### Phase 3: Margin (500+ customers)
```
Add when extraction costs hurt:
- Self-hosted Puppeteer fleet (Fly.io)
- Cost drops from $0.0007/page to $0.0001/page
```

### Phase 4: Enterprise
```
Add when enterprises ask:
- Durable Objects for rate limiting
- Bot analytics dashboard
- Custom extraction rules
- SLA guarantees
```

---

## 14. QUICK REFERENCE

### Key Files

| File | Purpose |
|------|---------|
| `worker/index.js` | Core API (production) |
| `packages/vercel/index.ts` | Vercel middleware SDK |
| `packages/express/index.ts` | Express middleware SDK |
| `dashboard/app/page.tsx` | Signup / home |

### Environment Variables
```env
# Worker (wrangler.toml)
FIRECRAWL_API_KEY=fc-xxx

# Dashboard
NEXT_PUBLIC_API_URL=https://api.rosetta.ai
```

### Common Commands
```bash
# Worker development (from repo root)
pnpm --filter worker dev

# Or directly
cd worker && pnpm dev

# Deploy worker
cd worker && pnpm deploy

# Test endpoint
curl "http://localhost:8787/render?url=https://example.com" \
  -H "X-Rosetta-Token: test_token"

# Add customer (manual)
wrangler kv:key put --binding=ROSETTA_CACHE "apikey:sk_xxx" \
  '{"id":"cust_123","domains":["example.com"],"plan":"pro"}'
```

---

> "Ship the 150-line version. Add complexity when customers demand it."
