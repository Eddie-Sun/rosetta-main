"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Copy, Check, AlertCircle } from "lucide-react";

interface TokenResponse {
  token: string;
  prefix: string;
  label: string | null;
}

export function TokenGenerator() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const generateToken = async () => {
    setLoading(true);
    setError(null);
    setTokenData(null);
    setCopied(false);

    try {
      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create token");
      }

      const data: TokenResponse = await response.json();
      setTokenData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!tokenData) return;

    try {
      await navigator.clipboard.writeText(tokenData.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="space-y-6">
      {!tokenData && (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Generate an API token to use with Rosetta. This token will be used to
            authenticate requests from your middleware.
          </p>
          <Button onClick={generateToken} disabled={loading}>
            {loading ? "Generating..." : "Generate API Token"}
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {tokenData && (
        <Card className="p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold mb-1">Your API Token</h3>
              <p className="text-sm text-muted-foreground">
                This token will not be shown again. Store it securely.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={copyToClipboard}
              className="flex items-center gap-2"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>

          <div className="p-4 bg-muted rounded-md font-mono text-sm break-all">
            {tokenData.token}
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              Token prefix: <code className="font-mono">{tokenData.prefix}</code>
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={generateToken} variant="outline" size="sm">
              Generate Another Token
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

