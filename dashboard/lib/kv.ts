/**
 * Cloudflare KV client for dashboard
 * 
 * Used to write customer configs to KV for worker auth lookup.
 * Phase 1.5: Direct KV writes with compensation on failure.
 */

interface KVClient {
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Get KV client from Cloudflare API
 * Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env vars
 */
function getKVClient(): KVClient {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID || "dd605207d5b74e289c06acf59e7fef73";

  if (!accountId || !apiToken) {
    throw new Error(
      "Missing Cloudflare credentials. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN"
    );
  }

  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;

  return {
    async put(key: string, value: string): Promise<void> {
      const response = await fetch(`${baseUrl}/values/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "text/plain",
        },
        body: value,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`KV put failed: ${response.status} ${errorText}`);
      }
    },

    async delete(key: string): Promise<void> {
      const response = await fetch(`${baseUrl}/values/${encodeURIComponent(key)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      });

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        throw new Error(`KV delete failed: ${response.status} ${errorText}`);
      }
    },
  };
}

let kvClient: KVClient | null = null;

export function getKV(): KVClient {
  if (!kvClient) {
    kvClient = getKVClient();
  }
  return kvClient;
}

