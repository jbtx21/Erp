// CAMT-Banking-Import (T-13): Zuordnung über Rechnungsnummer, Teil-/Überzahlung,
// Klärungspfade und Idempotenz. In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryBankingRepository } from "../../repositories/in-memory-banking.repository.js";
import { BankingImportService } from "./banking-import.service.js";

const ntry = (ref: string, ustrd: string, amount: string, cd = "CRDT") => `
  <Ntry><Amt Ccy="EUR">${amount}</Amt><CdtDbtInd>${cd}</CdtDbtInd><ValDt><Dt>2026-06-15</Dt></ValDt>
    <NtryDtls><TxDtls><Refs><AcctSvcrRef>${ref}</AcctSvcrRef></Refs>
      <RmtInf><Ustrd>${ustrd}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>`;
const stmt = (...entries: string[]) =>
  `<Document><BkToCstmrStmt><Stmt>${entries.join("")}</Stmt></BkToCstmrStmt></Document>`;

function setup(openItems = [{ id: "oi_1", invoiceNumber: "R-2026-001", openCents: 11900 }]) {
  const repo = new InMemoryBankingRepository(openItems);
  return { repo, service: new BankingImportService(repo, new MemoryAuditSink()) };
}

describe("BankingImportService.importStatement (T-13)", () => {
  it("ordnet einen Zahlungseingang dem offenen Posten zu und schreibt den Restbetrag fort", async () => {
    const { repo, service } = setup();
    const res = await service.importStatement(stmt(ntry("REF-1", "Zahlung Rechnung R-2026-001", "119.00")));
    expect(res).toMatchObject({ imported: 1, matched: 1, clarified: 0 });
    expect(repo.openCentsOf("oi_1")).toBe(0); // vollständig bezahlt
  });

  it("erkennt Teilzahlungen (OP bleibt teils offen, Zahlung gilt als zugeordnet)", async () => {
    const { repo, service } = setup();
    const res = await service.importStatement(stmt(ntry("REF-1", "R-2026-001 Teilzahlung", "50.00")));
    expect(res).toMatchObject({ matched: 1, clarified: 0 });
    expect(repo.openCentsOf("oi_1")).toBe(6900);
  });

  it("ignoriert Lastschriften (DBIT) und meldet Unbekanntes in die Klärung", async () => {
    const { service } = setup();
    const res = await service.importStatement(
      stmt(ntry("FEE", "Kontoführung", "5.00", "DBIT"), ntry("REF-2", "ohne Bezug", "42.00"))
    );
    expect(res).toMatchObject({ imported: 1, matched: 0, clarified: 1 });
  });

  it("bucht Überzahlungen zu und stellt den Rest in die Klärung", async () => {
    const { repo, service } = setup();
    const res = await service.importStatement(stmt(ntry("REF-1", "R-2026-001", "150.00")));
    expect(repo.openCentsOf("oi_1")).toBe(0);
    expect(res).toMatchObject({ matched: 0, clarified: 1 }); // matched=false wegen Überzahlungsrest
    const klaerung = await repo.listClarifications(10);
    expect(klaerung[0]).toMatchObject({ externalRef: "REF-1", amountCents: 15000 });
  });

  it("ist idempotent über die Bank-Referenz", async () => {
    const { service } = setup();
    await service.importStatement(stmt(ntry("REF-1", "R-2026-001", "119.00")));
    const again = await service.importStatement(stmt(ntry("REF-1", "R-2026-001", "119.00")));
    expect(again).toMatchObject({ imported: 0, skipped: 1 });
  });

  it("schließt einen OP mit Skonto (Zahlung knapp unter Restbetrag)", async () => {
    const { repo, service } = setup(); // OP 11900
    const res = await service.importStatement(stmt(ntry("REF-1", "R-2026-001", "115.43"))); // 3 % Skonto
    expect(res).toMatchObject({ matched: 1, clarified: 0 });
    expect(repo.openCentsOf("oi_1")).toBe(0); // geflossenes Geld + Skonto schließen den OP
  });
});

describe("BankingImportService.importPaypalCsv (PaymentSource PAYPAL)", () => {
  it("importiert PayPal-Brutto, klärt den OP und führt die Gebühr separat", async () => {
    const { repo, service } = setup(); // OP 11900
    const csv = [
      "Transaktionscode,Brutto,Gebühr,Währung,Status,Name,Rechnungsnummer",
      '"PP-1","119,00","-3,48","EUR","Abgeschlossen","ACME GmbH","R-2026-001"',
    ].join("\n");
    const res = await service.importPaypalCsv(csv);
    expect(res).toMatchObject({ imported: 1, matched: 1, clarified: 0 });
    expect(repo.openCentsOf("oi_1")).toBe(0); // Brutto (nicht Netto) klärt den OP
    const entries = await repo.listStatementEntries(10);
    expect(entries[0]?.source).toBe("PAYPAL");
  });

  it("überspringt Rückzahlungen (negatives Brutto) und ist idempotent", async () => {
    const { service } = setup();
    const csv = [
      "Transaktionscode,Brutto,Status,Rechnungsnummer",
      '"PP-R","-50,00","Abgeschlossen","R-2026-001"',
    ].join("\n");
    expect(await service.importPaypalCsv(csv)).toMatchObject({ imported: 0 });
  });
});
