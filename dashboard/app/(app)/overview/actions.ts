"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { firecrawlMapSite, normalizeUrlForSeed } from "@/lib/firecrawl";
import { err, ok, type Result } from "@/lib/result";

type ActionResult = Result<void, string>;

function normalizeHostname(hostname: string): string {
  // Remove protocol if present
  let normalized = hostname.replace(/^https?:\/\//, "");
  // Remove trailing slash
  normalized = normalized.replace(/\/$/, "");
  // Remove www. prefix and lowercase
  normalized = normalized.toLowerCase().replace(/^www\./, "");
  return normalized;
}

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

async function getCustomerAndPrimaryDomain(userId: string): Promise<
  Result<
    { customer: { id: string; plan: string }; domain: { id: string; hostname: string } | null },
    string
  >
> {
  try {
    const customer = await prisma.customer.findUnique({
      where: { clerkUserId: userId },
      include: {
        domains: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!customer) return err("Account not found");
    const domain = customer.domains[0] ?? null;
    return ok({
      customer: { id: customer.id, plan: customer.plan },
      domain: domain ? { id: domain.id, hostname: domain.hostname } : null,
    });
  } catch {
    return err("Database error");
  }
}

export async function generateStarterList(): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return err("Not authenticated");

  const dataRes = await getCustomerAndPrimaryDomain(userId);
  if (!dataRes.ok) return err(dataRes.error);
  const data = dataRes.value;
  const domain = data.domain;
  if (!domain) return err("No domain found for this account");

  const hostname = normalizeHostname(domain.hostname);
  const siteUrl = `https://${hostname}`;

  const mappedRes = await firecrawlMapSite(siteUrl, {
    limit: 5000,
    includeSubdomains: false,
    sitemap: "include",
  });
  if (!mappedRes.ok) {
    const errorMsg = mappedRes.error.code === "missing_api_key"
      ? "Firecrawl API key is missing. Please add FIRECRAWL_API_KEY to your environment variables."
      : mappedRes.error.code === "network_error"
      ? "Network error. Please check your internet connection."
      : mappedRes.error.code === "http_error"
      ? `Firecrawl API error (${mappedRes.error.status}): ${mappedRes.error.statusText}`
      : `Firecrawl map failed: ${mappedRes.error.code}`;
    return err(errorMsg);
  }

  const normalized = mappedRes.value.urls
    .map(normalizeUrlForSeed)
    .filter((u): u is string => Boolean(u))
    .filter((u) => {
      const parsed = safeParseUrl(u);
      if (!parsed) return false;
      return normalizeHostname(parsed.hostname) === hostname;
    });

  const deduped = Array.from(new Set(normalized));

  if (deduped.length === 0) {
    return err("No URLs found after processing. The site might be inaccessible or have no crawlable pages.");
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.mapSnapshot.upsert({
          where: {
            customerId_domainId: {
              customerId: data.customer.id,
              domainId: domain.id,
            },
          },
          create: {
            id: crypto.randomUUID(),
            customerId: data.customer.id,
            domainId: domain.id,
            urls: deduped,
            fetchedAt: new Date(),
          },
          update: {
            urls: deduped,
            fetchedAt: new Date(),
          },
        });

        const existingSeedUrls = await tx.seedUrl.findMany({
          where: {
            customerId: data.customer.id,
            url: { in: deduped },
          },
          select: { url: true },
        });
        const existingUrls = new Set(existingSeedUrls.map((s) => s.url));
        const newUrls = deduped.filter((url) => !existingUrls.has(url));

        if (newUrls.length > 0) {
          await tx.seedUrl.createMany({
            data: newUrls.map((url) => ({
              id: crypto.randomUUID(),
              customerId: data.customer.id,
              url,
              source: "firecrawl_map" as const,
              enabled: true,
            })),
            skipDuplicates: true,
          });
        }

        if (existingUrls.size > 0) {
          await tx.seedUrl.updateMany({
            where: {
              customerId: data.customer.id,
              url: { in: Array.from(existingUrls) },
            },
            data: { enabled: true },
          });
        }
      },
      {
        maxWait: 10000,
        timeout: 30000,
      }
    );
  } catch (e) {
    console.error("Database transaction error:", e);
    return err("Database error");
  }

  revalidatePath("/overview");
  return ok(undefined);
}

export async function addSeedUrl(formData: FormData): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return err("Not authenticated");

  const urlRaw = formData.get("url")?.toString().trim();
  if (!urlRaw) return err("URL is required");

  const normalized = normalizeUrlForSeed(urlRaw);
  if (!normalized) return err("Invalid URL");

  try {
    const dataRes = await getCustomerAndPrimaryDomain(userId);
    if (!dataRes.ok) return err(dataRes.error);
    const data = dataRes.value;
    await prisma.seedUrl.upsert({
      where: { customerId_url: { customerId: data.customer.id, url: normalized } },
      create: {
        id: crypto.randomUUID(),
        customerId: data.customer.id,
        url: normalized,
        source: "manual",
        enabled: true,
      },
      update: { enabled: true },
    });
    revalidatePath("/overview");
    return ok(undefined);
  } catch {
    return err("Database error");
  }
}

export async function toggleSeedUrl(formData: FormData): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return err("Not authenticated");

  const id = formData.get("id")?.toString();
  const enabled = formData.get("enabled")?.toString() === "true";
  if (!id) return err("Missing seed id");

  try {
    const dataRes = await getCustomerAndPrimaryDomain(userId);
    if (!dataRes.ok) return err(dataRes.error);
    const data = dataRes.value;
    await prisma.seedUrl.updateMany({
      where: { id, customerId: data.customer.id },
      data: { enabled },
    });
    revalidatePath("/overview");
    return ok(undefined);
  } catch {
    return err("Database error");
  }
}

export async function removeSeedUrl(formData: FormData): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return err("Not authenticated");

  const id = formData.get("id")?.toString();
  if (!id) return err("Missing seed id");

  try {
    const dataRes = await getCustomerAndPrimaryDomain(userId);
    if (!dataRes.ok) return err(dataRes.error);
    const data = dataRes.value;
    await prisma.seedUrl.deleteMany({
      where: { id, customerId: data.customer.id },
    });
    revalidatePath("/overview");
    return ok(undefined);
  } catch {
    return err("Database error");
  }
}

export async function checkUrlTokens(url: string): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return err("Not authenticated");

  try {
    const dataRes = await getCustomerAndPrimaryDomain(userId);
    if (!dataRes.ok) return err(dataRes.error);
    const data = dataRes.value;

    // Get customer's API token (first non-revoked token)
    const apiToken = await prisma.apiToken.findFirst({
      where: {
        customerId: data.customer.id,
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!apiToken) {
      return err("No API token found. Please create an API token first.");
    }

    // Get worker API URL from environment
    const workerApiUrl =
      process.env.NEXT_PUBLIC_WORKER_API_URL ||
      process.env.WORKER_API_URL ||
      "https://api.rosetta.ai";

    // For MVP: Use service token from env, or construct from token prefix
    // TODO: Store plaintext tokens securely when creating them
    const serviceToken = process.env.ROSETTA_SERVICE_TOKEN;
    
    if (!serviceToken) {
      return err("Service token not configured. Please set ROSETTA_SERVICE_TOKEN environment variable.");
    }

    // Call worker API to trigger optimization
    // This will cause the worker to extract the page, count tokens, and send metrics back
    const response = await fetch(`${workerApiUrl}/render?url=${encodeURIComponent(url)}`, {
      method: "GET",
      headers: {
        "X-Rosetta-Token": serviceToken,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return err(`Worker API error: ${response.status} ${errorText}`);
    }

    // Wait a moment for metrics to be processed and sent to dashboard
    await new Promise((resolve) => setTimeout(resolve, 2000));

    revalidatePath("/overview");
    return ok(undefined);
  } catch (error) {
    console.error("Error checking URL tokens:", error);
    return err(error instanceof Error ? error.message : "Failed to check URL");
  }
}


