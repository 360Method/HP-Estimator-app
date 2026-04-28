/**
 * Google Ads REST API client (v17).
 * Every request requires:
 *   Authorization: Bearer <access_token>
 *   developer-token: <GOOGLE_ADS_DEVELOPER_TOKEN>
 *   login-customer-id: <customer_id>  (for MCC accounts)
 *
 * Design doc constraint: NO mutating call may originate from an agent run.
 * This client only exposes read operations + draft helpers.
 */
import { ENV } from "../../_core/env";
import { getValidGoogleAdsToken } from "./oauth";

const GADS_BASE = "https://googleads.googleapis.com/v17";

async function gadsRequest<T = any>(
  path: string,
  opts: { method?: string; body?: object; customerId?: string } = {}
): Promise<T> {
  const auth = await getValidGoogleAdsToken();
  if (!auth) throw new Error("Google Ads not connected");

  const customerId = (opts.customerId ?? auth.customerId).replace(/-/g, "");
  const url = `${GADS_BASE}/customers/${customerId}/${path}`;

  const resp = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "developer-token": ENV.googleAdsDevToken,
      "login-customer-id": customerId,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google Ads API ${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.json() as Promise<T>;
}

/** Execute a Google Ads Query Language (GAQL) search. */
async function gaqlSearch(query: string, customerId?: string): Promise<any[]> {
  const data = await gadsRequest<{ results?: any[] }>("googleAds:search", {
    method: "POST",
    body: { query },
    customerId,
  });
  return data.results ?? [];
}

export async function fetchCampaigns(customerId?: string) {
  const results = await gaqlSearch(
    `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
            metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
     FROM campaign
     WHERE campaign.status != 'REMOVED'
     ORDER BY metrics.impressions DESC
     LIMIT 50`,
    customerId
  );
  return results.map(r => ({
    id: r.campaign?.id,
    name: r.campaign?.name,
    status: r.campaign?.status,
    channelType: r.campaign?.advertisingChannelType,
    impressions: r.metrics?.impressions ?? 0,
    clicks: r.metrics?.clicks ?? 0,
    costMicros: r.metrics?.costMicros ?? 0,
    conversions: r.metrics?.conversions ?? 0,
  }));
}

export async function fetchPerformance(opts: { dateRange?: string; customerId?: string } = {}) {
  const dateFilter = opts.dateRange ?? "LAST_30_DAYS";
  const results = await gaqlSearch(
    `SELECT campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros,
            metrics.average_cpc, metrics.ctr, metrics.conversions, metrics.conversion_value
     FROM campaign
     WHERE segments.date DURING ${dateFilter}
       AND campaign.status != 'REMOVED'
     ORDER BY metrics.cost_micros DESC
     LIMIT 25`,
    opts.customerId
  );
  return results.map(r => ({
    campaign: r.campaign?.name,
    impressions: r.metrics?.impressions ?? 0,
    clicks: r.metrics?.clicks ?? 0,
    costMicros: r.metrics?.costMicros ?? 0,
    avgCpcMicros: r.metrics?.averageCpc ?? 0,
    ctr: r.metrics?.ctr ?? 0,
    conversions: r.metrics?.conversions ?? 0,
    conversionValue: r.metrics?.conversionValue ?? 0,
  }));
}

export async function keywordResearch(opts: { seedKeywords: string[]; language?: string }) {
  // Uses Keyword Plan Idea Service via REST — returns keyword suggestions
  const auth = await getValidGoogleAdsToken();
  if (!auth) throw new Error("Google Ads not connected");

  const customerId = auth.customerId.replace(/-/g, "");
  const resp = await fetch(
    `${GADS_BASE}/customers/${customerId}/keywordPlanIdeas:generateKeywordIdeas`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "developer-token": ENV.googleAdsDevToken,
        "login-customer-id": customerId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        keywordSeed: { keywords: opts.seedKeywords },
        language: opts.language ?? "languageConstants/1000",
        geoTargetConstants: [],
        keywordPlanNetwork: "GOOGLE_SEARCH",
      }),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Keyword ideas API ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  return (data.results ?? []).slice(0, 50).map((r: any) => ({
    keyword: r.text,
    avgMonthlySearches: r.keywordIdeaMetrics?.avgMonthlySearches ?? 0,
    competition: r.keywordIdeaMetrics?.competition,
    lowTopOfPageBidMicros: r.keywordIdeaMetrics?.lowTopOfPageBidMicros,
    highTopOfPageBidMicros: r.keywordIdeaMetrics?.highTopOfPageBidMicros,
  }));
}
