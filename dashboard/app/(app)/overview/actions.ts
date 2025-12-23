"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { firecrawlMapSite, normalizeUrlForSeed } from "@/lib/firecrawl";
import { err, ok, type Result } from "@/lib/result";

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
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/574fd32f-9942-40f1-96d6-0e10426324d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1',location:'dashboard/app/(app)/overview/actions.ts:checkUrlTokens:entry',message:'checkUrlTokens called',data:{url},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log

    const dataRes = await getCustomerAndPrimaryDomain(userId);
    if (!dataRes.ok) return err(dataRes.error);
    const data = dataRes.value;

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

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/574fd32f-9942-40f1-96d6-0e10426324d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1',location:'dashboard/app/(app)/overview/actions.ts:checkUrlTokens:beforeFetch',message:'Calling worker internal render',data:{endpoint,hasInternalKey:true,customerId:data.customer.id},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log

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
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/574fd32f-9942-40f1-96d6-0e10426324d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1',location:'dashboard/app/(app)/overview/actions.ts:checkUrlTokens:workerError',message:'Worker returned non-OK',data:{status:response.status,endpoint,detailsPreview:details.slice(0,200)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion agent log
      return err(`Worker API error: ${response.status} (GET ${endpoint})${details}`);
    }

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/574fd32f-9942-40f1-96d6-0e10426324d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1',location:'dashboard/app/(app)/overview/actions.ts:checkUrlTokens:workerOk',message:'Worker returned OK',data:{status:response.status,endpoint},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log

    // Parse internal worker response (JSON) and upsert metrics directly so UI updates
    // even when the worker cannot call back into a local dashboard URL.
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; canonical?: string; htmlTokens?: number | null; mdTokens?: number | null }
      | null;

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/574fd32f-9942-40f1-96d6-0e10426324d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'post-fix',hypothesisId:'H2',location:'dashboard/app/(app)/overview/actions.ts:checkUrlTokens:parsed',message:'Parsed worker internal JSON',data:{hasPayload:!!payload,ok:payload?.ok===true,hasTokens:(payload?.htmlTokens!==undefined)||(payload?.mdTokens!==undefined),htmlTokens:payload?.htmlTokens??null,mdTokens:payload?.mdTokens??null,canonical:payload?.canonical??null,url},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log

    if (payload?.mdTokens !== undefined) {
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
          htmlTokens: payload.htmlTokens ?? null,
          mdTokens: payload.mdTokens ?? null,
          optimizedAt: new Date(),
        },
        update: {
          htmlTokens: payload.htmlTokens ?? null,
          mdTokens: payload.mdTokens ?? null,
          optimizedAt: new Date(),
        },
      });

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/574fd32f-9942-40f1-96d6-0e10426324d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'post-fix',hypothesisId:'H2',location:'dashboard/app/(app)/overview/actions.ts:checkUrlTokens:upsert',message:'Upserted urlMetrics from worker response',data:{customerId:data.customer.id,url},timestamp:Date.now()})}).catch(()=>{});
      // #endregion agent log
    }

    revalidatePath("/overview");
    return ok(undefined);
  } catch (error) {
    console.error("Error checking URL tokens:", error);
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/574fd32f-9942-40f1-96d6-0e10426324d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1',location:'dashboard/app/(app)/overview/actions.ts:checkUrlTokens:exception',message:'checkUrlTokens threw',data:{error:String(error)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log
    return err(error instanceof Error ? error.message : "Failed to check URL");
  }
}


