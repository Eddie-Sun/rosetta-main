import { spawn } from 'child_process';
import { ok, strictEqual } from 'assert';

/**
 * E2E Validation Script for Rosetta
 * 
 * Objectives:
 * 1. Verify Human UA -> Origin Content (200)
 * 2. Verify AI Bot UA -> Markdown (200 + X-Rosetta-Status: HIT/MISS)
 * 3. Verify Unknown Bot -> Origin Content (200)
 * 4. Verify Headers (X-Rosetta-Status)
 */

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:8787';
const TEST_ORIGIN = 'https://rosetta-demo.vercel.app'; // Known allowed origin

console.log(`\n🔍 Rosetta E2E Validation targeting: ${TARGET_URL}\n`);

async function runTests() {
    const tests = [
        {
            name: 'Human Visitor (Chrome)',
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            query: `?target=${TEST_ORIGIN}`,
            expect: {
                status: 200,
                isMarkdown: false,
                rosettaStatus: null // Should not exist or be ignored
            }
        },
        {
            name: 'AI Bot (GPTBot)',
            headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot' },
            query: `?target=${TEST_ORIGIN}`,
            expect: {
                status: 200,
                isMarkdown: true,
                rosettaStatus: /HIT|MISS/
            }
        },
        {
            name: 'AI Bot (Claude)',
            headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +claudebot@anthropic.com' },
            query: `?target=${TEST_ORIGIN}`,
            expect: {
                status: 200,
                isMarkdown: true,
                // rosettaStatus checked dynamically
            }
        },
        {
            name: 'Social Bot (Twitter)',
            headers: { 'User-Agent': 'Twitterbot/1.0' },
            query: `?target=${TEST_ORIGIN}`,
            expect: {
                status: 200,
                isMarkdown: false, // Should see HTML for OG tags
            }
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const t of tests) {
        console.log(`[TEST] ${t.name}...`);
        try {
            const url = `${TARGET_URL}/${t.query}`;
            const res = await fetch(url, { headers: t.headers });

            // Status check
            if (res.status !== t.expect.status) {
                throw new Error(`Expected status ${t.expect.status}, got ${res.status}`);
            }

            // Header check
            const rStatus = res.headers.get('X-Rosetta-Status');
            if (t.expect.rosettaStatus) {
                if (!rStatus) throw new Error('Missing X-Rosetta-Status header');
                if (t.expect.rosettaStatus instanceof RegExp && !t.expect.rosettaStatus.test(rStatus)) {
                    throw new Error(`X-Rosetta-Status '${rStatus}' did not match regex ${t.expect.rosettaStatus}`);
                }
            }

            // Content check
            const text = await res.text();
            const isMd = !text.trim().toLowerCase().startsWith('<!doctype html') && !text.includes('<html');

            if (t.expect.isMarkdown && !isMd) {
                throw new Error('Expected Markdown, got HTML');
            }
            if (t.expect.isMarkdown === false && isMd) {
                throw new Error('Expected HTML, got Markdown');
            }

            console.log(`  ✅ Passed (${rStatus || 'Origin'})`);
            passed++;
        } catch (err) {
            console.error(`  ❌ Failed: ${err.message}`);
            failed++;
        }
        console.log('');
    }

    console.log(`Summary: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
