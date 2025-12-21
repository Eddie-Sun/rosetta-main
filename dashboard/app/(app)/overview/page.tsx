import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { UrlSections } from "./UrlSections";
import { generateStarterList } from "./actions";
import { Globe, Clock } from "lucide-react";

export default async function Page() {
  const { userId } = await auth();
  if (!userId) redirect("/onboarding");

  const customer = await prisma.customer.findUnique({
    where: { clerkUserId: userId },
    include: {
      domains: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!customer) {
    redirect("/onboarding/company");
  }

  const domain = customer.domains[0] ?? null;

  // If not mapped/crawled yet: generate a starter list using Firecrawl map.
  if (domain) {
    const hasSnapshot = await prisma.mapSnapshot.findUnique({
      where: {
        customerId_domainId: { customerId: customer.id, domainId: domain.id },
      },
      select: { id: true },
    });

    // Best-effort: don't block page if Firecrawl fails.
    if (!hasSnapshot) {
      await generateStarterList();
    }
  }

  const mapSnapshot =
    domain &&
    (await prisma.mapSnapshot.findUnique({
      where: {
        customerId_domainId: { customerId: customer.id, domainId: domain.id },
      },
    }));

  const mapUrls: string[] = Array.isArray(mapSnapshot?.urls)
    ? (mapSnapshot?.urls as string[])
    : [];

  const domainUrl = domain
    ? (domain.hostname.startsWith("http") ? domain.hostname : `https://${domain.hostname}`)
    : null;

  const fetchedLabel = mapSnapshot?.fetchedAt
    ? new Date(mapSnapshot.fetchedAt).toLocaleDateString()
    : null;

  return (
    <>
      <div className="px-4 lg:px-6">
        <Card className="card--large">
          <div className="flex flex-col gap-3 border-b border-border pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[16px] font-semibold tracking-tight">Suggested URLs</div>
                <div className="mt-1 text-[13px] text-muted-foreground">
                  Choose pages you want Rosetta to prioritize.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 border border-border bg-background px-2 py-1 text-[12px] text-muted-foreground font-mono tabular-nums">
                  {mapUrls.length} pages
                </span>
                <span className="inline-flex items-center gap-1 border border-border bg-background px-2 py-1 text-[12px] text-muted-foreground font-mono tabular-nums">
                  <Clock className="h-3.5 w-3.5" />
                  {fetchedLabel ?? "Not fetched"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-mono">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Source:</span>
              </span>
              {domainUrl ? (
                <a
                  href={domainUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-accent hover:underline underline-offset-4 break-all"
                >
                  {domainUrl}
                </a>
              ) : (
                <span className="font-mono">Add a domain to generate suggestions.</span>
              )}
              {fetchedLabel ? (
                <span className="font-mono">· Last fetched: {fetchedLabel}</span>
              ) : null}
            </div>
          </div>

          <div className="mt-5">
            <UrlSections
              urls={mapUrls}
              domainLabel={domain ? domain.hostname.replace(/^https?:\/\//, "").replace(/\/$/, "") : null}
            />
          </div>
        </Card>
      </div>
    </>
  );
}


