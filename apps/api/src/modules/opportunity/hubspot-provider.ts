// Hubspot-CRM-Adapter: spiegelt Verkaufschancen als Deals (CRM API v3). Aktiv nur mit
// HUBSPOT_TOKEN; Netzwerk-Adapter (in dieser Umgebung nicht live testbar), fetch injizierbar.

import type { CrmProvider, OpportunityRow } from "./opportunity.service.js";

type FetchLike = typeof globalThis.fetch;

const STAGE_TO_HUBSPOT: Record<string, string> = {
  QUALIFIZIERUNG: "qualifiedtobuy",
  ANGEBOT: "presentationscheduled",
  VERHANDLUNG: "contractsent",
  ABSCHLUSS: "closedwon",
};

export class HubspotCrmProvider implements CrmProvider {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: FetchLike = globalThis.fetch
  ) {}

  async upsertDeal(opp: OpportunityRow): Promise<{ providerRef: string | null }> {
    if (!this.token) throw new Error("HUBSPOT_TOKEN fehlt.");
    const res = await this.fetchImpl("https://api.hubapi.com/crm/v3/objects/deals", {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        properties: {
          dealname: opp.title,
          amount: String((opp.valueCents / 100).toFixed(2)),
          dealstage: STAGE_TO_HUBSPOT[opp.stage] ?? "qualifiedtobuy",
          hs_deal_stage_probability: String(opp.probability / 100),
        },
      }),
    });
    if (!res.ok) throw new Error(`Hubspot-Fehler ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { id?: string };
    return { providerRef: json.id ?? null };
  }
}
