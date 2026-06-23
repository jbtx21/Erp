// Prisma-HR: Mitarbeiter + Urlaubsanträge; genehmigter Urlaub → geteilter Kalendereintrag.

import { prisma } from "@texma/db";
import type { EmployeeRow, HrRepository, VacationRow } from "../modules/hr/hr.service.js";

export class PrismaHrRepository implements HrRepository {
  async listEmployees(): Promise<Array<Omit<EmployeeRow, "resturlaub">>> {
    const rows = await prisma.employee.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, position: true, urlaubstageJahr: true, aktiv: true, vacations: { where: { status: "GENEHMIGT" }, select: { tage: true } } },
    });
    return rows.map((e) => ({
      id: e.id, name: e.name, email: e.email, position: e.position, urlaubstageJahr: e.urlaubstageJahr, aktiv: e.aktiv,
      genehmigteTage: e.vacations.reduce((s, v) => s + v.tage, 0),
    }));
  }
  async createEmployee(input: { name: string; email: string; position: string | null; urlaubstageJahr: number }): Promise<{ id: string }> {
    return prisma.employee.create({ data: input, select: { id: true } });
  }
  async listVacations(): Promise<VacationRow[]> {
    const rows = await prisma.vacationRequest.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, employeeId: true, vonDatum: true, bisDatum: true, tage: true, status: true, grund: true, employee: { select: { name: true } } },
    });
    return rows.map((v) => ({ id: v.id, employeeId: v.employeeId, employeeName: v.employee.name, vonDatum: v.vonDatum, bisDatum: v.bisDatum, tage: v.tage, status: v.status as VacationRow["status"], grund: v.grund }));
  }
  async createVacation(input: { employeeId: string; vonDatum: Date; bisDatum: Date; tage: number; grund: string | null }): Promise<{ id: string }> {
    return prisma.vacationRequest.create({ data: input, select: { id: true } });
  }
  async getVacation(id: string): Promise<{ id: string; employeeId: string; employeeName: string; vonDatum: Date; bisDatum: Date; status: string } | null> {
    const v = await prisma.vacationRequest.findUnique({ where: { id }, select: { id: true, employeeId: true, vonDatum: true, bisDatum: true, status: true, employee: { select: { name: true } } } });
    return v ? { id: v.id, employeeId: v.employeeId, employeeName: v.employee.name, vonDatum: v.vonDatum, bisDatum: v.bisDatum, status: v.status } : null;
  }
  async setVacationStatus(id: string, status: "GENEHMIGT" | "ABGELEHNT"): Promise<void> {
    await prisma.vacationRequest.update({ where: { id }, data: { status } });
  }
  async createCalendarAbsence(input: { title: string; start: Date; end: Date }): Promise<void> {
    await prisma.calendarEvent.create({ data: { title: input.title, ownerEmail: null, kind: "URLAUB", start: input.start, end: input.end, allDay: true } });
  }
}
