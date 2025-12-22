import { prisma } from "./prisma";
import { getKV } from "./kv";
import { Plan } from "@prisma/client";

const MAX_ACTIVE_TOKENS = 5;

export function normalizeDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function normalizeDomains(domains: string[]): string[] {
  return domains.map(normalizeDomain);
}

export function generateToken(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const base64url = Buffer.from(randomBytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `sk_${base64url}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CustomerConfigV2 {
  v: 2;
  id: string;
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

export async function createApiTokenForCustomer(
  input: CreateTokenInput
): Promise<CreateTokenResult> {
  const { customerId, domains, plan, label } = input;

  const activeCount = await prisma.apiToken.count({
    where: {
      customerId,
      revokedAt: null,
    },
  });

  if (activeCount >= MAX_ACTIVE_TOKENS) {
    throw new Error(
      `Token limit reached. Maximum ${MAX_ACTIVE_TOKENS} active tokens per customer.`
    );
  }

  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const tokenPrefix = token.slice(0, 8);

  const normalizedDomains = normalizeDomains(domains);

  const config: CustomerConfigV2 = {
    v: 2,
    id: customerId,
    plan,
    domains: normalizedDomains,
    updatedAt: new Date().toISOString(),
  };

  const apiToken = await prisma.apiToken.create({
    data: {
      id: crypto.randomUUID(),
      customerId,
      tokenHash,
      tokenPrefix,
      label: label ?? null,
    },
  });

  try {
    const kv = getKV();
    await kv.put(`apikeyhash:${tokenHash}`, JSON.stringify(config));
  } catch {
    await prisma.apiToken.delete({
      where: { id: apiToken.id },
    });
    throw new Error("Failed to provision token. Please try again.");
  }

  return { token, prefix: tokenPrefix };
}

export async function revokeApiToken(
  customerId: string,
  tokenId: string
): Promise<void> {
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

  await prisma.apiToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });

  try {
    const kv = getKV();
    await kv.delete(`apikeyhash:${token.tokenHash}`);
  } catch (err) {
    console.error("Failed to delete KV entry on revoke:", err);
  }
}
