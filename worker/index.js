/**
 * ROSETTA WORKER - MVP Edition
 * 
 * Modes:
 * 1. API Mode: GET /render?url=X (with X-Rosetta-Token auth) - For multi-tenant SaaS
 * 2. Proxy Mode: Bot detection on proxied requests - For self-hosted/demo
 * 3. Crawl API: POST/GET /_rosetta/crawl - For batch processing
 * 
 * Security:
 * - API mode requires auth token + domain allowlist
 * - Crawl API requires auth token
 * - Proxy mode restricted to configured origins only
 * 
 * Customer Config Schema (stored in KV as apikey:{token}):
 * {
 *   "id": "customer_123",
 *   "domains": ["example.com", "blog.example.com"],
 *   "bot_overrides": {
 *     "include": ["custom-internal-bot"],  // Additional bots to serve MD
 *     "exclude": ["bytespider"]            // Bots to exclude (serve HTML)
 *   }
 * }
 */

// --- CONFIGURATION ---
const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v1/scrape";
const FIRECRAWL_CRAWL_URL = "https://api.firecrawl.dev/v2/crawl";
const CACHE_TTL = 86400; // 24 hours for markdown (safer default to avoid stale content)
const HTML_CACHE_TTL = 7200; // 2 hours for HTML (shorter - only for debugging)
const EXTRACT_TIMEOUT_MS = 3000; // 3 seconds (increased from 2s)
const PENDING_TTL = 30; // Single-flight marker TTL
const MAX_CRAWL_PAGES = 100;
const DASHBOARD_API_URL = "https://dashboard.rosetta.ai";

// Canonicalization version — increment when changing canonicalize() logic
// Old cache entries become unreachable and expire naturally (see rules.md 5.1)
const CANON_VERSION = 'v1';

// SSRF protection: block private/internal IP ranges
const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // Loopback
  /^10\./,                           // Class A private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // Class B private
  /^192\.168\./,                     // Class C private
  /^169\.254\./,                     // Link-local
  /^0\./,                            // Current network
  /^::1$/,                           // IPv6 loopback
  /^fc00:/i,                         // IPv6 private
  /^fe80:/i,                         // IPv6 link-local
];

// Headers that should NOT be forwarded to origin (security)
const STRIP_HEADERS = [
  'x-rosetta-token',
  'authorization',       // Never leak auth credentials to origin
  'cf-connecting-ip',
  'cf-ray',
  'cf-ipcountry',
  'cf-visitor',
  'cf-worker',
  'true-client-ip',
  'x-real-ip',
  'x-forwarded-for',
];

// Headers safe to forward in fallback requests
const SAFE_FORWARD_HEADERS = [
  'accept',
  'accept-language',
  'accept-encoding',
];

// Allowed origins for proxy mode (add your domains here)
const ALLOWED_PROXY_ORIGINS = [
  'https://rossetto-demo.vercel.app',
];

// =============================================================================
// AI CRAWLERS ONLY
// =============================================================================
// These bots are fetching content for AI training or AI-powered search.
// They benefit from clean markdown. We do NOT include:
// - Social preview bots (need HTML with OG tags)
// - SEO crawlers (need real HTML for audits)
// - Regular search engines (execute JS, need HTML)
// =============================================================================
const AI_BOTS = [
  // OpenAI
  'gptbot',              // Training crawler
  'chatgpt-user',        // Real-time browsing/search
  'oai-searchbot',       // Search indexing

  // Anthropic
  'claudebot',           // Training crawler
  'claude-web',          // Real-time search

  // Google AI (NOT regular Googlebot)
  'google-extended',     // AI training opt-out signal
  'googleother',         // Non-search crawling

  // Microsoft/Bing AI
  'bingpreview',         // AI previews (not regular bingbot)

  // Perplexity
  'perplexitybot',       // Search + training

  // Amazon
  'amazonbot',           // Alexa / AI training

  // Apple
  'applebot-extended',   // AI training (Siri) - NOT regular applebot

  // Meta
  'meta-externalagent',  // AI training

  // Cohere
  'cohere-ai',           // Training

  // ByteDance
  'bytespider',          // Training (aggressive)

  // Common Crawl (used for AI training datasets)
  'ccbot',               // Common Crawl

  // Diffbot
  'diffbot',             // Extraction / training
];

// Extensions to ignore (static assets)
const IGNORE_EXT = [
  '.js', '.css', '.xml', '.less', '.png', '.jpg', '.jpeg', '.gif',
  '.pdf', '.doc', '.txt', '.ico', '.rss', '.zip', '.mp3', '.rar',
  '.exe', '.wmv', '.avi', '.ppt', '.mpg', '.mpeg', '.tif',
  '.wav', '.mov', '.psd', '.ai', '.xls', '.mp4', '.m4a', '.swf',
  '.dat', '.dmg', '.iso', '.flv', '.m4v', '.torrent', '.woff', '.woff2',
  '.ttf', '.svg', '.webmanifest', '.webp'
];

// Paths to NEVER scrape
const BLACKLIST = [
  '^/admin',
  '^/api',
  '^/private',
  '^/auth'
];

// Tracking params to remove during canonicalization
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'ref', 'mc_cid', 'mc_eid', '_ga', '_gl'
];

/**
 * Check if User-Agent is an AI bot (configurable per customer)
 * 
 * @param {string|null} ua - User-Agent header
 * @param {object|null} customerConfig - Optional customer config with bot_overrides
 * @returns {boolean}
 */
function isAIBot(ua, customerConfig = null) {
  if (!ua) return false;
  const lower = ua.toLowerCase();

  // Check customer excludes first (e.g., some hate ByteDance)
  const excludes = customerConfig?.bot_overrides?.exclude || [];
  if (excludes.some(bot => lower.includes(bot.toLowerCase()))) {
    return false;
  }

  // Check customer includes + default AI bots
  const includes = customerConfig?.bot_overrides?.include || [];
  const allBots = [...AI_BOTS, ...includes];

  return allBots.some(bot => lower.includes(bot.toLowerCase()));
}

/**
 * Check if hostname looks like a private/internal address
 * Note: This only catches literal IPs, not DNS resolution to private IPs
 * For full SSRF protection, enterprise would need resolved IP checking
 * 
 * @param {string} hostname
 * @returns {boolean}
 */
function isPrivateHost(hostname) {
  const lower = hostname.toLowerCase();

  // Check common private hostnames
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
    return true;
  }

  // Check private IP patterns
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(hostname));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- CORS Preflight Handler ---
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }

    // --- API MODE: GET /render?url=X ---
    if (url.pathname === '/render') {
      return handleRenderAPI(request, url, env, ctx);
    }

    // --- INTERNAL API MODE: GET /render/internal?customerId=...&url=... (service-auth) ---
    if (url.pathname === '/render/internal') {
      return handleRenderInternal(request, url, env, ctx);
    }

    // --- CONTENT API: GET /render/content?url=... (service-auth) ---
    // Returns cached markdown content for display in dashboard
    if (url.pathname === '/render/content') {
      return handleRenderContent(request, url, env, ctx);
    }

    // --- CRAWL API ROUTES (with auth) ---
    if (url.pathname === '/_rosetta/crawl' && request.method === 'POST') {
      return handleCrawlStart(request, env, ctx);
    }

    const crawlStatusMatch = url.pathname.match(/^\/_rosetta\/crawl\/([a-zA-Z0-9-]+)$/);
    if (crawlStatusMatch && request.method === 'GET') {
      return handleCrawlStatus(crawlStatusMatch[1], request, env, ctx);
    }

    // --- PROXY MODE (for demo/self-hosted) ---
    return handleProxyMode(request, url, env, ctx);
  }
};

// =============================================================================
// INTERNAL API MODE HANDLER - GET /render/internal?customerId=...&url=...
// Uses customer:<id> config in KV so the dashboard can trigger checks without
// storing plaintext customer tokens server-side.
// =============================================================================

async function handleRenderInternal(request, url, env, ctx) {
  const logger = new Logger(request, ctx);

  try {
    const expected = env.WORKER_INTERNAL_API_KEY;
    const auth = request.headers.get('Authorization');
    if (!expected || auth !== `Bearer ${expected}`) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const customerId = url.searchParams.get('customerId');
    const targetUrl = url.searchParams.get('url');
    if (!customerId) return jsonResponse({ error: 'Missing customerId parameter' }, 400);
    if (!targetUrl) return jsonResponse({ error: 'Missing url parameter' }, 400);

    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return jsonResponse({ error: 'Invalid URL format' }, 400);
    }
    if (parsed.protocol !== 'https:') {
      return jsonResponse({ error: 'URL must use https' }, 400);
    }
    if (isPrivateHost(parsed.hostname)) {
      return jsonResponse({ error: 'Private/internal addresses not allowed' }, 400);
    }

    let customer;
    try {
      customer = await env.ROSETTA_CACHE.get(`customer:${customerId}`, 'json');
    } catch (err) {
      logger.error('KV customer config lookup failed', err);
      return jsonResponse({ error: 'Auth service unavailable' }, 503);
    }

    if (!customer) {
      return jsonResponse({ error: 'Customer config not found' }, 404);
    }

    // Domain allowlist check (match dashboard normalization; strips www for allowlist)
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!customer.domains || !customer.domains.includes(hostname)) {
      return jsonResponse({ error: `Domain '${hostname}' not in allowlist` }, 403);
    }

    // Reuse the same extraction/cache logic as /render, but skip token auth.
    const canonical = canonicalize(targetUrl);
    const hash = await sha256(`${CANON_VERSION}:${canonical}`);

    const cacheKey = `md:${hash}`;
    const tokensKey = `tokens:${hash}`;
    let cached = null;
    try {
      cached = await env.ROSETTA_CACHE.get(cacheKey);
    } catch (err) {
      logger.error('KV cache read failed', err);
    }

    if (cached && !isHTML(cached)) {
      // Internal endpoint is for dashboard-triggered checks; return structured status
      // + token counts so the dashboard can update UI deterministically even if
      // the worker cannot callback into the dashboard environment.
      let htmlTokens = null;
      let mdTokens = estimateTokens(cached);
      try {
        const cachedTokens = await env.ROSETTA_CACHE.get(tokensKey, 'json');
        if (cachedTokens && typeof cachedTokens === 'object') {
          const ht = cachedTokens.htmlTokens;
          const mt = cachedTokens.mdTokens;
          if (typeof ht === 'number') htmlTokens = ht;
          if (typeof mt === 'number') mdTokens = mt;
        }
      } catch (err) {
        logger.error('KV tokens read failed', err);
      }
      logger.setCacheStatus('HIT');
      logger.meta.status = 200;
      ctx.waitUntil(Promise.resolve(logger.flush()));
      return jsonResponse({ ok: true, cacheStatus: 'HIT', canonical, htmlTokens, mdTokens }, 200);
    }

    const pendingKey = `pending:${hash}`;
    let pending = null;
    try {
      pending = await env.ROSETTA_CACHE.get(pendingKey);
    } catch (err) {
      logger.error('KV pending read failed', err);
    }

    if (pending) {
      for (let i = 0; i < 6; i++) {
        await sleep(500);
        try {
          const md = await env.ROSETTA_CACHE.get(cacheKey);
          if (md && !isHTML(md)) {
            logger.setCacheStatus('HIT');
            logger.meta.status = 200;
            ctx.waitUntil(Promise.resolve(logger.flush()));
            return jsonResponse(
              {
                ok: true,
                cacheStatus: 'HIT',
                canonical,
                htmlTokens: null,
                mdTokens: estimateTokens(md)
              },
              200
            );
          }
        } catch (err) {
          logger.error('KV poll read failed', err);
        }
      }
    }

    try {
      await env.ROSETTA_CACHE.put(pendingKey, Date.now().toString(), { expirationTtl: PENDING_TTL });
    } catch (err) {
      logger.error('KV pending write failed', err);
    }

    try {
      const scrapeResult = await scrapeWithTimeout(canonical, env.FIRECRAWL_API_KEY, EXTRACT_TIMEOUT_MS);
      if (scrapeResult && scrapeResult.markdown) {
        const md = scrapeResult.markdown;
        const html = scrapeResult.html;

        // Cache content using DRY helper
        const { htmlTokens, mdTokens } = cacheExtractedContent(env, ctx, hash, md, html, logger);
        
        ctx.waitUntil(
          env.ROSETTA_CACHE.delete(pendingKey)
            .catch(err => logger.error('KV pending delete failed', err))
        );

        // Send metrics to dashboard (best-effort)
        if (htmlTokens !== null) {
          ctx.waitUntil(
            sendTokenMetrics(env, customerId, canonical, htmlTokens, mdTokens)
              .catch(err => logger.error('Token metrics send failed', err))
          );
        }

        logger.setCacheStatus('MISS');
        logger.meta.status = 200;
        ctx.waitUntil(Promise.resolve(logger.flush()));
        return jsonResponse(
          { ok: true, cacheStatus: 'MISS', canonical, htmlTokens, mdTokens },
          200
        );
      }
    } catch (err) {
      logger.error('Extract failed', err);
    }

    ctx.waitUntil(
      env.ROSETTA_CACHE.delete(pendingKey)
        .catch(err => logger.error('KV pending delete failed', err))
    );

    // /render/internal is for dashboard; always return JSON (not HTML fallback)
    logger.setCacheStatus('FAIL');
    logger.meta.status = 200;
    ctx.waitUntil(Promise.resolve(logger.flush()));
    return jsonResponse(
      { ok: false, cacheStatus: 'FAIL', canonical, htmlTokens: null, mdTokens: null, error: 'Extraction failed' },
      200
    );
  } catch (err) {
    logger.error('Unhandled internal API error', err);
    return jsonResponse({ ok: false, error: 'Internal Server Error', requestId: logger.requestId }, 500);
  }
}

// =============================================================================
// CONTENT API HANDLER - GET /render/content?url=...
// Returns cached markdown + HTML content for dashboard display
//
// SECURITY MODEL (service-to-service):
// - Authenticated via WORKER_INTERNAL_API_KEY (shared secret with dashboard)
// - Dashboard is responsible for customer authorization
// - Cached content was validated at extraction time (domain allowlist)
// - This is a read-only cache lookup, not a data access control boundary
// =============================================================================

async function handleRenderContent(request, url, env, ctx) {
  const logger = new Logger(request, ctx);

  try {
    // Auth: service-to-service only (dashboard → worker)
    // Customer-level authorization happens in dashboard before calling this
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ ok: false, error: 'Missing authorization' }, 401);
    }
    const token = authHeader.slice(7);
    if (token !== env.WORKER_INTERNAL_API_KEY) {
      return jsonResponse({ ok: false, error: 'Invalid authorization' }, 403);
    }

    // Get target URL
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      return jsonResponse({ ok: false, error: 'Missing url parameter' }, 400);
    }

    // Canonicalize and hash
    const canonical = canonicalize(targetUrl);
    const hash = await sha256(`${CANON_VERSION}:${canonical}`);
    const mdCacheKey = `md:${hash}`;
    const htmlCacheKey = `html:${hash}`;
    const tokensKey = `tokens:${hash}`;

    // Try to get cached content (markdown + HTML if available)
    let mdContent = null;
    let htmlContent = null;
    let tokenData = null;

    try {
      mdContent = await env.ROSETTA_CACHE.get(mdCacheKey);
    } catch (err) {
      logger.error('KV MD cache read failed', err);
    }

    try {
      // HTML has shorter TTL (2h vs 24h) - may not be available
      htmlContent = await env.ROSETTA_CACHE.get(htmlCacheKey);
    } catch (err) {
      logger.error('KV HTML cache read failed', err);
    }

    try {
      tokenData = await env.ROSETTA_CACHE.get(tokensKey, 'json');
    } catch (err) {
      logger.error('KV tokens read failed', err);
    }

    const htmlTokens = tokenData?.htmlTokens ?? null;
    const mdTokens = tokenData?.mdTokens ?? (mdContent ? estimateTokens(mdContent) : null);

    ctx.waitUntil(Promise.resolve(logger.flush()));

    return jsonResponse({
      ok: true,
      canonical,
      htmlContent: htmlContent || null,  // May be null if expired (2h TTL)
      mdContent: mdContent || null,       // Available for 24h
      htmlTokens,
      mdTokens,
      htmlCached: !!htmlContent,
      mdCached: !!mdContent,
    }, 200);

  } catch (err) {
    logger.error('Unhandled content API error', err);
    return jsonResponse({ ok: false, error: 'Internal Server Error', requestId: logger.requestId }, 500);
  }
}

// =============================================================================
// OBSERVABILITY & LOGGING
// =============================================================================

const LOG_SAMPLE_RATE = 0.01; // 1% of success requests

class Logger {
  constructor(request, ctx) {
    this.start = Date.now();
    this.requestId = request.headers.get('cf-ray') || crypto.randomUUID();
    this.method = request.method;
    this.url = request.url;
    this.path = new URL(request.url).pathname;
    this.userAgent = request.headers.get('user-agent') || '';
    this.ctx = ctx;
    this.logs = [];
    this.meta = {
      botFamily: this.detectBotFamily(this.userAgent),
      tenantId: 'anonymous',
      cacheStatus: 'MISS',
      status: 200,
      originStatus: 0,
    };
  }

  detectBotFamily(ua) {
    const lower = ua.toLowerCase();
    if (lower.includes('gpt')) return 'gpt';
    if (lower.includes('claude')) return 'claude';
    if (lower.includes('google')) return 'google';
    if (lower.includes('bing')) return 'bing';
    if (lower.includes('perplexity')) return 'perplexity';
    if (lower.includes('amazon')) return 'amazon';
    if (lower.includes('facebook') || lower.includes('meta')) return 'meta';
    if (lower.includes('byte')) return 'bytedance';
    return 'unknown';
  }

  setTenant(id) {
    this.meta.tenantId = id;
  }

  setCacheStatus(status) {
    this.meta.cacheStatus = status;
  }

  setOriginStatus(status) {
    this.meta.originStatus = status;
  }

  error(msg, err) {
    this.logs.push({ level: 'error', msg, err: err?.message || String(err), stack: err?.stack });
    this.flush(true); // Always flush errors
  }

  info(msg, data) {
    this.logs.push({ level: 'info', msg, data });
  }

  flush(force = false) {
    const duration = Date.now() - this.start;
    const isError = this.logs.some(l => l.level === 'error');

    if (!force && !isError && Math.random() > LOG_SAMPLE_RATE) {
      return;
    }

    const envelope = {
      requestId: this.requestId,
      timestamp: new Date().toISOString(),
      method: this.method,
      path: this.path,
      botFamily: this.meta.botFamily,
      tenantId: this.meta.tenantId,
      status: this.meta.status,
      cacheStatus: this.meta.cacheStatus,
      originStatus: this.meta.originStatus || this.meta.status, // Fallback if not set
      latencyMs: duration,
      logs: this.logs
    };

    console.log(JSON.stringify(envelope));
  }
}

// =============================================================================
// API MODE HANDLER - GET /render?url=X
// =============================================================================

async function handleRenderAPI(request, url, env, ctx) {
  const logger = new Logger(request, ctx);

  try {
    const result = await _handleRenderLogic(request, url, env, ctx, logger);
    logger.meta.status = result.status;
    ctx.waitUntil(Promise.resolve(logger.flush()));
    return result;
  } catch (err) {
    logger.error('Unhandled API Error', err);
    return jsonResponse({ error: 'Internal Server Error', requestId: logger.requestId }, 500);
  }
}

async function _handleRenderLogic(request, url, env, ctx, logger) {
  // 1. AUTH
  const token = request.headers.get('X-Rosetta-Token');
  if (!token) {
    return jsonResponse({ error: 'Missing X-Rosetta-Token header' }, 401);
  }

  let customer;
  try {
    const tokenHash = await sha256(token);
    customer = await env.ROSETTA_CACHE.get(`apikeyhash:${tokenHash}`, 'json');

    if (!customer) {
      customer = await env.ROSETTA_CACHE.get(`apikey:${token}`, 'json');
    }
  } catch (err) {
    logger.error('KV auth lookup failed', err);
    return jsonResponse({ error: 'Auth service unavailable' }, 503);
  }

  if (!customer) {
    return jsonResponse({ error: 'Invalid API token' }, 401);
  }

  const customerId = customer.id || customer.customerId;
  if (!customerId) {
    return jsonResponse({ error: 'Invalid customer config format' }, 500);
  }
  logger.setTenant(customerId);

  // 2. VALIDATE URL
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return jsonResponse({ error: 'Missing url parameter' }, 400);
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return jsonResponse({ error: 'Invalid URL format' }, 400);
  }

  if (parsed.protocol !== 'https:') {
    return jsonResponse({ error: 'URL must use https' }, 400);
  }

  // Domain allowlist check
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!customer.domains || !customer.domains.includes(hostname)) {
    return jsonResponse({ error: `Domain '${hostname}' not in allowlist` }, 403);
  }

  // SSRF protection: block private/internal IPs
  if (isPrivateHost(parsed.hostname)) {
    return jsonResponse({ error: 'Private/internal addresses not allowed' }, 400);
  }

  // 3. CANONICALIZE
  const canonical = canonicalize(targetUrl);
  const hash = await sha256(`${CANON_VERSION}:${canonical}`);

  // 4. CACHE CHECK (with error handling)
  const cacheKey = `md:${hash}`;
  let cached = null;
  try {
    cached = await env.ROSETTA_CACHE.get(cacheKey);
  } catch (err) {
    logger.error('KV cache read failed', err);
    // Continue to extraction
  }

  if (cached && !isHTML(cached)) {
    logger.setCacheStatus('HIT');
    return new Response(cached, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'X-Rosetta-Status': 'hit',
        'Cache-Control': 'public, max-age=3600',
      }
    });
  }

  // 5. SINGLE-FLIGHT CHECK
  const pendingKey = `pending:${hash}`;
  let pending = null;
  try {
    pending = await env.ROSETTA_CACHE.get(pendingKey);
  } catch (err) {
    logger.error('KV pending read failed', err);
  }

  if (pending) {
    // Wait for other request to finish (poll up to 3s)
    for (let i = 0; i < 6; i++) {
      await sleep(500);
      try {
        const md = await env.ROSETTA_CACHE.get(cacheKey);
        if (md && !isHTML(md)) {
          logger.setCacheStatus('HIT');
          return new Response(md, {
            headers: {
              'Content-Type': 'text/markdown; charset=utf-8',
              'X-Rosetta-Status': 'hit',
              'Cache-Control': 'public, max-age=3600',
            }
          });
        }
      } catch (err) {
        logger.error('KV poll read failed', err);
      }
    }
    // Timed out waiting, return fallback
    logger.setCacheStatus('MISS');
    return await fetchFallback(canonical, request);
  }

  // 6. EXTRACT (with single-flight marker)
  try {
    await env.ROSETTA_CACHE.put(pendingKey, Date.now().toString(), { expirationTtl: PENDING_TTL });
  } catch (err) {
    logger.error('KV pending write failed', err);
  }

  try {
    const scrapeResult = await scrapeWithTimeout(canonical, env.FIRECRAWL_API_KEY, EXTRACT_TIMEOUT_MS);

    if (scrapeResult && scrapeResult.markdown) {
      const md = scrapeResult.markdown;
      const html = scrapeResult.html;

      // Cache content using DRY helper
      const { htmlTokens, mdTokens } = cacheExtractedContent(env, ctx, hash, md, html, logger);

      // Clean up pending marker
      ctx.waitUntil(
        env.ROSETTA_CACHE.delete(pendingKey)
          .catch(err => logger.error('KV pending delete failed', err))
      );

      // Track usage (fire and forget)
      ctx.waitUntil(incrementUsage(env, customerId));

      // Send metrics to dashboard (best-effort)
      if (htmlTokens !== null) {
        ctx.waitUntil(
          sendTokenMetrics(env, customerId, canonical, htmlTokens, mdTokens)
            .catch(err => logger.error('Token metrics send failed', err))
        );
      }

      logger.setCacheStatus('MISS');
      return new Response(md, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'X-Rosetta-Status': 'miss',
          'Cache-Control': 'public, max-age=3600',
        }
      });
    }
  } catch (err) {
    logger.error('Extract failed', err);
  }

  // Clean up pending marker on failure
  ctx.waitUntil(
    env.ROSETTA_CACHE.delete(pendingKey)
      .catch(err => logger.error('KV pending delete failed', err))
  );

  return await fetchFallback(canonical, request);
}

// =============================================================================
// PROXY MODE HANDLER (for demo/self-hosted)
// =============================================================================

async function handleProxyMode(request, url, env, ctx) {
  const userAgent = (request.headers.get('user-agent') || '').toLowerCase();

  // Determine target origin
  let targetOrigin = null;
  const targetParam = url.searchParams.get('target');

  if (targetParam) {
    try {
      const parsedTarget = new URL(targetParam);
      // Security: Only allow configured origins
      if (ALLOWED_PROXY_ORIGINS.includes(parsedTarget.origin)) {
        targetOrigin = parsedTarget.origin;
      } else {
        return jsonResponse({ error: 'Target origin not allowed' }, 403);
      }
    } catch {
      return jsonResponse({ error: 'Invalid target URL' }, 400);
    }
  } else {
    // Default to first allowed origin
    targetOrigin = ALLOWED_PROXY_ORIGINS[0];
  }

  // Construct target URL
  const targetUrl = new URL(targetOrigin + url.pathname);
  url.searchParams.forEach((value, key) => {
    if (key !== 'target') {
      targetUrl.searchParams.append(key, value);
    }
  });

  // Detection logic
  const isBot = isAIBot(userAgent); // Only AI bots, not social/SEO/search
  const isAsset = IGNORE_EXT.some(ext => url.pathname.toLowerCase().endsWith(ext));
  const isBlacklisted = BLACKLIST.some(pattern => new RegExp(pattern).test(url.pathname));

  // Human/asset/blacklisted/non-AI-bot: pass through to origin
  // Social bots (Twitter, Slack) get HTML with OG tags
  // SEO bots (Ahrefs) get real HTML
  // Only AI bots get markdown
  if (!isBot || isAsset || isBlacklisted) {
    return proxyToOrigin(targetUrl, request);
  }

  // Bot path: check cache then scrape
  const canonical = canonicalize(targetUrl.toString());
  const hash = await sha256(`${CANON_VERSION}:${canonical}`);
  const cacheKey = `md:${hash}`;

  // Cache lookup with error handling
  let cachedMD = null;
  try {
    cachedMD = await env.ROSETTA_CACHE.get(cacheKey);
  } catch (err) {
    console.error('KV cache read failed:', err);
  }

  if (cachedMD && !isHTML(cachedMD)) {
    return new Response(cachedMD, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Vary': 'User-Agent',
        'X-Rosetta-Status': 'HIT',
        'X-Rosetta-Savings': '98%'
      }
    });
  }

  // Single-flight check
  const pendingKey = `pending:${hash}`;
  let pending = null;
  try {
    pending = await env.ROSETTA_CACHE.get(pendingKey);
  } catch (err) {
    console.error('KV pending read failed:', err);
  }

  if (pending) {
    // Wait for other request
    for (let i = 0; i < 6; i++) {
      await sleep(500);
      try {
        const md = await env.ROSETTA_CACHE.get(cacheKey);
        if (md && !isHTML(md)) {
          return new Response(md, {
            headers: {
              'Content-Type': 'text/markdown; charset=utf-8',
              'Vary': 'User-Agent',
              'X-Rosetta-Status': 'HIT',
              'X-Rosetta-Savings': '98%'
            }
          });
        }
      } catch (err) {
        console.error('KV poll read failed:', err);
      }
    }
    // Timeout, fall through to scrape or origin
  }

  // Set pending marker
  try {
    await env.ROSETTA_CACHE.put(pendingKey, Date.now().toString(), { expirationTtl: PENDING_TTL });
  } catch (err) {
    console.error('KV pending write failed:', err);
  }

  // Scrape with timeout
  let scrapeResult = null;
  try {
    scrapeResult = await scrapeWithTimeout(canonical, env.FIRECRAWL_API_KEY, EXTRACT_TIMEOUT_MS);
  } catch (err) {
    console.error('Scrape failed:', err);
  }

  // Clean up pending marker
  ctx.waitUntil(
    env.ROSETTA_CACHE.delete(pendingKey)
      .catch(err => console.error('KV pending delete failed:', err))
  );

  if (scrapeResult?.markdown) {
    // Cache content using DRY helper (includes HTML for dashboard debugging)
    cacheExtractedContent(env, ctx, hash, scrapeResult.markdown, scrapeResult.html);

    return new Response(scrapeResult.markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Vary': 'User-Agent',
        'X-Rosetta-Status': 'MISS (Rendered)'
      }
    });
  }

  // Fallback to origin HTML
  // Rule: Always return 200 to crawlers. Expose original status via header.
  const response = await proxyToOrigin(targetUrl, request);
  const originStatus = response.status;
  const newResponse = new Response(response.body, {
    status: 200,
    headers: response.headers,
  });
  newResponse.headers.set('X-Rosetta-Status', 'FAIL (Fallback)');
  newResponse.headers.set('X-Rosetta-Origin-Status', String(originStatus));
  newResponse.headers.set('Vary', 'User-Agent');
  return newResponse;
}

// =============================================================================
// CRAWL API HANDLERS (with auth)
// =============================================================================

async function handleCrawlStart(request, env, ctx) {
  // Auth check
  const token = request.headers.get('X-Rosetta-Token');
  if (!token) {
    return jsonResponse({ error: 'Missing X-Rosetta-Token header' }, 401);
  }

  let customer;
  try {
    const tokenHash = await sha256(token);
    customer = await env.ROSETTA_CACHE.get(`apikeyhash:${tokenHash}`, 'json');

    if (!customer) {
      customer = await env.ROSETTA_CACHE.get(`apikey:${token}`, 'json');
    }
  } catch (err) {
    console.error('KV auth lookup failed:', err);
    return jsonResponse({ error: 'Auth service unavailable' }, 503);
  }

  if (!customer) {
    return jsonResponse({ error: 'Invalid API token' }, 401);
  }

  const customerId = customer.id || customer.customerId;
  if (!customerId) {
    return jsonResponse({ error: 'Invalid customer config format' }, 500);
  }

  try {
    const body = await request.json();
    const { url: targetUrl, mode = 'single', limit = MAX_CRAWL_PAGES, cacheResults = true } = body;

    if (!targetUrl) {
      return jsonResponse({ error: 'Missing required field: url' }, 400);
    }

    // Validate URL
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return jsonResponse({ error: 'Invalid URL provided' }, 400);
    }

    // Domain allowlist check
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!customer.domains || !customer.domains.includes(hostname)) {
      return jsonResponse({ error: `Domain '${hostname}' not in allowlist` }, 403);
    }

    const effectiveLimit = Math.min(limit, MAX_CRAWL_PAGES);

    if (mode === 'single') {
      const scrapeResult = await scrapeWithTimeout(targetUrl, env.FIRECRAWL_API_KEY, 10000); // Longer timeout for single
      const markdown = scrapeResult?.markdown || null;
      const html = scrapeResult?.html || null;

      if (markdown && cacheResults) {
        const canonical = canonicalize(targetUrl);
        const hash = await sha256(`${CANON_VERSION}:${canonical}`);
        // Cache content using DRY helper (includes HTML for dashboard debugging)
        cacheExtractedContent(env, ctx, hash, markdown, html);
      }

      return jsonResponse({
        success: !!markdown,
        mode: 'single',
        url: targetUrl,
        cached: cacheResults && !!markdown,
        data: markdown ? { markdown } : null
      });
    }

    // Full site crawl - asynchronous
    const crawlResponse = await fetch(FIRECRAWL_CRAWL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.FIRECRAWL_API_KEY}`
      },
      body: JSON.stringify({
        url: targetUrl,
        limit: effectiveLimit,
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true
        }
      })
    });

    if (!crawlResponse.ok) {
      const errorText = await crawlResponse.text();
      console.error(`Firecrawl Crawl API Error: ${crawlResponse.status}`);
      return jsonResponse({ error: 'Failed to start crawl' }, 500);
    }

    const crawlData = await crawlResponse.json();

    if (!crawlData.success || !crawlData.id) {
      return jsonResponse({ error: 'Invalid response from Firecrawl' }, 500);
    }

    // Store crawl metadata (include allowedDomains for validation on cache write)
    const crawlMeta = {
      id: crawlData.id,
      customerId: customerId,
      url: targetUrl,
      limit: effectiveLimit,
      cacheResults,
      allowedDomains: customer.domains || [],
      startedAt: new Date().toISOString(),
      status: 'crawling'
    };
    await env.ROSETTA_CACHE.put(`crawl::${crawlData.id}`, JSON.stringify(crawlMeta), { expirationTtl: 3600 });

    return jsonResponse({
      success: true,
      mode: 'full',
      crawlId: crawlData.id,
      statusUrl: `/_rosetta/crawl/${crawlData.id}`,
      url: targetUrl,
      limit: effectiveLimit,
      message: `Crawl started. Poll /_rosetta/crawl/${crawlData.id} to check status.`
    });

  } catch (err) {
    console.error('Crawl start error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

async function handleCrawlStatus(crawlId, request, env, ctx) {
  // Auth check
  const token = request.headers.get('X-Rosetta-Token');
  if (!token) {
    return jsonResponse({ error: 'Missing X-Rosetta-Token header' }, 401);
  }

  let customer;
  try {
    const tokenHash = await sha256(token);
    customer = await env.ROSETTA_CACHE.get(`apikeyhash:${tokenHash}`, 'json');

    if (!customer) {
      customer = await env.ROSETTA_CACHE.get(`apikey:${token}`, 'json');
    }
  } catch (err) {
    console.error('KV auth lookup failed:', err);
    return jsonResponse({ error: 'Auth service unavailable' }, 503);
  }

  if (!customer) {
    return jsonResponse({ error: 'Invalid API token' }, 401);
  }

  const customerId = customer.id || customer.customerId;
  if (!customerId) {
    return jsonResponse({ error: 'Invalid customer config format' }, 500);
  }

  try {
    // Get stored metadata
    const metaRaw = await env.ROSETTA_CACHE.get(`crawl::${crawlId}`);
    const meta = metaRaw ? JSON.parse(metaRaw) : null;

    // Verify ownership
    if (meta && meta.customerId !== customerId) {
      return jsonResponse({ error: 'Crawl job not found' }, 404);
    }

    // Poll Firecrawl for status
    const statusResponse = await fetch(`${FIRECRAWL_CRAWL_URL}/${crawlId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${env.FIRECRAWL_API_KEY}`
      }
    });

    if (!statusResponse.ok) {
      if (statusResponse.status === 404) {
        return jsonResponse({ error: 'Crawl job not found' }, 404);
      }
      return jsonResponse({ error: 'Failed to get crawl status' }, 500);
    }

    const statusData = await statusResponse.json();

    // If completed, cache results (in background to avoid timeout)
    if (statusData.status === 'completed' && statusData.data && meta?.cacheResults) {
      // Use ctx.waitUntil to ensure caching completes even after response
      // Extract allowed domains from meta to filter off-domain crawl results
      const allowedDomains = meta.allowedDomains || [];
      ctx.waitUntil((async () => {
        try {
          for (const page of statusData.data) {
            if (page.markdown && page.metadata?.sourceURL) {
              // Validate domain is in customer allowlist before caching
              const pageUrl = new URL(page.metadata.sourceURL);
              const pageHost = pageUrl.hostname.toLowerCase().replace(/^www\./, '');
              if (allowedDomains.length > 0 && !allowedDomains.includes(pageHost)) {
                console.warn(`Skipping off-domain crawl result: ${page.metadata.sourceURL}`);
                continue;
              }
              const canonical = canonicalize(page.metadata.sourceURL);
              const hash = await sha256(`${CANON_VERSION}:${canonical}`);
              await env.ROSETTA_CACHE.put(`md:${hash}`, page.markdown, { expirationTtl: CACHE_TTL });
            }
          }
        } catch (err) {
          console.error('Crawl cache write failed:', err);
        }
      })());

      // Update meta
      if (meta) {
        meta.status = 'completed';
        meta.cachedPages = statusData.data.length;
        meta.completedAt = new Date().toISOString();
        await env.ROSETTA_CACHE.put(`crawl::${crawlId}`, JSON.stringify(meta), { expirationTtl: 3600 });
      }

      return jsonResponse({
        success: true,
        crawlId,
        status: 'completed',
        totalPages: statusData.data.length,
        pages: statusData.data.map(p => ({
          url: p.metadata?.sourceURL,
          title: p.metadata?.title,
          cached: true
        }))
      });
    }

    // Still in progress
    return jsonResponse({
      success: true,
      crawlId,
      status: statusData.status,
      total: statusData.total || 0,
      completed: statusData.completed || 0,
      creditsUsed: statusData.creditsUsed || 0,
      expiresAt: statusData.expiresAt
    });

  } catch (err) {
    console.error('Crawl status error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Canonicalize URL for consistent cache keys
 */
function canonicalize(urlString) {
  const parsed = new URL(urlString);
  parsed.hash = '';
  // IMPORTANT:
  // Do NOT strip `www.` here. Some sites (including many Next.js deployments) serve
  // different content (or even 404) on apex vs www. We want to fetch/scrape the
  // exact host the user requested.
  parsed.hostname = parsed.hostname.toLowerCase();

  // Remove tracking params
  for (const param of TRACKING_PARAMS) {
    parsed.searchParams.delete(param);
  }

  // Sort remaining params for consistency
  parsed.searchParams.sort();
  return parsed.toString();
}

/**
 * SHA-256 hash for cache keys
 */
async function sha256(str) {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if content is HTML (not markdown)
 * Handles edge cases: XHTML (<?xml), BOM characters, comments before doctype
 */
function isHTML(content) {
  if (!content) return false;
  // Remove BOM if present and trim
  const trimmed = content.replace(/^\uFEFF/, '').trim().toLowerCase();
  return trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<?xml') ||  // XHTML
    (trimmed.startsWith('<!--') && trimmed.includes('<html'));
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Cache extracted content (markdown + optional HTML for debugging)
 * DRY helper used by all extraction paths
 * 
 * @param {object} env - Worker env bindings
 * @param {object} ctx - Worker context (for waitUntil)
 * @param {string} hash - URL hash for cache keys
 * @param {string} md - Markdown content
 * @param {string|null} html - Raw HTML (optional, for dashboard debugging)
 * @param {object|null} logger - Optional logger for error reporting
 */
function cacheExtractedContent(env, ctx, hash, md, html, logger = null) {
  const mdKey = `md:${hash}`;
  const htmlKey = `html:${hash}`;
  const tokensKey = `tokens:${hash}`;

  // Cache markdown (24h) - served to bots
  ctx.waitUntil(
    env.ROSETTA_CACHE.put(mdKey, md, { expirationTtl: CACHE_TTL })
      .catch(err => logger?.error?.('KV MD cache write failed', err) || console.error('KV MD cache write failed:', err))
  );

  // Cache HTML (2h) - for dashboard debugging only
  if (html) {
    ctx.waitUntil(
      env.ROSETTA_CACHE.put(htmlKey, html, { expirationTtl: HTML_CACHE_TTL })
        .catch(err => logger?.error?.('KV HTML cache write failed', err) || console.error('KV HTML cache write failed:', err))
    );
  }

  // Cache token counts for metrics
  const htmlTokens = html ? estimateTokens(html) : null;
  const mdTokens = estimateTokens(md);
  ctx.waitUntil(
    env.ROSETTA_CACHE.put(tokensKey, JSON.stringify({ htmlTokens, mdTokens, ts: Date.now() }), { expirationTtl: CACHE_TTL })
      .catch(err => logger?.error?.('KV tokens cache write failed', err) || console.error('KV tokens cache write failed:', err))
  );

  return { htmlTokens, mdTokens };
}

async function scrapeWithTimeout(targetUrl, apiKey, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Fetch raw HTML from origin AND markdown from Firecrawl in parallel
    // This gives us accurate token savings: raw HTML vs clean markdown
    const [firecrawlResponse, rawHtmlResponse] = await Promise.all([
      fetch(FIRECRAWL_SCRAPE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          url: targetUrl,
          formats: ['markdown'],
          onlyMainContent: true,
        }),
        signal: controller.signal
      }),
      // Fetch raw HTML directly from origin with browser User-Agent
      fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
        redirect: 'follow',
      }).catch((err) => {
        console.error(`Raw HTML fetch failed for ${targetUrl}:`, err?.message || err);
        return null;
      })
    ]);

    clearTimeout(timeout);

    if (!firecrawlResponse.ok) {
      console.error(`Firecrawl API Error: ${firecrawlResponse.status}`);
      return null;
    }

    const json = await firecrawlResponse.json();

    if (!json.success || !json.data || !json.data.markdown) {
      console.error('Invalid Firecrawl response format');
      return null;
    }

    const md = json.data.markdown;
    
    // Get raw HTML from origin (for accurate token comparison)
    let rawHtml = null;
    if (rawHtmlResponse) {
      if (rawHtmlResponse.ok) {
        try {
          rawHtml = await rawHtmlResponse.text();
          console.log(`Raw HTML fetched: ${rawHtml.length} bytes from ${targetUrl}`);
        } catch (err) {
          console.warn('Failed to read raw HTML response:', err);
        }
      } else {
        console.warn(`Raw HTML fetch returned ${rawHtmlResponse.status} for ${targetUrl}`);
      }
    } else {
      console.warn(`Raw HTML response is null for ${targetUrl}`);
    }

    if (isHTML(md)) {
      console.error('Firecrawl returned HTML instead of Markdown');
      return null;
    }

    return { markdown: md, html: rawHtml };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.warn(`Firecrawl timed out after ${timeoutMs}ms`);
    } else {
      console.error('Scrape exception:', err);
    }
    return null;
  }
}

/**
 * Fetch fallback HTML from origin
 * Forwards safe headers from original request for localization, etc.
 * 
 * @param {string} url - URL to fetch
 * @param {Request|null} originalRequest - Original request to forward headers from
 */
async function fetchFallback(url, originalRequest = null) {
  try {
    const headers = new Headers();

    // Forward safe headers from original request
    if (originalRequest) {
      for (const h of SAFE_FORWARD_HEADERS) {
        const val = originalRequest.headers.get(h);
        if (val) headers.set(h, val);
      }
    }

    const res = await fetch(url, { headers });
    const html = await res.text();
    // Rule: Always return 200 to crawlers. Expose original status via header.
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Rosetta-Status': 'fallback',
        'X-Rosetta-Origin-Status': String(res.status),
      }
    });
  } catch {
    // Rule 1.3.2: Never return 5xx to crawlers
    return new Response('<!-- Rosetta: Origin unavailable -->', {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Rosetta-Status': 'error',
        'X-Rosetta-Origin-Status': 'unavailable',
      }
    });
  }
}

/**
 * Proxy request to origin
 * Strips sensitive headers (API tokens, CF internal headers) before forwarding
 */
async function proxyToOrigin(targetUrl, request, logger = null) {
  // Clone headers and strip sensitive ones
  const headers = new Headers(request.headers);
  for (const h of STRIP_HEADERS) {
    headers.delete(h);
  }
  headers.set('Host', targetUrl.hostname);

  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'follow',
  });

  const response = await fetch(proxyRequest);

  if (logger) {
    logger.setOriginStatus(response.status);
  }

  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Vary', 'User-Agent');
  return newResponse;
}

/**
 * Increment usage counter
 * 
 * NOTE: This has a race condition (read-modify-write is not atomic).
 * Two concurrent requests may read the same value and both increment to +1.
 * For MVP this is acceptable (~1-5% undercount under load).
 * 
 * TODO: For accurate billing, migrate to:
 * - Upstash Redis INCR (atomic)
 * - Durable Objects counter
 * - Analytics Engine (append-only)
 */
async function incrementUsage(env, customerId) {
  try {
    const month = new Date().toISOString().slice(0, 7); // "2025-01"
    const key = `usage:${customerId}:${month}`;
    const current = parseInt(await env.ROSETTA_CACHE.get(key) || '0');
    await env.ROSETTA_CACHE.put(key, (current + 1).toString(), { expirationTtl: 86400 * 90 });
  } catch (err) {
    console.error('Usage increment failed:', err);
  }
}

async function sendTokenMetrics(env, customerId, url, htmlTokens, mdTokens) {
  try {
    if (!env.DASHBOARD_API_KEY) return;
    const dashboardUrl = env.DASHBOARD_API_URL || DASHBOARD_API_URL;
    const apiUrl = `${dashboardUrl}/api/metrics/tokens`;

    await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DASHBOARD_API_KEY}`,
      },
      body: JSON.stringify({
        customerId,
        url,
        htmlTokens,
        mdTokens,
        optimizedAt: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error('Failed to send token metrics:', err);
  }
}

// TODO: Add rate limiting per customer
// - Check usage against plan limits (e.g., 1000 free, 50000 pro)
// - Return 429 Too Many Requests if exceeded
// - Consider using Durable Objects for real-time rate limiting

/**
 * CORS preflight handler
 */
function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Rosetta-Token',
      'Access-Control-Max-Age': '86400'
    }
  });
}

/**
 * JSON response helper
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

