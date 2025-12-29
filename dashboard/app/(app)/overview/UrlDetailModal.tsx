"use client";

import * as React from "react";
import {
  Dialog,
  DialogClose,
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
  X,
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

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/574fd32f-9942-40f1-96d6-0e10426324d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'post-fix',hypothesisId:'H',location:'dashboard/app/(app)/overview/UrlDetailModal.tsx:loadContent:start',message:'UrlDetailModal loadContent starting',data:{isOpen,hasUrl:!!url,urlHost:(()=>{try{return url?new URL(url).host:null}catch{return null}})(),urlPath:(()=>{try{return url?new URL(url).pathname:null}catch{return null}})()},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      
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
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/574fd32f-9942-40f1-96d6-0e10426324d4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'post-fix',hypothesisId:'H',location:'dashboard/app/(app)/overview/UrlDetailModal.tsx:loadContent:error',message:'UrlDetailModal loadContent got error',data:{error:result.error.slice(0,200)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
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
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[920px] lg:max-w-[1120px] p-0 gap-0 overflow-hidden"
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-[var(--color-theme-border-01-5)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="h-4 w-4 text-accent flex-shrink-0" />
              <DialogTitle className="text-[13px] font-semibold tracking-tight text-foreground truncate font-mono">
                {pathname}
              </DialogTitle>
              <Button
                asChild
                variant="ghost"
                size="icon-sm"
                className="flex-shrink-0 text-accent hover:text-accent hover:bg-[var(--bg-hover)]"
              >
                <a href={url} target="_blank" rel="noreferrer" aria-label="Open URL in new tab">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <div className="flex items-center gap-3">
              {optimizedDate && (
                <span className="text-xs text-muted-foreground font-mono">
                  Last checked: {optimizedDate}
                </span>
              )}
              {savingsPercent !== null && savingsPercent > 0 && (
                <span className="text-xs px-2 py-1 border border-border/70 bg-background/40 text-accent font-mono tabular-nums">
                  {savingsPercent}% savings
                </span>
              )}
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground hover:bg-[var(--bg-hover)]"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogHeader>

        {/* Content Comparison */}
        <div className="bg-transparent">
          {/* Side by Side Content */}
          <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--color-theme-border-01-5)]">
            {/* HTML Panel */}
            <div className="flex flex-col">
              <div className="px-6 py-3 border-b border-[var(--color-theme-border-01-5)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[13px] font-medium text-foreground">HTML</span>
                  <span className="text-[11px] px-1.5 py-0.5 border border-border/70 bg-background/30 text-muted-foreground font-mono">
                    HUMAN
                  </span>
                </div>
              </div>
              <div className="px-6 py-2 border-b border-[var(--color-theme-border-01-5)] flex items-center gap-4 text-xs text-muted-foreground font-mono tabular-nums">
                <span>{htmlTokens.toLocaleString()} tokens</span>
                <span>•</span>
                <span>{estimateBytesFromTokens(htmlTokens)}</span>
              </div>
              <div className="flex-1 p-4">
                <pre className="text-xs overflow-auto h-[350px] bg-background/40 p-4 border border-border/60 font-mono whitespace-pre-wrap break-words">
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
              <div className="px-6 py-3 border-b border-[var(--color-theme-border-01-5)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-accent" />
                  <span className="text-[13px] font-medium text-foreground">Markdown</span>
                  <span className="text-[11px] px-1.5 py-0.5 border border-border/70 bg-background/30 text-muted-foreground font-mono">
                    BOT
                  </span>
                </div>
              </div>
              <div className="px-6 py-2 border-b border-[var(--color-theme-border-01-5)] flex items-center gap-4 text-xs text-muted-foreground font-mono tabular-nums">
                <span>{mdTokens.toLocaleString()} tokens</span>
                <span>•</span>
                <span>{estimateBytesFromTokens(mdTokens)}</span>
              </div>
              <div className="flex-1 p-4">
                <pre className="text-xs overflow-auto h-[350px] bg-background/40 p-4 border border-border/60 font-mono whitespace-pre-wrap break-words">
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
        <div className="px-6 py-4 border-t border-[var(--color-theme-border-01-5)] flex items-center justify-between">
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
              variant="outline"
              className="h-8 px-3 text-xs border-accent/25 bg-background/30 text-accent hover:bg-accent/10 hover:text-accent"
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
