// Anwendungsfall: 3-Way-Match Eingangsrechnung (Kap. 9.6). Bindet die reine
// `threeWayMatch`-Logik (@texma/shared) an Bestellung + Wareneingang einer Eingangs-
// rechnung. Die Rechnungsposition (Menge, Stückpreis) gibt der Sachbearbeiter beim
// Prüfen ein (das CII-Inbound persistiert keine Positionsdetails). Bei Abweichung wird
// die Rechnung gesperrt (GESPERRT), sonst geprüft (GEPRUEFT). Repository als Interface.

import {
  threeWayMatch,
  type MatchVariance,
  type ThreeWayTolerance,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface PoAggregate {
  /** Bestellte Menge (Summe der Bestellpositionen). */
  poQty: number;
  /** Bestell-Stückpreis (mengen­gewichtet über die Positionen), in Cent. */
  poUnitCents: number;
  /** Gelieferte Menge (Summe der Wareneingänge). */
  receivedQty: number;
}

export interface ThreeWayMatchRepository {
  /** Bestellung (+ Wareneingang) einer Eingangsrechnung; null, wenn keine PO verknüpft. */
  poAggregateForInvoice(incomingInvoiceId: string): Promise<PoAggregate | null>;
  setStatus(incomingInvoiceId: string, status: "GEPRUEFT" | "GESPERRT"): Promise<void>;
}

export interface VerifyInput {
  incomingInvoiceId: string;
  invoicedQty: number;
  invoicedUnitCents: number;
  tolerance?: ThreeWayTolerance;
}

export type VerifyResult =
  | { status: "GEPRUEFT"; ok: true; variances: [] }
  | { status: "GESPERRT"; ok: false; variances: MatchVariance[] }
  | { status: "KEINE_BESTELLUNG"; ok: false; variances: [] };

export class ThreeWayMatchService {
  constructor(
    private readonly repo: ThreeWayMatchRepository,
    private readonly audit: AuditSink
  ) {}

  async verify(input: VerifyInput): Promise<VerifyResult> {
    const po = await this.repo.poAggregateForInvoice(input.incomingInvoiceId);
    if (!po) {
      return { status: "KEINE_BESTELLUNG", ok: false, variances: [] };
    }

    const result = threeWayMatch(
      {
        poQty: po.poQty,
        poUnitCents: po.poUnitCents,
        receivedQty: po.receivedQty,
        invoicedQty: input.invoicedQty,
        invoicedUnitCents: input.invoicedUnitCents,
      },
      input.tolerance
    );

    const status = result.ok ? "GEPRUEFT" : "GESPERRT";
    await this.repo.setStatus(input.incomingInvoiceId, status);
    await this.audit.append(
      buildEntry({
        entity: "IncomingInvoice",
        entityId: input.incomingInvoiceId,
        action: "UPDATE",
        after: { status, variances: result.variances },
      })
    );

    return result.ok
      ? { status: "GEPRUEFT", ok: true, variances: [] }
      : { status: "GESPERRT", ok: false, variances: result.variances };
  }
}
