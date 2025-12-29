// @rosetta/vercel - Vercel/Next.js Middleware SDK
// See rules.md section 6.1 for implementation details

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const DEFAULT_API_URL = 'https://api.rosetta.ai';

// Source of truth: rules.md Section 3.1
// Keep in sync with worker/index.js AI_BOTS
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

  // Common Crawl
  'ccbot',               // Common Crawl

  // Diffbot
  'diffbot',             // Extraction / training
];

export interface RosettaConfig {
  /** Your Rosetta API token */
  token: string;
  /** API URL (defaults to https://api.rosetta.ai) */
  apiUrl?: string;
  /** Request timeout in ms (defaults to 5000) */
  timeout?: number;
}

function isAIBot(ua: string | null): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return AI_BOTS.some(bot => lower.includes(bot));
}

/**
 * Create Rosetta middleware for Next.js/Vercel
 * 
 * @example
 * // Basic usage
 * export const middleware = createMiddleware({ token: process.env.ROSETTA_TOKEN! });
 * 
 * @example
 * // With custom API URL
 * export const middleware = createMiddleware({
 *   token: process.env.ROSETTA_TOKEN!,
 *   apiUrl: 'https://rosetta-worker.example.workers.dev'
 * });
 */
/**
 * Fetch origin and return with forced 200 status for bots.
 * Exposes original status via X-Rosetta-Origin-Status header.
 */
async function fetchOriginWithForced200(req: NextRequest, timeout: number): Promise<NextResponse> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(req.url, {
      headers: req.headers,
      signal: controller.signal,
    });

    clearTimeout(id);

    const body = await res.text();
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'text/html',
        'X-Rosetta-Status': 'fallback',
        'X-Rosetta-Origin-Status': String(res.status),
      },
    });
  } catch {
    // Even on error, return 200 with empty content
    return new NextResponse('<!-- Rosetta: Origin unavailable -->', {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'X-Rosetta-Status': 'error',
        'X-Rosetta-Origin-Status': 'unavailable',
      },
    });
  }
}

export function createMiddleware(config: RosettaConfig): (req: NextRequest) => Promise<NextResponse> {
  const { token, apiUrl = DEFAULT_API_URL, timeout = 5000 } = config;
  const baseUrl = apiUrl.replace(/\/+$/, ''); // Strip trailing slashes

  return async function middleware(req: NextRequest): Promise<NextResponse> {
    const ua = req.headers.get('user-agent');

    if (!isAIBot(ua)) {
      return NextResponse.next();
    }

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(
        `${baseUrl}/render?url=${encodeURIComponent(req.url)}`,
        {
          headers: { 'X-Rosetta-Token': token },
          signal: controller.signal,
        }
      );

      clearTimeout(id);

      if (!res.ok) {
        console.error(`[Rosetta] ${res.status} for ${req.url}`);
        // Force 200 on bot paths - fetch origin and wrap with 200
        return fetchOriginWithForced200(req, timeout);
      }

      const body = await res.text();
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': res.headers.get('Content-Type') || 'text/markdown',
          'X-Rosetta-Status': res.headers.get('X-Rosetta-Status') || 'unknown',
        },
      });
    } catch (err) {
      console.error(`[Rosetta] Error:`, err);
      // Force 200 on bot paths - fetch origin and wrap with 200
      return fetchOriginWithForced200(req, timeout);
    }
  };
}
