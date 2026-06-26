// Verkaufschancen (komplexes CRM): Pipeline-Phasen, gewichteter Forecast, Gewinn/
// Verlust. Optionaler CRM-Provider (Hubspot o. Stub) spiegelt Chancen nach außen.

import {
  defaultProbabilityForStage, pipelineByStage, weightedForecast,
  type OpportunityStage, type OpportunityStatus, type StageBucket,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface OpportunityRow {
  id: string;
  title: string;
  companyId: string | null;
  stage: OpportunityStage;
  valueCents: number;
  probability: number;
  status: OpportunityStatus;
  lostReason: string | null;
}

export interface OpportunityRepository {
  list(): Promise<OpportunityRow[]>;
  create(input: { title: string; companyId: string | null; stage: OpportunityStage; valueCents: number; probability: number }): Promise<{ id: string }>;
  get(id: string): Promise<OpportunityRow | null>;
  update(id: string, patch: Partial<{ stage: OpportunityStage; probability: number; valueCents: number; status: OpportunityStatus; lostReason: string | null }>): Promise<void>;
}

/** CRM-Spiegelung nach außen (Hubspot o. Stub). */
export interface CrmProvider {
  upsertDeal(opp: OpportunityRow): Promise<{ providerRef: string | null }>;
}

export interface PipelineView {
  buckets: StageBucket[];
  forecastCents: number;
  openCount: number;
}

export class OpportunityError extends Error {}

export class OpportunityService {
  constructor(
    private readonly repo: OpportunityRepository,
    private readonly audit: AuditSink,
    private readonly crm?: CrmProvider
  ) {}

  list(): Promise<OpportunityRow[]> { return this.repo.list(); }

  /** Pipeline-Verdichtung (je Phase + gewichteter Gesamt-Forecast). */
  async pipeline(): Promise<PipelineView> {
    const opps = await this.repo.list();
    return {
      buckets: pipelineByStage(opps),
      forecastCents: weightedForecast(opps),
      openCount: opps.filter((o) => o.status === "OFFEN").length,
    };
  }

  async create(input: { title: string; companyId?: string | null; stage?: OpportunityStage; valueCents?: number; probability?: number }): Promise<{ id: string }> {
    if (!input.title.trim()) throw new OpportunityError("Titel ist Pflicht.");
    const stage = input.stage ?? "QUALIFIZIERUNG";
    const res = await this.repo.create({
      title: input.title.trim(),
      companyId: input.companyId ?? null,
      stage,
      valueCents: Math.max(0, input.valueCents ?? 0),
      probability: input.probability ?? defaultProbabilityForStage(stage),
    });
    await this.audit.append(buildEntry({ entity: "Opportunity", entityId: res.id, action: "CREATE", after: { title: input.title, stage } }));
    return res;
  }

  /** Phase wechseln; Wahrscheinlichkeit auf den Phasen-Standard heben (sofern nicht manuell höher). */
  async advanceStage(id: string, stage: OpportunityStage): Promise<void> {
    const o = await this.requireOpen(id);
    const prob = Math.max(o.probability, defaultProbabilityForStage(stage));
    await this.repo.update(id, { stage, probability: prob });
    await this.mirror(id);
    await this.audit.append(buildEntry({ entity: "Opportunity", entityId: id, action: "UPDATE", after: { stage, probability: prob } }));
  }

  async setProbability(id: string, probability: number): Promise<void> {
    await this.requireOpen(id);
    const prob = Math.max(0, Math.min(100, probability));
    await this.repo.update(id, { probability: prob });
    // GoBD (Kap. 10): jede Mutation auditieren — fehlte bisher (stille Änderung).
    await this.audit.append(buildEntry({ entity: "Opportunity", entityId: id, action: "UPDATE", after: { probability: prob } }));
  }

  async markWon(id: string): Promise<void> {
    await this.requireOpen(id);
    await this.repo.update(id, { status: "GEWONNEN", probability: 100 });
    await this.mirror(id);
    await this.audit.append(buildEntry({ entity: "Opportunity", entityId: id, action: "UPDATE", after: { status: "GEWONNEN" } }));
  }

  async markLost(id: string, reason: string): Promise<void> {
    await this.requireOpen(id);
    if (!reason.trim()) throw new OpportunityError("Verlustgrund ist Pflicht.");
    await this.repo.update(id, { status: "VERLOREN", probability: 0, lostReason: reason.trim() });
    await this.audit.append(buildEntry({ entity: "Opportunity", entityId: id, action: "UPDATE", after: { status: "VERLOREN", lostReason: reason } }));
  }

  private async requireOpen(id: string): Promise<OpportunityRow> {
    const o = await this.repo.get(id);
    if (!o) throw new OpportunityError("Verkaufschance nicht gefunden.");
    if (o.status !== "OFFEN") throw new OpportunityError("Verkaufschance ist bereits abgeschlossen.");
    return o;
  }

  private async mirror(id: string): Promise<void> {
    if (!this.crm) return;
    const o = await this.repo.get(id);
    if (o) await this.crm.upsertDeal(o);
  }
}

/** Stub-CRM: protokolliert statt zu spiegeln (kein Hubspot-Zugang). */
export class StubCrmProvider implements CrmProvider {
  public readonly deals: string[] = [];
  async upsertDeal(opp: OpportunityRow): Promise<{ providerRef: string | null }> {
    this.deals.push(opp.id);
    return { providerRef: null };
  }
}
