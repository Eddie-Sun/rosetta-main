"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  Zap,
  Loader2,
  FileText,
  Code2,
} from "lucide-react";
import { fetchUrlContent } from "./actions";

type TokenMetrics = {
  url: string;
  htmlTokens: number | null;
  mdTokens: number | null;
  optimizedAt: Date;
};

type ContentData = {
  htmlContent: string | null;
  mdContent: string | null;
  htmlTokens: number | null;
  mdTokens: number | null;
  error?: string | null;
  isLoading: boolean;
};

interface UrlDetailModalProps {
  url: string | null;
  metrics: TokenMetrics | null;
  isOpen: boolean;
  onClose: () => void;
  onCheck: (url: string) => Promise<void>;
  isChecking: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function estimateBytesFromTokens(tokens: number | null): string {
  if (!tokens) return "— B";
  // Rough estimate: ~4 characters per token, 1 byte per character for ASCII
  const estimatedBytes = tokens * 4;
  return formatBytes(estimatedBytes);
}

function collapseNewlines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

function getPathnameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname || "/";
  } catch {
    return url;
  }
}

export function UrlDetailModal({
  url,
  metrics,
  isOpen,
  onClose,
  onCheck,
  isChecking,
}: UrlDetailModalProps) {
  const [contentData, setContentData] = React.useState<ContentData>({
    htmlContent: null,
    mdContent: null,
    htmlTokens: null,
    mdTokens: null,
    isLoading: false,
  });

  // Fetch content when modal opens
  React.useEffect(() => {
    if (!isOpen || !url) {
      setContentData({
        htmlContent: null,
        mdContent: null,
        htmlTokens: null,
        mdTokens: null,
        isLoading: false,
      });
      return;
    }

    async function loadContent() {
      setContentData(prev => ({ ...prev, isLoading: true, error: null }));
      
      const result = await fetchUrlContent(url!);
      
      if (result.ok) {
        setContentData({
          htmlContent: result.value.htmlContent, // Available for 2h after check
          mdContent: result.value.mdContent,     // Available for 24h
          htmlTokens: result.value.htmlTokens,
          mdTokens: result.value.mdTokens,
          isLoading: false,
        });
      } else {
        setContentData(prev => ({
          ...prev,
          isLoading: false,
          error: result.error,
        }));
      }
    }

    loadContent();
  }, [isOpen, url]);

  if (!url) return null;

  const pathname = getPathnameFromUrl(url);
  const isOptimized = !!metrics || !!contentData.mdContent;
  
  // Use fetched data if available, fall back to metrics
  const htmlTokens = contentData.htmlTokens ?? metrics?.htmlTokens ?? 0;
  const mdTokens = contentData.mdTokens ?? metrics?.mdTokens ?? 0;

  const handleCheck = async () => {
    await onCheck(url);
    // Refetch content after check - HTML will be fresh (2h TTL)
    const result = await fetchUrlContent(url);
    if (result.ok) {
      setContentData({
        htmlContent: result.value.htmlContent,
        mdContent: result.value.mdContent,
        htmlTokens: result.value.htmlTokens,
        mdTokens: result.value.mdTokens,
        isLoading: false,
      });
    }
  };

  // Calculate savings
  const savingsPercent = htmlTokens && mdTokens && htmlTokens > 0
    ? Math.round(((htmlTokens - mdTokens) / htmlTokens) * 100)
    : null;

  const optimizedDate = metrics?.optimizedAt
    ? new Date(metrics.optimizedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[900px] lg:max-w-[1100px] p-0 gap-0 overflow-hidden bg-background border-border">
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b border-border bg-muted">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="h-4 w-4 text-accent flex-shrink-0" />
              <DialogTitle className="text-sm font-medium text-foreground truncate font-mono">
                {pathname}
              </DialogTitle>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:text-accent/80 transition-colors flex-shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="flex items-center gap-3">
              {optimizedDate && (
                <span className="text-xs text-muted-foreground font-mono">
                  Last checked: {optimizedDate}
                </span>
              )}
              {savingsPercent !== null && savingsPercent > 0 && (
                <span className="text-xs px-2 py-1 border border-border bg-background text-accent font-mono tabular-nums">
                  {savingsPercent}% savings
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Content Comparison */}
        <div className="bg-background">
          {/* Side by Side Content */}
          <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
            {/* HTML Panel */}
            <div className="flex flex-col">
              <div className="px-4 py-2 border-b border-border bg-muted flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">HTML</span>
                  <span className="text-xs px-1.5 py-0.5 border border-border bg-background text-muted-foreground font-mono">
                    HUMAN
                  </span>
                </div>
              </div>
              <div className="px-4 py-2 border-b border-border bg-[var(--color-theme-card-hex)] flex items-center gap-4 text-xs text-muted-foreground font-mono tabular-nums">
                <span>{htmlTokens.toLocaleString()} tokens</span>
                <span>•</span>
                <span>{estimateBytesFromTokens(htmlTokens)}</span>
              </div>
              <div className="flex-1 p-4 bg-[var(--color-theme-card-hex)]">
                <pre className="text-xs overflow-auto h-[350px] bg-muted p-4 border border-border font-mono whitespace-pre-wrap break-words">
                  <code className="text-muted-foreground">
                    {contentData.isLoading ? (
                      <span className="text-muted-foreground/60 italic flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin inline" />
                        Loading content...
                      </span>
                    ) : contentData.error ? (
                      <span className="text-destructive">
                        {`// Error: ${contentData.error}`}
                      </span>
                    ) : contentData.htmlContent ? (
                      <>
                        {contentData.htmlContent.substring(0, 150000)}
                        {contentData.htmlContent.length > 150000 && (
                          <span className="text-muted-foreground/50">
                            {`\n\n... (truncated, showing first 150,000 of ${contentData.htmlContent.length.toLocaleString()} characters)`}
                          </span>
                        )}
                      </>
                    ) : isOptimized ? (
                      <span className="text-muted-foreground/60 italic">
                        {`// HTML cache expired (2h TTL)\n// Click "Re-check" to fetch fresh content\n// ${htmlTokens.toLocaleString()} tokens`}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60 italic">
                        {`// Not yet analyzed\n// Click "Check Now" to analyze this page`}
                      </span>
                    )}
                  </code>
                </pre>
              </div>
            </div>

            {/* Markdown Panel */}
            <div className="flex flex-col">
              <div className="px-4 py-2 border-b border-border bg-muted flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-accent" />
                  <span className="text-sm font-medium text-foreground">Markdown</span>
                  <span className="text-xs px-1.5 py-0.5 border border-border bg-background text-muted-foreground font-mono">
                    BOT
                  </span>
                </div>
              </div>
              <div className="px-4 py-2 border-b border-border bg-[var(--color-theme-card-hex)] flex items-center gap-4 text-xs text-muted-foreground font-mono tabular-nums">
                <span>{mdTokens.toLocaleString()} tokens</span>
                <span>•</span>
                <span>{estimateBytesFromTokens(mdTokens)}</span>
              </div>
              <div className="flex-1 p-4 bg-[var(--color-theme-card-hex)]">
                <pre className="text-xs overflow-auto h-[350px] bg-muted p-4 border border-border font-mono whitespace-pre-wrap break-words">
                  <code className="text-foreground">
                    {contentData.isLoading ? (
                      <span className="text-muted-foreground/60 italic flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin inline" />
                        Loading content...
                      </span>
                    ) : contentData.error ? (
                      <span className="text-destructive">
                        {`// Error: ${contentData.error}`}
                      </span>
                    ) : contentData.mdContent ? (
                      <>
                        {collapseNewlines(contentData.mdContent).substring(0, 150000)}
                        {contentData.mdContent.length > 150000 && (
                          <span className="text-muted-foreground/50">{"\n\n... (truncated)"}</span>
                        )}
                      </>
                    ) : isOptimized ? (
                      <span className="text-muted-foreground/60 italic">
                        {`// Markdown content not in cache\n// Cache expires after 24 hours\n// Click "Re-check" to regenerate`}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60 italic">
                        {`// Not yet analyzed\n// Click "Check Now" to generate optimized markdown`}
                      </span>
                    )}
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-muted flex items-center justify-between">
          <div className="text-xs text-muted-foreground font-mono truncate max-w-[50%]">
            {url}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={onClose}
              className="h-8 px-3 text-xs"
            >
              Close
            </Button>
            <Button
              onClick={handleCheck}
              disabled={isChecking}
              className="h-8 px-3 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {isChecking ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Checking...
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5 mr-1.5" />
                  {isOptimized ? "Re-check" : "Check Now"}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
