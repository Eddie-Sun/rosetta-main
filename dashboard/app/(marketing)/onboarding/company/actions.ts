"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { syncCustomerAuthToKV } from "@/lib/tokens";

type Result = { ok: true } | { ok: false; error: string };

function normalizeHostname(hostname: string): string {
  // Remove protocol if present
  let normalized = hostname.replace(/^https?:\/\//, "");
  // Remove trailing slash
  normalized = normalized.replace(/\/$/, "");
  // Remove www. prefix and lowercase
  normalized = normalized.toLowerCase().replace(/^www\./, "");
  return normalized;
}

export async function submitCompanyInfo(
  formData: FormData,
): Promise<Result> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Not authenticated" };
  }

  const companyName = formData.get("companyName")?.toString().trim() || null;
  const domain = formData.get("domain")?.toString().trim();

  if (!domain) {
    return { ok: false, error: "Domain is required" };
  }

  const hostname = normalizeHostname(domain);

  try {
    const customerId = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { clerkUserId: userId },
        create: {
          id: crypto.randomUUID(),
          clerkUserId: userId,
          companyName,
          plan: "free",
        },
        update: companyName ? { companyName } : {},
      });

      await tx.domain.upsert({
        where: {
          customerId_hostname: {
            customerId: customer.id,
            hostname,
          },
        },
        create: {
          id: crypto.randomUUID(),
          customerId: customer.id,
          hostname,
          verified: false,
        },
        update: {},
      });

      return customer.id;
    });

    // Best-effort: keep worker allowlist in sync for existing tokens.
    try {
      await syncCustomerAuthToKV(customerId);
    } catch (e) {
      console.error("Failed to sync customer auth to KV:", e);
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Failed to save company info" };
  }
}


