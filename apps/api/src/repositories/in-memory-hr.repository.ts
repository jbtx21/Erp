// In-Memory-HR für Tests.

import type { EmployeeRow, HrRepository, VacationRow } from "../modules/hr/hr.service.js";

interface Emp { id: string; name: string; email: string; position: string | null; urlaubstageJahr: number; aktiv: boolean }
interface Vac { id: string; employeeId: string; vonDatum: Date; bisDatum: Date; tage: number; status: "BEANTRAGT" | "GENEHMIGT" | "ABGELEHNT"; grund: string | null }

export class InMemoryHrRepository implements HrRepository {
  emps: Emp[] = [];
  vacs: Vac[] = [];
  calendarAbsences: Array<{ title: string; start: Date; end: Date }> = [];
  private seq = 0;

  private genehmigteTage(employeeId: string): number {
    return this.vacs.filter((v) => v.employeeId === employeeId && v.status === "GENEHMIGT").reduce((s, v) => s + v.tage, 0);
  }
  async listEmployees(): Promise<Array<Omit<EmployeeRow, "resturlaub">>> {
    return this.emps.map((e) => ({ ...e, genehmigteTage: this.genehmigteTage(e.id) }));
  }
  async createEmployee(input: { name: string; email: string; position: string | null; urlaubstageJahr: number }): Promise<{ id: string }> {
    const id = `emp_${String(++this.seq)}`;
    this.emps.push({ id, ...input, aktiv: true });
    return { id };
  }
  async listVacations(): Promise<VacationRow[]> {
    return this.vacs.map((v) => ({ ...v, employeeName: this.emps.find((e) => e.id === v.employeeId)?.name ?? "" }));
  }
  async createVacation(input: { employeeId: string; vonDatum: Date; bisDatum: Date; tage: number; grund: string | null }): Promise<{ id: string }> {
    const id = `vac_${String(++this.seq)}`;
    this.vacs.push({ id, ...input, status: "BEANTRAGT" });
    return { id };
  }
  async getVacation(id: string): Promise<{ id: string; employeeId: string; employeeName: string; vonDatum: Date; bisDatum: Date; status: string } | null> {
    const v = this.vacs.find((x) => x.id === id);
    return v ? { ...v, employeeName: this.emps.find((e) => e.id === v.employeeId)?.name ?? "" } : null;
  }
  async setVacationStatus(id: string, status: "GENEHMIGT" | "ABGELEHNT"): Promise<void> {
    const v = this.vacs.find((x) => x.id === id); if (v) v.status = status;
  }
  async createCalendarAbsence(input: { title: string; start: Date; end: Date }): Promise<void> {
    this.calendarAbsences.push(input);
  }
}
