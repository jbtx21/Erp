// Kostenstellen (B7, Kap. 37.1). Generische Stammtabelle + optionale Zuordnung an
// Belege; die Auswertung je Kostenstelle ist reine Aggregation (@texma/shared) —
// KEINE Buchung/kein Hauptbuch (Gate G1).

import { aggregateByCostCenter, type CostCenterTotal } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface CostCenterRow {
  id: string;
  nummer: string;
  name: string;
}

export interface CostCenterRepository {
  create(nummer: string, name: string): Promise<{ id: string; nummer: string }>;
  list(): Promise<CostCenterRow[]>;
  update(id: string, nummer: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  assignInvoice(invoiceId: string, costCenterId: string | null): Promise<void>;
  /** Rechnungs-Nettobeträge mit Kostenstellen-Zuordnung (null = nicht zugeordnet). */
  invoiceAmounts(): Promise<Array<{ costCenterId: string | null; amountCents: number }>>;
}

export class CostCenterService {
  constructor(
    private readonly repo: CostCenterRepository,
    private readonly audit: AuditSink
  ) {}

  async create(nummer: string, name: string): Promise<{ id: string; nummer: string }> {
    const cc = await this.repo.create(nummer, name);
    await this.audit.append(
      buildEntry({ entity: "CostCenter", entityId: cc.id, action: "CREATE", after: { nummer, name } })
    );
    return cc;
  }

  /** Bearbeitet Nummer/Bezeichnung einer Kostenstelle (GoBD-auditiert, Vorher/Nachher). */
  async update(id: string, nummer: string, name: string): Promise<void> {
    if (!nummer.trim() || !name.trim()) throw new Error("Nummer und Bezeichnung sind Pflicht.");
    const before = (await this.repo.list()).find((c) => c.id === id);
    await this.repo.update(id, nummer.trim(), name.trim());
    await this.audit.append(buildEntry({
      entity: "CostCenter", entityId: id, action: "UPDATE",
      before: before ? { nummer: before.nummer, name: before.name } : undefined,
      after: { nummer: nummer.trim(), name: name.trim() },
    }));
  }

  /** Alle Kostenstellen (Stammdaten). */
  async list(): Promise<CostCenterRow[]> {
    return this.repo.list();
  }

  /** Entfernt eine Kostenstelle; bestehende Zuordnungen werden auf „keine" gesetzt. */
  async remove(id: string): Promise<void> {
    await this.repo.remove(id);
    await this.audit.append(buildEntry({ entity: "CostCenter", entityId: id, action: "UPDATE", after: { deleted: true } }));
  }

  /** Ordnet eine Rechnung einer Kostenstelle zu (oder hebt die Zuordnung auf). */
  async assignInvoice(invoiceId: string, costCenterId: string | null): Promise<void> {
    await this.repo.assignInvoice(invoiceId, costCenterId);
    await this.audit.append(
      buildEntry({ entity: "Invoice", entityId: invoiceId, action: "UPDATE", after: { costCenterId } })
    );
  }

  /** Umsatz-Auswertung je Kostenstelle (G1: Auswertung, keine Buchung). */
  async invoiceReport(): Promise<CostCenterTotal[]> {
    return aggregateByCostCenter(await this.repo.invoiceAmounts());
  }
}
