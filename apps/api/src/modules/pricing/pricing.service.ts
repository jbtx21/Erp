// Preisfindung mit Mengenstaffel (B4, Kap. 4.4 / T-15). Bindet die reine
// resolveBasePrice-Pipeline (@texma/shared) an die Preisquellen einer (Firma,
// Variante): kundenindividuelle Staffel → Preisgruppen-Staffel → Einzelpreis.
// Eine Pipeline, klare Präzedenz — kein paralleler Mechanismus.

import {
  buildStaffelLadder,
  deckungsbeitrag,
  dbMarge,
  resolveBasePrice,
  selectTier,
  type Cents,
  type PriceGroupKind,
  type PriceTier,
  type StaffelStufe,
  type VariantPrice,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface PriceContext {
  group: PriceGroupKind;
  customerTiers: PriceTier[];
  groupTiers: PriceTier[];
  groupPrices: VariantPrice[];
}

/** Aufgelöster Preis inkl. Herkunft der greifenden Stufe (für die UI/Transparenz). */
export interface ResolvedPrice {
  netCents: Cents;
  source: "KUNDE" | "GRUPPE_STAFFEL" | "GRUPPE_EINZEL";
  minMenge: number | null; // greifende Staffelstufe (null = Einzelpreis ohne Staffel)
  // Deckungsbeitrag (Kap. 4.4: DB bereits im Angebot sichtbar). EK = bester Lieferanten-
  // Einkaufspreis; null wenn kein Lieferantenpreis hinterlegt → DB/Marge nicht ermittelbar.
  ekCents: Cents | null;
  dbCents: Cents | null;
  dbMargePct: number | null; // 0..1
}

export interface TierView {
  customerTiers: PriceTier[];
  groupTiers: PriceTier[];
}

export interface PricingRepository {
  /** Lädt alle Preisquellen für (Firma, Variante) inkl. Preisgruppe der Firma. */
  loadPriceContext(companyId: string, variantId: string): Promise<PriceContext>;
  /** Hinterlegte Staffelstufen (kundenindividuell + Preisgruppe) für die Anzeige. */
  listTiers(companyId: string, variantId: string): Promise<TierView>;
  /** Legt/aktualisiert eine Preisgruppen-Staffelstufe der Gruppe der Firma an (B4). */
  upsertGroupTier(companyId: string, variantId: string, minMenge: number, netCents: number): Promise<void>;
  /** Entfernt eine Preisgruppen-Staffelstufe (Stammdaten-Pflege). */
  removeGroupTier(companyId: string, variantId: string, minMenge: number): Promise<void>;
  /** Bester (niedrigster) Lieferanten-EK je Variante in Cent; null wenn keiner gepflegt. */
  bestEkCents(variantId: string): Promise<number | null>;
  /** Basis-Staffel der Preisgruppe STANDARD (z. B. die Logo-/Veredelungs-Staffel, B4). */
  listStandardTiers(variantId: string): Promise<PriceTier[]>;
  /** EK-Mengenstaffel je Variante (Stick-EK je Stück gestaffelt); leer = nur flacher EK. */
  ekTiers(variantId: string): Promise<{ minMenge: number; ekCents: number }[]>;
}

/** Anzeige-Staffel je Position: VK+EK+DB je Mengenstufe (C+D) + bester EK. */
export interface StaffelView {
  ekCents: number | null;
  staffeln: StaffelStufe[];
}

export class PricingService {
  constructor(
    private readonly repo: PricingRepository,
    private readonly audit: AuditSink
  ) {}

  /** Netto-Basis-VK je Stück für die Bestellmenge (T-15), mit Herkunft + Deckungsbeitrag. */
  async resolve(companyId: string, variantId: string, menge: number): Promise<ResolvedPrice> {
    const ctx = await this.repo.loadPriceContext(companyId, variantId);
    let netCents: Cents;
    let source: ResolvedPrice["source"];
    let minMenge: number | null;
    const customer = selectTier(ctx.customerTiers, menge);
    const group = selectTier(ctx.groupTiers, menge);
    if (customer) { netCents = customer.netCents; source = "KUNDE"; minMenge = customer.minMenge; }
    else if (group) { netCents = group.netCents; source = "GRUPPE_STAFFEL"; minMenge = group.minMenge; }
    // Kein Staffeltreffer → Einzelpreis der Gruppe (wirft sichtbar bei Pflegefehler, T-08).
    else { netCents = resolveBasePrice(ctx, ctx.group, menge); source = "GRUPPE_EINZEL"; minMenge = null; }

    const ekCents = await this.repo.bestEkCents(variantId);
    const dbCents = ekCents === null ? null : deckungsbeitrag(netCents, ekCents);
    const dbMargePct = ekCents === null ? null : dbMarge(netCents, ekCents);
    return { netCents, source, minMenge, ekCents, dbCents, dbMargePct };
  }

  /** Reiner Netto-Preis je Stück (T-15) — schlanke Variante ohne Herkunft. */
  async netPrice(companyId: string, variantId: string, menge: number): Promise<Cents> {
    const ctx = await this.repo.loadPriceContext(companyId, variantId);
    return resolveBasePrice(ctx, ctx.group, menge);
  }

  /** Staffeltabelle (kundenindividuell + Gruppe) für (Firma, Variante). */
  async listTiers(companyId: string, variantId: string): Promise<TierView> {
    return this.repo.listTiers(companyId, variantId);
  }

  /**
   * Anzeige-Staffel (Mengenstaffel mit VK+EK+DB je Stufe) für die Positionsmaske (C+D):
   * mergt die STANDARD-Basisstaffel (z. B. die Logo-/Veredelungs-Staffel) mit der Gruppen-
   * und Kundenstaffel und ergänzt EK + Deckungsbeitrag je Stufe. So ist der gestaffelte
   * VK samt EK direkt im Angebot bei Veredelungen sichtbar.
   */
  async staffelpreise(companyId: string, variantId: string): Promise<StaffelView> {
    const [view, standardTiers, ekCents, ekTiers] = await Promise.all([
      this.repo.listTiers(companyId, variantId),
      this.repo.listStandardTiers(variantId),
      this.repo.bestEkCents(variantId),
      this.repo.ekTiers(variantId),
    ]);
    const staffeln = buildStaffelLadder({ standardTiers, groupTiers: view.groupTiers, customerTiers: view.customerTiers, ekCents, ekTiers });
    return { ekCents, staffeln };
  }

  /** Legt eine Preisgruppen-Staffelstufe an (Stammdaten-Pflege, auditiert). */
  async addGroupTier(companyId: string, variantId: string, minMenge: number, netCents: number): Promise<void> {
    if (minMenge < 1) throw new Error("minMenge muss >= 1 sein.");
    if (netCents < 0) throw new Error("netCents darf nicht negativ sein.");
    await this.repo.upsertGroupTier(companyId, variantId, minMenge, netCents);
    await this.audit.append(
      buildEntry({
        entity: "PriceGroupPriceTier",
        entityId: `${variantId}:${String(minMenge)}`,
        action: "CREATE",
        after: { companyId, variantId, minMenge, netCents },
      })
    );
  }

  /** Entfernt eine Preisgruppen-Staffelstufe (Stammdaten-Pflege, auditiert mit Vorher-Wert). */
  async removeGroupTier(companyId: string, variantId: string, minMenge: number): Promise<void> {
    const before = (await this.repo.listTiers(companyId, variantId)).groupTiers.find((t) => t.minMenge === minMenge);
    await this.repo.removeGroupTier(companyId, variantId, minMenge);
    await this.audit.append(
      buildEntry({
        entity: "PriceGroupPriceTier", entityId: `${variantId}:${String(minMenge)}`, action: "UPDATE",
        before: before ? { companyId, variantId, minMenge, netCents: before.netCents } : undefined,
        after: { companyId, variantId, minMenge, deleted: true },
      })
    );
  }
}
