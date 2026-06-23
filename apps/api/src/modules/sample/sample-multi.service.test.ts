import { describe, expect, it } from "vitest";
import { SampleLoanService } from "./sample.service.js";
import { InMemorySampleLoanRepository } from "../../repositories/in-memory-sample.repository.js";
import { NumberingService } from "../numbering/numbering.service.js";
import { InMemoryNumberingRepository } from "../../repositories/in-memory-numbering.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }
function setup() {
  const repo = new InMemorySampleLoanRepository();
  const svc = new SampleLoanService(repo, new NumberingService(new InMemoryNumberingRepository()), new MemAudit());
  return { svc, repo };
}

describe("Mehrartikel-Leihgut (mehrere Artikel / Lieferanten) + Angebot→Leihgut", () => {
  it("legt eine Mehrartikel-Leihe von verschiedenen Lieferanten an", async () => {
    const { svc, repo } = setup();
    const { id } = await svc.issueMulti({
      companyId: "co-1", zweck: "Anprobe",
      lines: [
        { description: "Polo blau M", supplierId: "sup-stanley", menge: 2 },
        { description: "Cap schwarz", supplierId: "sup-fhb", menge: 1 },
      ],
    });
    const loan = (await repo.list()).find((l) => l.id === id)!;
    expect(loan.zweck).toBe("Anprobe");
    expect(loan.lines).toHaveLength(2);
    expect(loan.lines.map((l) => l.supplierId)).toEqual(["sup-stanley", "sup-fhb"]);
    expect(loan.variantId).toBeNull(); // Mehrartikel-Header ohne Einzelvariante
  });

  it("Mehrartikel-Leihe wird NICHT automatisch berechnet (kein Listenpreis)", async () => {
    const { svc, repo } = setup();
    await svc.issueMulti({ companyId: "co-1", lines: [{ description: "Muster", menge: 1 }], at: new Date("2020-01-01") });
    const due = await repo.listDueForBilling(new Date("2026-01-01"));
    expect(due).toHaveLength(0);
  });

  it("wandelt ein Angebot in eine Muster/Anprobe-Leihe", async () => {
    const { svc, repo } = setup();
    repo.setQuoteForLoan("q-1", { companyId: "co-9", lines: [{ description: "200 Polos bestickt", menge: 2 }, { description: "Cap", menge: 1 }] });
    const { id } = await svc.convertQuoteToLoan("q-1");
    const loan = (await repo.list()).find((l) => l.id === id)!;
    expect(loan.companyId).toBe("co-9");
    expect(loan.zweck).toBe("Muster/Anprobe");
    expect(loan.lines).toHaveLength(2);
  });

  it("leere Positionen / unbekanntes Angebot werfen", async () => {
    const { svc } = setup();
    await expect(svc.issueMulti({ companyId: "co-1", lines: [] })).rejects.toThrow();
    await expect(svc.convertQuoteToLoan("missing")).rejects.toThrow();
  });
});
