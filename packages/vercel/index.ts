// @rosetta/vercel - Vercel/Next.js Middleware SDK
// See rules.md section 6.1 for implementation details

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

function isAIBot(ua: string | null): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return AI_BOTS.some(bot => lower.includes(bot));
}

export function createMiddleware(token: string): (req: NextRequest) => Promise<NextResponse> {
  return async function middleware(req: NextRequest): Promise<NextResponse> {
    const ua = req.headers.get('user-agent');

    if (!isAIBot(ua)) {
      return NextResponse.next();
    }

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(
        `https://api.rosetta.ai/render?url=${encodeURIComponent(req.url)}`,
        {
          headers: { 'X-Rosetta-Token': token },
          signal: controller.signal,
        }
      );

      clearTimeout(id);

      if (!res.ok) {
        console.error(`[Rosetta] ${res.status} for ${req.url}`);
        return NextResponse.next(); // Fallback to origin
      }

      const body = await res.text();
      return new NextResponse(body, {
        headers: {
          'Content-Type': res.headers.get('Content-Type') || 'text/markdown',
          'X-Rosetta-Status': res.headers.get('X-Rosetta-Status') || 'unknown',
        },
      });
    } catch (err) {
      console.error(`[Rosetta] Error:`, err);
      return NextResponse.next(); // Never break the site
    }
  };
}
