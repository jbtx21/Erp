// DATEV-Export-Service (Kap. 9.2, T-07): Periode → Buchungsstapel-CSV. In-Memory, keine DB.
// Rechnungen (SOLL) + Gutschriften (HABEN, DATEV-001), Sammeldebitor-Fallback, Audit.

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryDatevExportRepository } from "../../repositories/in-memory-datev-export.repository.js";
import type { DatevCreditNoteRow, DatevInvoiceRow } from "./datev-export.service.js";
import { DatevExportService } from "./datev-export.service.js";

const FROM = new Date("2026-01-01T00:00:00Z");
const TO = new Date("2026-12-31T23:59:59Z");

function setup(invoices: DatevInvoiceRow[], creditNotes: DatevCreditNoteRow[] = []): { audit: MemoryAuditSink; svc: DatevExportService } {
  const repo = new InMemoryDatevExportRepository(invoices, creditNotes);
  const audit = new MemoryAuditSink();
  return { audit, svc: new DatevExportService(repo, audit) };
}

describe("DatevExportService.export (T-07, Kap. 9.2)", () => {
  it("baut Buchungssätze aus Rechnungen (SOLL) + Gutschriften (HABEN) der Periode", async () => {
    const { svc } = setup(
      [{ number: "RE-2026-0001", issuedAt: new Date("2026-03-05T10:00:00Z"), netCents: 10000, taxCents: 1900, debitorKonto: "10001" }],
      [{ number: "GU-2026-0001", createdAt: new Date("2026-03-06T10:00:00Z"), amountCents: 11900, debitorKonto: "10001", invoiceNumber: "RE-2026-0001", invoiceNetCents: 10000, invoiceTaxCents: 1900 }]
    );
    const res = await svc.export({ from: FROM, to: TO, kontenrahmen: "SKR03" });
    expect(res.invoiceCount).toBe(1);
    expect(res.creditNoteCount).toBe(1);
    expect(res.buchungCount).toBe(2);
    const lines = res.csv.split("\r\n");
    // Rechnung: SOLL Debitor an Erlöse-19 (SKR03 8400), Netto 100,00.
    expect(lines[1]).toBe('100,00;S;10001;8400;9;0503;"RE-2026-0001";"Rechnung RE-2026-0001"');
    // Gutschrift: HABEN, positiver Betrag, Bezug zur Originalrechnung.
    expect(lines[2]).toBe('100,00;H;10001;8400;9;0603;"GU-2026-0001";"Gutschrift GU-2026-0001 zu RE-2026-0001"');
  });

  it("nutzt SKR04-Konten, wenn der Rahmen SKR04 gewählt ist", async () => {
    const { svc } = setup([{ number: "RE-1", issuedAt: new Date("2026-04-01T10:00:00Z"), netCents: 10000, taxCents: 1900, debitorKonto: "20001" }]);
    const res = await svc.export({ from: FROM, to: TO, kontenrahmen: "SKR04" });
    expect(res.csv.split("\r\n")[1]).toContain(";20001;4400;9;"); // Erlöse 19% SKR04 = 4400
  });

  it("fällt bei fehlendem Debitorenkonto auf den Sammeldebitor zurück (SKR03 1400)", async () => {
    const { svc } = setup([{ number: "RE-2", issuedAt: new Date("2026-05-01T10:00:00Z"), netCents: 10000, taxCents: 1900, debitorKonto: null }]);
    const res = await svc.export({ from: FROM, to: TO, kontenrahmen: "SKR03" });
    expect(res.csv.split("\r\n")[1]).toContain('100,00;S;1400;8400;');
  });

  it("filtert Belege außerhalb der Periode heraus", async () => {
    const { svc } = setup([
      { number: "RE-IN", issuedAt: new Date("2026-06-15T10:00:00Z"), netCents: 10000, taxCents: 1900, debitorKonto: "10001" },
      { number: "RE-OUT", issuedAt: new Date("2025-12-31T10:00:00Z"), netCents: 10000, taxCents: 1900, debitorKonto: "10001" },
    ]);
    const res = await svc.export({ from: FROM, to: TO, kontenrahmen: "SKR03" });
    expect(res.invoiceCount).toBe(1);
    expect(res.csv).toContain("RE-IN");
    expect(res.csv).not.toContain("RE-OUT");
  });

  it("protokolliert den Export (GoBD-Audit, Action EXPORT)", async () => {
    const { audit, svc } = setup([{ number: "RE-1", issuedAt: new Date("2026-03-05T10:00:00Z"), netCents: 10000, taxCents: 1900, debitorKonto: "10001" }]);
    await svc.export({ from: FROM, to: TO, kontenrahmen: "SKR03" });
    expect(audit.entries.at(-1)).toMatchObject({ entity: "DatevExport", action: "EXPORT" });
  });

  it("wirft bei ungültigem Zeitraum (von nach bis)", async () => {
    const { svc } = setup([]);
    await expect(svc.export({ from: TO, to: FROM, kontenrahmen: "SKR03" })).rejects.toThrow(/Zeitraum/);
  });
});
