"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkUrlTokens } from "./actions";
import { UrlDetailModal } from "./UrlDetailModal";

type UrlGroup = {
  section: string;
  urls: string[];
};

function groupUrlsBySection(urls: string[]): UrlGroup[] {
  const groups = new Map<string, string[]>();
  const rootUrls: string[] = [];

  for (const url of urls) {
    const { pathname } = new URL(url);
    const [first] = pathname.split("/").filter(Boolean);

    if (!first) {
      rootUrls.push(url);
      continue;
    }

    const section = `/${first}`;
    const list = groups.get(section);
    if (list) list.push(url);
    else groups.set(section, [url]);
  }

  const result: UrlGroup[] = [];
  if (rootUrls.length) result.push({ section: "/", urls: rootUrls });

  for (const [section, sectionUrls] of Array.from(groups.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    sectionUrls.sort();
    result.push({ section, urls: sectionUrls });
  }

  return result;
}

function pathnameFromUrl(url: string): string {
  return new URL(url).pathname || "/";
}

type TokenMetrics = {
  url: string;
  htmlTokens: number | null;
  mdTokens: number | null;
  optimizedAt: Date;
};

function formatTokenSavings(htmlTokens: number | null, mdTokens: number | null): string {
  if (!htmlTokens || !mdTokens || htmlTokens === 0) return "—";
  const savings = ((htmlTokens - mdTokens) / htmlTokens) * 100;
  return `${Math.round(savings)}%`;
}

export function UrlSections({
  urls,
  domainLabel,
  metricsMap,
}: {
  urls: string[];
  domainLabel?: string | null;
  metricsMap?: Map<string, TokenMetrics>;
}) {
  const router = useRouter();
  const groups = groupUrlsBySection(urls);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [checkingUrls, setCheckingUrls] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = React.useState<string | null>(null);

  const handleRowClick = React.useCallback((url: string) => {
    setSelectedUrl(url);
  }, []);

  const handleModalClose = React.useCallback(() => {
    setSelectedUrl(null);
  }, []);

  const handleCheckFromModal = React.useCallback(
    async (url: string) => {
      setError(null);
      setCheckingUrls((prev) => new Set(prev).add(url));
      try {
        const result = await checkUrlTokens(url);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
        setTimeout(() => router.refresh(), 1500);
      } catch {
        setError("Failed to check URL");
      } finally {
        setCheckingUrls((prev) => {
          const next = new Set(prev);
          next.delete(url);
          return next;
        });
      }
    },
    [router]
  );

  const onCheck = React.useCallback(
    (url: string) =>
      async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        setError(null);
        setCheckingUrls((prev) => new Set(prev).add(url));
        try {
          const result = await checkUrlTokens(url);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
          setTimeout(() => router.refresh(), 1500);
        } catch {
          setError("Failed to check URL");
        } finally {
          setCheckingUrls((prev) => {
            const next = new Set(prev);
            next.delete(url);
            return next;
          });
        }
      },
    [router]
  );

  React.useEffect(() => {
    setExpanded((prev) => {
      if (prev.size > 0) return prev;
      const next = new Set<string>();
      for (const g of groups) {
        if (g.urls.length > 1) next.add(g.section);
      }
      return next;
    });
  }, [groups]);

  if (urls.length === 0) {
    return (
      <div className="text-muted-foreground py-4 px-4">
        No suggestions yet.
      </div>
    );
  }

  const totalPages = urls.length;
  const displayDomain = domainLabel ? `${domainLabel}/` : "site/";

  return (
    <div className="overflow-hidden border border-border bg-background">
      {error ? (
        <div className="px-4 py-2 text-sm text-destructive border-b border-border">{error}</div>
      ) : null}
      <div className="flex items-center justify-between px-4 py-3 bg-muted border-b border-border">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Folder className="h-4 w-4 text-accent" />
          <span className="font-mono">{displayDomain}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            {totalPages} pages
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_100px_140px_120px_100px] gap-4 px-4 py-2 bg-muted border-b border-border text-xs text-muted-foreground font-mono">
        <span>Page</span>
        <span className="text-right">Status</span>
        <span className="text-right">Last Optimized</span>
        <span className="text-right">Token Savings</span>
        <span className="text-right">Check</span>
      </div>

      <div className="divide-y divide-border">
        {groups.map((group) => {
          const isFolder = group.urls.length > 1;
          const isExpanded = expanded.has(group.section);
          const groupLabel = group.section === "/" ? "root" : group.section.replace(/^\//, "");

          if (!isFolder) {
            const url = group.urls[0];
            const path = pathnameFromUrl(url);
            const metrics = metricsMap?.get(url);
            const savings = metrics ? formatTokenSavings(metrics.htmlTokens, metrics.mdTokens) : "—";
            const optimizedAt = metrics?.optimizedAt 
              ? new Date(metrics.optimizedAt).toLocaleDateString()
              : "Never";
            const status = metrics ? "Optimized" : "Not checked";
            const isChecking = checkingUrls.has(url);

            return (
              <div
                key={group.section}
                className="grid grid-cols-[1fr_100px_140px_120px_100px] gap-4 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors group items-center cursor-pointer"
                onClick={() => handleRowClick(url)}
              >
                <div className="flex items-center gap-3 min-w-0 pl-2">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0 truncate">
                    <span className="font-mono text-sm text-foreground group-hover:text-accent transition-colors">
                      {path}
                    </span>
                  </div>
                </div>
                <div className="flex justify-end">
                  <span className="text-xs text-muted-foreground font-mono">{status}</span>
                </div>
                <div className="flex justify-end">
                  <span className="text-xs text-muted-foreground font-mono">{optimizedAt}</span>
                </div>
                <div className="flex justify-end">
                  <span className={`text-xs font-mono ${savings !== "—" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                    {savings}
                  </span>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCheck(url)}
                    disabled={isChecking}
                    className="h-7 px-2 text-xs"
                  >
                    {isChecking ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Check"
                    )}
                  </Button>
                </div>
              </div>
            );
          }

          return (
            <div key={group.section}>
              <button
                type="button"
                onClick={() => {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(group.section)) next.delete(group.section);
                    else next.add(group.section);
                    return next;
                  });
                }}
                className="w-full grid grid-cols-[1fr_100px_140px_120px_100px] gap-4 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors group items-center text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <Folder className="h-4 w-4 text-accent flex-shrink-0" />
                  <span className="font-mono text-sm text-foreground group-hover:text-accent transition-colors truncate">
                    {groupLabel}/
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ({group.urls.length})
                  </span>
                </div>
                <span className="text-right text-xs text-muted-foreground font-mono tabular-nums">
                  —
                </span>
                <span className="text-right text-xs text-muted-foreground font-mono tabular-nums">
                  —
                </span>
                <span className="text-right text-xs text-muted-foreground font-mono tabular-nums">
                  —
                </span>
                <span className="text-right text-xs text-muted-foreground font-mono tabular-nums">
                  —
                </span>
              </button>

              {isExpanded ? (
                <div className="bg-background">
                  {group.urls.map((url) => {
                    const path = pathnameFromUrl(url);
                    const fileName = path.split("/").filter(Boolean).pop() || path;
                    const metrics = metricsMap?.get(url);
                    const savings = metrics ? formatTokenSavings(metrics.htmlTokens, metrics.mdTokens) : "—";
                    const optimizedAt = metrics?.optimizedAt 
                      ? new Date(metrics.optimizedAt).toLocaleDateString()
                      : "Never";
                    const status = metrics ? "Optimized" : "Not checked";
                    const isChecking = checkingUrls.has(url);

                    return (
                      <div
                        key={url}
                        className="grid grid-cols-[1fr_100px_140px_120px_100px] gap-4 px-4 py-2 hover:bg-[var(--bg-hover)] transition-colors group items-center border-t border-border cursor-pointer"
                        onClick={() => handleRowClick(url)}
                      >
                        <div className="flex items-center gap-3 min-w-0 pl-10">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0 truncate">
                            <span className="font-mono text-sm text-foreground group-hover:text-accent transition-colors">
                              {fileName}
                            </span>
                            <span className="ml-2 hidden sm:inline text-xs text-muted-foreground font-mono">
                              {path}
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <span className="text-xs text-muted-foreground font-mono">{status}</span>
                        </div>
                        <div className="flex justify-end">
                          <span className="text-xs text-muted-foreground font-mono">{optimizedAt}</span>
                        </div>
                        <div className="flex justify-end">
                          <span className={`text-xs font-mono ${savings !== "—" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                            {savings}
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={onCheck(url)}
                            disabled={isChecking}
                            className="h-7 px-2 text-xs"
                          >
                            {isChecking ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Check"
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <UrlDetailModal
        url={selectedUrl}
        metrics={selectedUrl ? metricsMap?.get(selectedUrl) ?? null : null}
        isOpen={!!selectedUrl}
        onClose={handleModalClose}
        onCheck={handleCheckFromModal}
        isChecking={selectedUrl ? checkingUrls.has(selectedUrl) : false}
      />
    </div>
  );
}
