/**
 * Token generation and management utilities
 * 
 * Phase 1.5: Hash-based tokens with dual lookup support
 */

import { prisma } from "./prisma";
import { getKV } from "./kv";
import { Plan } from "@prisma/client";

const MAX_ACTIVE_TOKENS = 5;

/**
 * Normalize domain hostname (matches worker canonicalization)
 */
export function normalizeDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * Normalize array of domains
 */
export function normalizeDomains(domains: string[]): string[] {
  return domains.map(normalizeDomain);
}

/**
 * Generate a secure API token
 * Format: sk_ + base64url(32 random bytes)
 */
export function generateToken(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const base64url = Buffer.from(randomBytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `sk_${base64url}`;
}

/**
 * Compute SHA-256 hash of token (64-char lowercase hex)
 * Matches worker's sha256() implementation
 */
export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * CustomerConfigV2 schema (what worker consumes from KV)
 * 
 * Uses `id` field (not `customerId`) for compatibility with worker
 * which accesses `customer.id`
 */
export interface CustomerConfigV2 {
  v: 2;
  id: string; // customerId, but named 'id' for worker compatibility
  plan: Plan;
  domains: string[];
  updatedAt: string;
}

export interface CreateTokenInput {
  customerId: string;
  domains: string[];
  plan: Plan;
  label?: string | null;
}

export interface CreateTokenResult {
  token: string;
  prefix: string;
}

/**
 * Create API token for customer
 * 
 * Phase 1.5 implementation:
 * - Generates token and hash
 * - Writes to DB (source of truth)
 * - Writes to KV (worker auth cache)
 * - On KV failure: deletes DB row and throws (no zombie tokens)
 */
export async function createApiTokenForCustomer(
  input: CreateTokenInput
): Promise<CreateTokenResult> {
  const { customerId, domains, plan, label } = input;

  // Enforce token limit
  const activeCount = await prisma.apiToken.count({
    where: {
      customerId,
      revokedAt: null,
    },
  });

  if (activeCount >= MAX_ACTIVE_TOKENS) {
    throw new Error(`Token limit reached. Maximum ${MAX_ACTIVE_TOKENS} active tokens per customer.`);
  }

  // Generate token
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const tokenPrefix = token.slice(0, 8);

  // Normalize domains (must match worker canonicalization)
  const normalizedDomains = normalizeDomains(domains);

  // Build CustomerConfigV2 payload
  // Note: Uses 'id' field (not 'customerId') for worker compatibility
  const config: CustomerConfigV2 = {
    v: 2,
    id: customerId,
    plan,
    domains: normalizedDomains,
    updatedAt: new Date().toISOString(),
  };

  // Write to DB first (source of truth)
  const apiToken = await prisma.apiToken.create({
    data: {
      id: crypto.randomUUID(),
      customerId,
      tokenHash,
      tokenPrefix,
      label: label ?? null,
    },
  });

  // Write to KV with compensation on failure
  try {
    const kv = getKV();
    await kv.put(`apikeyhash:${tokenHash}`, JSON.stringify(config));
  } catch (err) {
    // Keep system consistent: delete DB row if KV write fails
    await prisma.apiToken.delete({
      where: { id: apiToken.id },
    });
    throw new Error("Failed to provision token. Please try again.");
  }

  return { token, prefix: tokenPrefix };
}

/**
 * Revoke API token
 * 
 * Sets revokedAt in DB and deletes KV entry
 */
export async function revokeApiToken(
  customerId: string,
  tokenId: string
): Promise<void> {
  // Verify token belongs to customer
  const token = await prisma.apiToken.findFirst({
    where: {
      id: tokenId,
      customerId,
      revokedAt: null,
    },
  });

  if (!token) {
    throw new Error("Token not found or already revoked");
  }

  // Update DB (set revokedAt)
  await prisma.apiToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });

  // Delete KV entry
  try {
    const kv = getKV();
    await kv.delete(`apikeyhash:${token.tokenHash}`);
  } catch (err) {
    // Log but don't fail - DB is source of truth
    console.error("Failed to delete KV entry on revoke:", err);
  }
}

