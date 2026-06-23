// Personalwesen (HR, nur Geschäftsleitung): Mitarbeiter-Stammdaten + Urlaubsanträge.
// Genehmigter Urlaub erzeugt einen geteilten Kalendereintrag (Abwesenheit sichtbar).
// Werktage-/Resturlaub-Berechnung liegt rein in @texma/shared.

import { remainingVacation, workdaysBetween } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface EmployeeRow {
  id: string;
  name: string;
  email: string;
  position: string | null;
  urlaubstageJahr: number;
  aktiv: boolean;
  /** Genehmigte Urlaubstage (laufendes Jahr) + Resturlaub (abgeleitet). */
  genehmigteTage: number;
  resturlaub: number;
}

export interface VacationRow {
  id: string;
  employeeId: string;
  employeeName: string;
  vonDatum: Date;
  bisDatum: Date;
  tage: number;
  status: "BEANTRAGT" | "GENEHMIGT" | "ABGELEHNT";
  grund: string | null;
}

export interface HrRepository {
  listEmployees(): Promise<Array<Omit<EmployeeRow, "resturlaub">>>;
  createEmployee(input: { name: string; email: string; position: string | null; urlaubstageJahr: number }): Promise<{ id: string }>;
  listVacations(): Promise<VacationRow[]>;
  createVacation(input: { employeeId: string; vonDatum: Date; bisDatum: Date; tage: number; grund: string | null }): Promise<{ id: string }>;
  getVacation(id: string): Promise<{ id: string; employeeId: string; employeeName: string; vonDatum: Date; bisDatum: Date; status: string } | null>;
  setVacationStatus(id: string, status: "GENEHMIGT" | "ABGELEHNT"): Promise<void>;
  /** Genehmigte Abwesenheit als geteilten Kalendereintrag spiegeln. */
  createCalendarAbsence(input: { title: string; start: Date; end: Date }): Promise<void>;
}

export class HrError extends Error {}

export class HrService {
  constructor(private readonly repo: HrRepository, private readonly audit: AuditSink) {}

  async listEmployees(): Promise<EmployeeRow[]> {
    const rows = await this.repo.listEmployees();
    return rows.map((e) => ({ ...e, resturlaub: remainingVacation(e.urlaubstageJahr, e.genehmigteTage) }));
  }

  async addEmployee(input: { name: string; email: string; position?: string | null; urlaubstageJahr?: number }): Promise<{ id: string }> {
    if (!input.name.trim()) throw new HrError("Name ist Pflicht.");
    if (!input.email.includes("@")) throw new HrError("Gültige E-Mail erforderlich.");
    const res = await this.repo.createEmployee({ name: input.name.trim(), email: input.email.trim().toLowerCase(), position: input.position ?? null, urlaubstageJahr: input.urlaubstageJahr ?? 30 });
    await this.audit.append(buildEntry({ entity: "Employee", entityId: res.id, action: "CREATE", after: { name: input.name } }));
    return res;
  }

  listVacations(): Promise<VacationRow[]> { return this.repo.listVacations(); }

  async requestVacation(input: { employeeId: string; vonDatum: Date; bisDatum: Date; grund?: string | null }): Promise<{ id: string; tage: number }> {
    const tage = workdaysBetween(input.vonDatum, input.bisDatum);
    if (tage <= 0) throw new HrError("Zeitraum ergibt keine Werktage.");
    const res = await this.repo.createVacation({ employeeId: input.employeeId, vonDatum: input.vonDatum, bisDatum: input.bisDatum, tage, grund: input.grund ?? null });
    await this.audit.append(buildEntry({ entity: "VacationRequest", entityId: res.id, action: "CREATE", after: { employeeId: input.employeeId, tage } }));
    return { id: res.id, tage };
  }

  /** Genehmigt/lehnt einen Antrag ab; bei Genehmigung → geteilter Kalendereintrag (Abwesenheit). */
  async decideVacation(id: string, approve: boolean): Promise<void> {
    const v = await this.repo.getVacation(id);
    if (!v) throw new HrError("Urlaubsantrag nicht gefunden.");
    if (v.status !== "BEANTRAGT") throw new HrError("Antrag ist bereits entschieden.");
    await this.repo.setVacationStatus(id, approve ? "GENEHMIGT" : "ABGELEHNT");
    if (approve) {
      await this.repo.createCalendarAbsence({ title: `Urlaub: ${v.employeeName}`, start: v.vonDatum, end: v.bisDatum });
    }
    await this.audit.append(buildEntry({ entity: "VacationRequest", entityId: id, action: "UPDATE", after: { status: approve ? "GENEHMIGT" : "ABGELEHNT" } }));
  }
}
