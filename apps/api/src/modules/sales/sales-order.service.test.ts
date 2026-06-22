import { describe, expect, it } from "vitest";
import { SalesOrderError, SalesOrderService } from "./sales-order.service.js";
import { InMemorySalesOrderRepository } from "../../repositories/in-memory-sales-order.repository.js";
import { NumberingService } from "../numbering/numbering.service.js";
import { InMemoryNumberingRepository } from "../../repositories/in-memory-numbering.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }

function setup(companyIds: string[] = ["co-1"]): { svc: SalesOrderService; repo: InMemorySalesOrderRepository; audit: MemAudit } {
  const repo = new InMemorySalesOrderRepository(companyIds);
  const numbering = new NumberingService(new InMemoryNumberingRepository());
  const audit = new MemAudit();
  return { svc: new SalesOrderService(repo, numbering, audit), repo, audit };
}

describe("SalesOrderService (Auftragserstellung)", () => {
  it("legt einen manuellen Auftrag mit Positionen an", async () => {
    const { svc, repo, audit } = setup();
    const res = await svc.createManual("co-1", [{ description: "Polo", qty: 5, unitNetCents: 1200 }]);
    expect(res.number).toMatch(/^AB-/);
    expect(repo.orders).toHaveLength(1);
    expect(repo.orders[0]?.lines).toHaveLength(1);
    expect(audit.entries).toHaveLength(1);
  });

  it("lehnt leere Positionen / ungültige Menge / unbekannte Firma ab", async () => {
    const { svc } = setup();
    await expect(svc.createManual("co-1", [])).rejects.toBeInstanceOf(SalesOrderError);
    await expect(svc.createManual("co-1", [{ description: "X", qty: 0, unitNetCents: 100 }])).rejects.toBeInstanceOf(SalesOrderError);
    await expect(svc.createManual("unbekannt", [{ description: "X", qty: 1, unitNetCents: 100 }])).rejects.toBeInstanceOf(SalesOrderError);
  });

  it("wandelt ein Angebot in einen Auftrag um (Positionen + Verknüpfung + angenommen)", async () => {
    const { svc, repo } = setup();
    repo.addQuote({ id: "q-1", companyId: "co-1", accepted: false, lines: [{ description: "Cap", qty: 3, unitNetCents: 900 }] });
    const res = await svc.convertQuote("q-1");
    expect(res.number).toMatch(/^AB-/);
    expect(repo.orders[0]?.quoteId).toBe("q-1");
    expect(repo.quotes[0]?.accepted).toBe(true);
  });

  it("verhindert doppelte Umwandlung desselben Angebots", async () => {
    const { svc, repo } = setup();
    repo.addQuote({ id: "q-1", companyId: "co-1", accepted: false, lines: [{ description: "Cap", qty: 3, unitNetCents: 900 }] });
    await svc.convertQuote("q-1");
    await expect(svc.convertQuote("q-1")).rejects.toBeInstanceOf(SalesOrderError);
  });
});
