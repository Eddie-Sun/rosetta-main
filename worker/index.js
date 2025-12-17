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
const CACHE_TTL = 86400; // 24 hours (safer default to avoid stale content)
const EXTRACT_TIMEOUT_MS = 3000; // 3 seconds (increased from 2s)
const PENDING_TTL = 30; // Single-flight marker TTL
const MAX_CRAWL_PAGES = 100;

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
  'https://rosetta-demo.vercel.app',
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
    customer = await env.ROSETTA_CACHE.get(`apikey:${token}`, 'json');
  } catch (err) {
    logger.error('KV auth lookup failed', err);
    return jsonResponse({ error: 'Auth service unavailable' }, 503);
  }

  if (!customer) {
    return jsonResponse({ error: 'Invalid API token' }, 401);
  }

  logger.setTenant(customer.id);

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
  const hash = await sha256(canonical);

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
        'Access-Control-Allow-Origin': '*'
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
              'Access-Control-Allow-Origin': '*'
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
    const md = await scrapeWithTimeout(canonical, env.FIRECRAWL_API_KEY, EXTRACT_TIMEOUT_MS);

    if (md) {
      // Cache the result (fire and forget)
      ctx.waitUntil(
        env.ROSETTA_CACHE.put(cacheKey, md, { expirationTtl: CACHE_TTL })
          .catch(err => logger.error('KV cache write failed', err))
      );

      // Clean up pending marker
      ctx.waitUntil(
        env.ROSETTA_CACHE.delete(pendingKey)
          .catch(err => logger.error('KV pending delete failed', err))
      );

      // Track usage (fire and forget)
      ctx.waitUntil(incrementUsage(env, customer.id));

      logger.setCacheStatus('MISS');
      return new Response(md, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'X-Rosetta-Status': 'miss',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*'
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
    if (key !== 'target' && key !== 'demo') {
      targetUrl.searchParams.append(key, value);
    }
  });

  // Detection logic
  const isBot = isAIBot(userAgent); // Only AI bots, not social/SEO/search
  const isAsset = IGNORE_EXT.some(ext => url.pathname.toLowerCase().endsWith(ext));
  const isBlacklisted = BLACKLIST.some(pattern => new RegExp(pattern).test(url.pathname));
  const isDemo = url.searchParams.get('demo') === 'true';

  // Human/asset/blacklisted/non-AI-bot: pass through to origin
  // Social bots (Twitter, Slack) get HTML with OG tags
  // SEO bots (Ahrefs) get real HTML
  // Only AI bots get markdown
  if ((!isBot && !isDemo) || isAsset || isBlacklisted) {
    return proxyToOrigin(targetUrl, request);
  }

  // Bot path: check cache then scrape
  const canonical = canonicalize(targetUrl.toString());
  const hash = await sha256(canonical);
  const cacheKey = `md:${hash}`;

  // Also check legacy key format for backwards compatibility
  const legacyCacheKey = `md::${targetUrl.toString()}`;

  // Cache lookup with error handling
  let cachedMD = null;
  try {
    cachedMD = await env.ROSETTA_CACHE.get(cacheKey);
    if (!cachedMD) {
      cachedMD = await env.ROSETTA_CACHE.get(legacyCacheKey);
    }
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
  let markdown = null;
  try {
    markdown = await scrapeWithTimeout(canonical, env.FIRECRAWL_API_KEY, EXTRACT_TIMEOUT_MS);
  } catch (err) {
    console.error('Scrape failed:', err);
  }

  // Clean up pending marker
  ctx.waitUntil(
    env.ROSETTA_CACHE.delete(pendingKey)
      .catch(err => console.error('KV pending delete failed:', err))
  );

  if (markdown) {
    ctx.waitUntil(
      env.ROSETTA_CACHE.put(cacheKey, markdown, { expirationTtl: CACHE_TTL })
        .catch(err => console.error('KV cache write failed:', err))
    );

    return new Response(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Vary': 'User-Agent',
        'X-Rosetta-Status': 'MISS (Rendered)'
      }
    });
  }

  // Fallback to origin HTML
  const response = await proxyToOrigin(targetUrl, request);
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('X-Rosetta-Status', 'FAIL (Fallback)');
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
    customer = await env.ROSETTA_CACHE.get(`apikey:${token}`, 'json');
  } catch (err) {
    console.error('KV auth lookup failed:', err);
    return jsonResponse({ error: 'Auth service unavailable' }, 503);
  }

  if (!customer) {
    return jsonResponse({ error: 'Invalid API token' }, 401);
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
      const markdown = await scrapeWithTimeout(targetUrl, env.FIRECRAWL_API_KEY, 10000); // Longer timeout for single

      if (markdown && cacheResults) {
        const canonical = canonicalize(targetUrl);
        const hash = await sha256(canonical);
        ctx.waitUntil(
          env.ROSETTA_CACHE.put(`md:${hash}`, markdown, { expirationTtl: CACHE_TTL })
        );
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

    // Store crawl metadata
    const crawlMeta = {
      id: crawlData.id,
      customerId: customer.id,
      url: targetUrl,
      limit: effectiveLimit,
      cacheResults,
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
    customer = await env.ROSETTA_CACHE.get(`apikey:${token}`, 'json');
  } catch (err) {
    console.error('KV auth lookup failed:', err);
    return jsonResponse({ error: 'Auth service unavailable' }, 503);
  }

  if (!customer) {
    return jsonResponse({ error: 'Invalid API token' }, 401);
  }

  try {
    // Get stored metadata
    const metaRaw = await env.ROSETTA_CACHE.get(`crawl::${crawlId}`);
    const meta = metaRaw ? JSON.parse(metaRaw) : null;

    // Verify ownership
    if (meta && meta.customerId !== customer.id) {
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
      ctx.waitUntil((async () => {
        try {
          for (const page of statusData.data) {
            if (page.markdown && page.metadata?.sourceURL) {
              const canonical = canonicalize(page.metadata.sourceURL);
              const hash = await sha256(canonical);
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
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

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

/**
 * Scrape with Firecrawl (with timeout)
 */
async function scrapeWithTimeout(targetUrl, apiKey, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(FIRECRAWL_SCRAPE_URL, {
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
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`Firecrawl API Error: ${response.status}`);
      return null;
    }

    const json = await response.json();

    if (!json.success || !json.data || !json.data.markdown) {
      console.error('Invalid Firecrawl response format');
      return null;
    }

    const md = json.data.markdown;

    // Reject if Firecrawl returned HTML
    if (isHTML(md)) {
      console.error('Firecrawl returned HTML instead of Markdown');
      return null;
    }

    return md;

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
    return new Response(html, {
      status: res.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Rosetta-Status': 'fallback',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch {
    // Rule 1.3.2: Never return 5xx to crawlers
    return new Response('<!-- Rosetta: Origin unavailable -->', {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Rosetta-Status': 'error',
        'Access-Control-Allow-Origin': '*'
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

