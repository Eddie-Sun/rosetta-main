import { err, ok, type Result } from "@/lib/result";

export type FirecrawlMapOptions = {
  limit?: number;
  includeSubdomains?: boolean;
  sitemap?: "include" | "ignore";
};

export type FirecrawlMapResult = {
  urls: string[];
  raw: unknown;
};

export type FirecrawlMapError =
  | { code: "missing_api_key"; message: string }
  | { code: "network_error"; message: string }
  | { code: "invalid_json"; message: string }
  | { code: "http_error"; message: string; status: number; statusText: string; raw?: unknown };

function getFirecrawlApiKey(): Result<string, FirecrawlMapError> {
  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key) {
    return err({ code: "missing_api_key", message: "Missing FIRECRAWL_API_KEY" });
  }
  return ok(key);
}

function isProbablyAssetPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  const assetExt = [
    ".js",
    ".css",
    ".xml",
    ".less",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".pdf",
    ".doc",
    ".txt",
    ".ico",
    ".rss",
    ".zip",
    ".mp3",
    ".rar",
    ".exe",
    ".wmv",
    ".avi",
    ".ppt",
    ".mpg",
    ".mpeg",
    ".tif",
    ".wav",
    ".mov",
    ".psd",
    ".ai",
    ".xls",
    ".xlsx",
    ".mp4",
    ".m4a",
    ".swf",
    ".dmg",
    ".iso",
    ".flv",
    ".m4v",
    ".torrent",
    ".woff",
    ".woff2",
    ".ttf",
    ".svg",
    ".webmanifest",
    ".webp",
  ];
  return assetExt.some((ext) => lower.endsWith(ext));
}

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "_ga",
  "_gl",
  "ref",
  "mc_cid",
  "mc_eid",
];

export function normalizeUrlForSeed(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }

  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");

  for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
  u.searchParams.sort();

  if (isProbablyAssetPath(u.pathname)) return null;

  return u.toString();
}

function extractUrlArray(raw: unknown): string[] {
  const urls: string[] = [];
  
  // Handle root-level array: [{ url: "url1", ... }, { url: "url2", ... }]
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object") {
        const itemObj = item as Record<string, unknown>;
        if (typeof itemObj["url"] === "string") {
          urls.push(itemObj["url"]);
        }
      } else if (typeof item === "string") {
        urls.push(item);
      }
    }
    return urls;
  }
  
  if (!raw || typeof raw !== "object") {
    return urls;
  }

  const r = raw as Record<string, unknown>;
  
  // Handle flat array of URLs: { urls: ["url1", "url2"] }
  if (Array.isArray(r["urls"])) {
    for (const item of r["urls"]) {
      if (typeof item === "string") {
        urls.push(item);
      }
    }
  }
  
  // Handle array of link objects: { links: [{ url: "url1", ... }, ...] }
  if (Array.isArray(r["links"])) {
    for (const link of r["links"]) {
      if (link && typeof link === "object") {
        const linkObj = link as Record<string, unknown>;
        if (typeof linkObj["url"] === "string") {
          urls.push(linkObj["url"]);
        }
      } else if (typeof link === "string") {
        urls.push(link);
      }
    }
  }
  
  // Handle nested in data object
  if (r["data"] && typeof r["data"] === "object") {
    const d = r["data"] as Record<string, unknown>;
    
    // Handle array at data level
    if (Array.isArray(d)) {
      for (const item of d) {
        if (item && typeof item === "object") {
          const itemObj = item as Record<string, unknown>;
          if (typeof itemObj["url"] === "string") {
            urls.push(itemObj["url"]);
          }
        }
      }
    }
    
    if (Array.isArray(d["urls"])) {
      for (const item of d["urls"]) {
        if (typeof item === "string") {
          urls.push(item);
        }
      }
    }
    
    if (Array.isArray(d["links"])) {
      for (const link of d["links"]) {
        if (link && typeof link === "object") {
          const linkObj = link as Record<string, unknown>;
          if (typeof linkObj["url"] === "string") {
            urls.push(linkObj["url"]);
          }
        } else if (typeof link === "string") {
          urls.push(link);
        }
      }
    }
  }
  
  return urls;
}

export async function firecrawlMapSite(
  siteUrl: string,
  options: FirecrawlMapOptions = {},
): Promise<Result<FirecrawlMapResult, FirecrawlMapError>> {
  const keyRes = getFirecrawlApiKey();
  if (!keyRes.ok) return keyRes;
  const key = keyRes.value;
  const body = {
    url: siteUrl,
    limit: options.limit ?? 5000,
    includeSubdomains: options.includeSubdomains ?? false,
    sitemap: options.sitemap ?? "include",
  };

  let res: Response;
  try {
    res = await fetch("https://api.firecrawl.dev/v2/map", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return err({
      code: "network_error",
      message: e instanceof Error ? e.message : "Network error",
    });
  }

  let raw: unknown;
  try {
    raw = (await res.json()) as unknown;
  } catch {
    return err({ code: "invalid_json", message: "Invalid JSON from Firecrawl" });
  }
  if (!res.ok) {
    return err({
      code: "http_error",
      message: "Firecrawl map request failed",
      status: res.status,
      statusText: res.statusText,
      raw,
    });
  }

  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (r["jobId"] || r["job_id"] || r["id"]) {
      return err({
        code: "http_error",
        message: "Firecrawl returned a job ID. The map endpoint may require polling for results.",
        status: res.status,
        statusText: res.statusText,
        raw,
      });
    }
  }

  const urls = extractUrlArray(raw);
  
  return ok({ urls, raw });
}


