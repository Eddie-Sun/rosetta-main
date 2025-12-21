"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";

type UrlGroup = {
  section: string;
  urls: string[];
};

function groupUrlsBySection(urls: string[]): UrlGroup[] {
  const groups: Map<string, string[]> = new Map();
  const rootUrls: string[] = [];

  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      const pathSegments = pathname.split("/").filter(Boolean);
      
      if (pathSegments.length === 0) {
        rootUrls.push(url);
      } else {
        const section = `/${pathSegments[0]}`;
        
        if (!groups.has(section)) {
          groups.set(section, []);
        }
        groups.get(section)!.push(url);
      }
    } catch {
      // Invalid URL, skip it
      continue;
    }
  }

  // Convert to array and sort
  const result: UrlGroup[] = [];
  
  // Add root URLs if any
  if (rootUrls.length > 0) {
    result.push({ section: "/", urls: rootUrls });
  }

  // Add section groups, sorted by section name
  const sortedSections = Array.from(groups.entries()).sort((a, b) => 
    a[0].localeCompare(b[0])
  );
  
  for (const [section, sectionUrls] of sortedSections) {
    // Sort URLs within each section
    sectionUrls.sort();
    result.push({ section, urls: sectionUrls });
  }

  return result;
}

function pathnameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname || "/";
  } catch {
    return url;
  }
}

export function UrlSections({
  urls,
  domainLabel,
}: {
  urls: string[];
  domainLabel?: string | null;
}) {
  const groups = groupUrlsBySection(urls);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

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
      {/* File browser toolbar */}
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

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_84px] gap-4 px-4 py-2 bg-muted border-b border-border text-xs text-muted-foreground font-mono">
        <span>Page</span>
        <span className="text-right">Open</span>
      </div>

      {/* File list */}
      <div className="divide-y divide-border">
        {groups.map((group) => {
          const isFolder = group.urls.length > 1;
          const isExpanded = expanded.has(group.section);
          const groupLabel = group.section === "/" ? "root" : group.section.replace(/^\//, "");

          if (!isFolder) {
            const url = group.urls[0];
            const path = pathnameFromUrl(url);
            return (
              <a
                key={group.section}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="grid grid-cols-[1fr_84px] gap-4 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors group items-center"
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
                  <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </a>
            );
          }

          return (
            <div key={group.section}>
              {/* Folder row */}
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
                className={cn(
                  "w-full grid grid-cols-[1fr_84px] gap-4 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors group items-center text-left",
                )}
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
              </button>

              {/* Expanded folder contents */}
              {isExpanded ? (
                <div className="bg-background">
                  {group.urls.map((url) => {
                    const path = pathnameFromUrl(url);
                    const fileName = path.split("/").filter(Boolean).pop() || path;
                    return (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="grid grid-cols-[1fr_84px] gap-4 px-4 py-2 hover:bg-[var(--bg-hover)] transition-colors group items-center border-t border-border"
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
                          <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}


