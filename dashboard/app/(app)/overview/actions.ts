"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { firecrawlMapSite, normalizeUrlForSeed } from "@/lib/firecrawl";
import { err, ok, type Result } from "@/lib/result";
import { syncCustomerAuthToKV } from "@/lib/tokens";

type ActionResult = Result<void, string>;

function normalizeHostname(hostname: string): string {
  let normalized = hostname.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/\/$/, "");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readOptionalString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function readOptionalBoolean(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function readOptionalNumberOrNull(v: unknown): number | null | undefined {
  if (typeof v === "number") return v;
  if (v === null) return null;
  return undefined;
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

export type ContentResult = Result<{
  htmlContent: string | null;
  mdContent: string | null;
  htmlTokens: number | null;
  mdTokens: number | null;
  htmlCached: boolean;
  mdCached: boolean;
}, string>;

export async function fetchUrlContent(url: string): Promise<ContentResult> {
  const { userId } = await auth();
  if (!userId) return err("Not authenticated");

  try {
    // Best-effort: keep worker allowlist in sync before reading cached content.
    // This helps avoid 403s when domains were updated after tokens were minted.
    try {
      const customer = await prisma.customer.findUnique({
        where: { clerkUserId: userId },
        select: { id: true },
      });
      if (customer?.id) {
        await syncCustomerAuthToKV(customer.id);
      }
    } catch (e) {
      // ignore
    }

    const workerApiUrlRaw =
      process.env.NEXT_PUBLIC_WORKER_API_URL ||
      process.env.WORKER_API_URL ||
      "https://api.rosetta.ai";
    const workerApiUrl = workerApiUrlRaw.replace(/\/+$/, "");
    const internalKey = process.env.WORKER_INTERNAL_API_KEY;
    const serviceToken = process.env.ROSETTA_SERVICE_TOKEN;

    if (!internalKey) {
      return err("WORKER_INTERNAL_API_KEY is not set.");
    }

    const endpoint = `${workerApiUrl}/render/content?url=${encodeURIComponent(url)}`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${internalKey}`,
      },
    });

    if (!response.ok) {
      let diagStatus: number | null = null;
      let diagBodySnippet: string | null = null;

      // If we got a 404, probe whether *any* worker route exists at this base URL.
      if (response.status === 404) {
        try {
          const diagUrl = `${workerApiUrl}/render`;
          const diagRes = await fetch(diagUrl, { method: "GET" });
          let diagText = "";
          try {
            diagText = await diagRes.text();
          } catch {
            // ignore
          }
          diagStatus = diagRes.status;
          diagBodySnippet = diagText.slice(0, 200);
        } catch {
          // ignore
        }
      }

      // Fallback: if the deployed worker doesn't support /render/content yet, try the public /render API
      // (markdown only) when a service token is configured.
      if (response.status === 404 && serviceToken) {
        try {
          const fallbackEndpoint = `${workerApiUrl}/render?url=${encodeURIComponent(url)}`;
          const fallbackRes = await fetch(fallbackEndpoint, {
            method: "GET",
            headers: {
              "X-Rosetta-Token": serviceToken,
            },
          });
          const md = await fallbackRes.text().catch(() => "");

          if (fallbackRes.ok && md) {
            return ok({
              htmlContent: null,
              mdContent: md,
              htmlTokens: null,
              mdTokens: Math.ceil(md.length / 4),
              htmlCached: false,
              mdCached: false,
            });
          }
        } catch {
          // ignore
        }
      }

      if (response.status === 404) {
        // If the worker is present but /render/content isn't deployed yet, treat this as
        // "preview unavailable" rather than a hard error so the UI can still function.
        if (diagStatus === 401 && diagBodySnippet?.includes("Missing X-Rosetta-Token")) {
          return ok({
            htmlContent: null,
            mdContent: null,
            htmlTokens: null,
            mdTokens: null,
            htmlCached: false,
            mdCached: false,
          });
        }
        return err(`Worker API error: 404`);
      }
      return err(`Worker API error: ${response.status}`);
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!isRecord(payload) || payload.ok !== true) {
      return err(readOptionalString(isRecord(payload) ? payload.error : undefined) || "Failed to fetch content");
    }

    return ok({
      htmlContent: typeof payload.htmlContent === "string" ? payload.htmlContent : null,
      mdContent: typeof payload.mdContent === "string" ? payload.mdContent : null,
      htmlTokens: readOptionalNumberOrNull(payload.htmlTokens) ?? null,
      mdTokens: readOptionalNumberOrNull(payload.mdTokens) ?? null,
      htmlCached: readOptionalBoolean(payload.htmlCached) ?? false,
      mdCached: readOptionalBoolean(payload.mdCached) ?? false,
    });
  } catch (error) {
    console.error("Error fetching URL content:", error);
    return err(error instanceof Error ? error.message : "Failed to fetch content");
  }
}

export async function checkUrlTokens(url: string): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return err("Not authenticated");

  try {
    const dataRes = await getCustomerAndPrimaryDomain(userId);
    if (!dataRes.ok) return err(dataRes.error);
    const data = dataRes.value;

    // Best-effort: keep worker allowlist in sync before triggering internal checks.
    try {
      const hasCfCreds = !!process.env.CLOUDFLARE_ACCOUNT_ID && !!process.env.CLOUDFLARE_API_TOKEN;
      await syncCustomerAuthToKV(data.customer.id);
    } catch (e) {
      // ignore sync error
    }

    const workerApiUrlRaw =
      process.env.NEXT_PUBLIC_WORKER_API_URL ||
      process.env.WORKER_API_URL ||
      "https://api.rosetta.ai";
    const workerApiUrl = workerApiUrlRaw.replace(/\/+$/, "");
    const internalKey = process.env.WORKER_INTERNAL_API_KEY;

    if (!internalKey) {
      return err("WORKER_INTERNAL_API_KEY is not set.");
    }

    const endpoint = `${workerApiUrl}/render/internal?customerId=${encodeURIComponent(
      data.customer.id
    )}&url=${encodeURIComponent(url)}`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${internalKey}`,
      },
    });

    if (!response.ok) {
      let details = "";
      try {
        const text = await response.text();
        details = text ? `: ${text.slice(0, 300)}` : "";
      } catch {
        // ignore
      }
      return err(`Worker API error: ${response.status} (GET ${endpoint})${details}`);
    }

    // Parse internal worker response (JSON) and upsert metrics directly so UI updates
    // even when the worker cannot call back into a local dashboard URL.
    const payload: unknown = await response.json().catch(() => null);
    if (isRecord(payload) && payload.mdTokens !== undefined) {
      const htmlTokens = readOptionalNumberOrNull(payload.htmlTokens) ?? null;
      const mdTokens = readOptionalNumberOrNull(payload.mdTokens) ?? null;
      await prisma.urlMetrics.upsert({
        where: {
          customerId_url: {
            customerId: data.customer.id,
            url,
          },
        },
        create: {
          customerId: data.customer.id,
          url,
          htmlTokens,
          mdTokens,
          optimizedAt: new Date(),
        },
        update: {
          htmlTokens,
          mdTokens,
          optimizedAt: new Date(),
        },
      });
    }

    revalidatePath("/overview");
    return ok(undefined);
  } catch (error) {
    console.error("Error checking URL tokens:", error);
    return err(error instanceof Error ? error.message : "Failed to check URL");
  }
}


