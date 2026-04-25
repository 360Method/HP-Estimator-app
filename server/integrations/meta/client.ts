/**
 * Meta Marketing + Graph API client.
 * Uses the long-lived System User Token (META_SYSTEM_USER_TOKEN) — no OAuth flow.
 * All mutating calls (send message, publish ad) require explicit human approval;
 * this client is read/draft-only from the agent's perspective.
 */
import { ENV } from "../../_core/env";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

export function isMetaConfigured(): boolean {
  return !!(ENV.metaSystemUserToken && ENV.metaAdAccountId);
}

async function graphRequest<T = any>(
  path: string,
  options: { method?: string; body?: object } = {}
): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}/${path}`;
  const separator = url.includes("?") ? "&" : "?";
  const resp = await fetch(`${url}${separator}access_token=${ENV.metaSystemUserToken}`, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Meta API ${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.json() as Promise<T>;
}

/** Verify the system user token is valid and return basic info. */
export async function verifyMetaToken(): Promise<{
  valid: boolean;
  appId?: string;
  userId?: string;
  expiresAt?: number;
  scopes?: string[];
  error?: string;
}> {
  try {
    const appToken = `${ENV.metaAppId}|${ENV.metaAppSecret}`;
    const resp = await fetch(
      `${GRAPH_BASE}/debug_token?input_token=${ENV.metaSystemUserToken}&access_token=${appToken}`
    );
    if (!resp.ok) return { valid: false, error: `HTTP ${resp.status}` };
    const data = await resp.json();
    const d = data.data ?? {};
    return {
      valid: d.is_valid === true,
      appId: d.app_id,
      userId: d.user_id,
      expiresAt: d.expires_at === 0 ? undefined : d.expires_at,
      scopes: d.scopes,
      error: d.is_valid ? undefined : (d.error?.message ?? "Invalid token"),
    };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Fetch campaign-level ad insights for the configured ad account. */
export async function fetchAdInsights(opts: {
  datePreset?: string;
  fields?: string[];
  limit?: number;
}): Promise<Array<Record<string, any>>> {
  const fields = (opts.fields ?? ["campaign_name", "impressions", "clicks", "spend", "reach", "cpc", "ctr"]).join(",");
  const datePreset = opts.datePreset ?? "last_30d";
  const limit = opts.limit ?? 25;

  const data = await graphRequest<{ data: any[] }>(
    `act_${ENV.metaAdAccountId}/insights?level=campaign&fields=${fields}&date_preset=${datePreset}&limit=${limit}`
  );
  return data.data ?? [];
}

/** List pages accessible by the system user. */
export async function listMetaPages(): Promise<Array<{ id: string; name: string; category: string }>> {
  const data = await graphRequest<{ data: any[] }>("me/accounts?fields=id,name,category&limit=25");
  return data.data ?? [];
}

/** Fetch messages from a page's inbox (Messenger). */
export async function fetchPageMessages(pageId: string, limit = 20): Promise<Array<Record<string, any>>> {
  const data = await graphRequest<{ data: any[] }>(
    `${pageId}/conversations?fields=id,updated_time,participants,messages.limit(1){message,from,created_time}&limit=${limit}`
  );
  return data.data ?? [];
}
