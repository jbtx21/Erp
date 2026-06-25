// Anwendungsfall: Auftragsampel (Xentral-Vorbild). Bindet die reine
// `computeAuftragsampel`-Logik (@texma/shared) an die Auftrags-Fakten (Status, Bestand,
// Liefertermin, Zahlung, Produktion, Freigabe, Liefersperre). Reine Leseanalyse über das
// Repository-Interface (testbar ohne DB). Angebots-/Produktionsampel laufen über die
// bestehende Termin-Ampel (`ampel.overview`, Ebene ANGEBOT/PRODUKTION).

import {
  computeAuftragsampel,
  computeAuftragProzess,
  validateVatId,
  type AmpelLamp,
  type AuftragsampelInput,
  type AmpelCheck,
  type AuftragProzessFacts,
  type ProzessStage,
} from "@texma/shared";

/** Roh-Fakten eines Auftrags für die Ampelberechnung (aus dem Repository). */
export interface AuftragFacts {
  id: string;
  number: string;
  companyName: string;
  country: string;
  vatId: string | null;
  liefersperre: boolean;
  status: AuftragsampelInput["status"];
  liefertermin: Date | null;
  lieferstatus: AuftragsampelInput["lieferstatus"];
  fakturastatus: AuftragsampelInput["fakturastatus"];
  openCents: number | null;
  grossCents: number | null;
  freigegeben: boolean;
  hasProduction: boolean;
  /** Bestandsgeführte Positionen: Sollmenge vs. aktueller Hauptlagerbestand. */
  lines: ReadonlyArray<{ variantId: string | null; qty: number; stockQty: number }>;
}

/** Zusatz-Fakten für die Prozesskette eines Auftrags (Detailsicht). */
export interface AuftragProzessExtra {
  route: AuftragProzessFacts["route"];
  terminSet: boolean;
  hasPurchaseOrder: boolean;
  hasGoodsReceipt: boolean;
  subCount: number;
  subBeigestellt: number;
  subZurueck: number;
}

export interface AuftragsampelZeile {
  id: string;
  number: string;
  companyName: string;
  status: string;
  liefertermin: Date | null;
  overall: AmpelLamp;
  checks: AmpelCheck[];
}

export interface AuftragDetail extends AuftragsampelZeile {
  prozess: ProzessStage[];
}

export interface StatusAmpelRepository {
  /** Aktive Aufträge (nicht abgeschlossen/storniert) mit allen Ampel-Fakten. */
  auftragFacts(): Promise<AuftragFacts[]>;
  /** Ampel- + Prozess-Fakten EINES Auftrags (Detailsicht/Trigger); null = nicht gefunden. */
  orderDetailFacts(orderId: string): Promise<(AuftragFacts & AuftragProzessExtra) | null>;
}

function produktionState(f: AuftragFacts): AuftragsampelInput["produktion"] {
  if (!f.hasProduction) return "KEINE";
  // Ab VERSANDBEREIT ist die Produktion abgeschlossen (Ware ist fertig).
  if (f.status === "VERSANDBEREIT" || f.status === "VERSENDET" || f.status === "FAKTURIERT" || f.status === "ABGESCHLOSSEN") return "ABGESCHLOSSEN";
  return f.freigegeben ? "FREIGEGEBEN" : "ANGELEGT";
}

export class StatusAmpelService {
  constructor(
    private readonly repo: StatusAmpelRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** Auftragsampel: je aktivem Auftrag die Prüf-Lampen + Gesamtampel (dringendste zuerst). */
  async auftragsampel(): Promise<AuftragsampelZeile[]> {
    const today = this.now();
    const facts = await this.repo.auftragFacts();
    const rows = facts.map((f) => {
      const input: AuftragsampelInput = {
        status: f.status,
        today,
        liefertermin: f.liefertermin,
        lieferstatus: f.lieferstatus,
        fakturastatus: f.fakturastatus,
        openCents: f.openCents,
        grossCents: f.grossCents,
        lines: f.lines.map((l) => ({ hasVariant: l.variantId !== null, sufficient: l.stockQty >= l.qty })),
        isEuForeignB2B: f.country !== "DE",
        vatIdValid: f.vatId ? validateVatId(f.vatId).valid : false,
        produktion: produktionState(f),
        freigegeben: f.freigegeben,
        liefersperre: f.liefersperre,
      };
      const { checks, overall } = computeAuftragsampel(input);
      return { id: f.id, number: f.number, companyName: f.companyName, status: f.status, liefertermin: f.liefertermin, overall, checks };
    });
    const rank: Record<AmpelLamp, number> = { ROT: 0, GELB: 1, GRUEN: 2, GRAU: 3 };
    return rows.sort((a, b) => rank[a.overall] - rank[b.overall] || a.number.localeCompare(b.number));
  }

  private ampelInput(f: AuftragFacts, today: Date): AuftragsampelInput {
    return {
      status: f.status, today, liefertermin: f.liefertermin, lieferstatus: f.lieferstatus, fakturastatus: f.fakturastatus,
      openCents: f.openCents, grossCents: f.grossCents,
      lines: f.lines.map((l) => ({ hasVariant: l.variantId !== null, sufficient: l.stockQty >= l.qty })),
      isEuForeignB2B: f.country !== "DE", vatIdValid: f.vatId ? validateVatId(f.vatId).valid : false,
      produktion: produktionState(f), freigegeben: f.freigegeben, liefersperre: f.liefersperre,
    };
  }

  /** Auftragsampel + Prozesskette EINES Auftrags (Auftragsdetail-Tab); null = nicht gefunden. */
  async auftragDetail(orderId: string): Promise<AuftragDetail | null> {
    const f = await this.repo.orderDetailFacts(orderId);
    if (!f) return null;
    const { checks, overall } = computeAuftragsampel(this.ampelInput(f, this.now()));
    const prozess = computeAuftragProzess({
      status: f.status, route: f.route, terminSet: f.terminSet, hasPurchaseOrder: f.hasPurchaseOrder,
      hasGoodsReceipt: f.hasGoodsReceipt, subCount: f.subCount, subBeigestellt: f.subBeigestellt, subZurueck: f.subZurueck,
      fakturastatus: f.fakturastatus, lieferstatus: f.lieferstatus,
    });
    return { id: f.id, number: f.number, companyName: f.companyName, status: f.status, liefertermin: f.liefertermin, overall, checks, prozess };
  }

  /**
   * Trigger-Fakten eines Auftrags: aktuelle Prozessstufe (AKTIV) + Gesamtampel + erster
   * blockierender Check. Basis für die Automations-Events `order.stage.changed`/`auftragsampel.red`.
   */
  async triggerFacts(orderId: string): Promise<{ stage: string; overall: AmpelLamp; blocker: string | null } | null> {
    const detail = await this.auftragDetail(orderId);
    if (!detail) return null;
    const aktiv = detail.prozess.find((s) => s.state === "AKTIV");
    const blocker = detail.checks.find((c) => c.lamp === "ROT");
    return { stage: aktiv?.key ?? "abgeschlossen", overall: detail.overall, blocker: blocker?.label ?? null };
  }
}
