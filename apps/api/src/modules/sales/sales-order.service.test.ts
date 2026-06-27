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

  it("übernimmt den USt-Satz des Angebots in den Auftrag (Steuerbefreiung bleibt erhalten)", async () => {
    const { svc, repo } = setup();
    // Steuerbefreites Angebot (taxRatePct=0) → der Auftrag muss 0 % tragen, nicht 19 %.
    repo.addQuote({ id: "q-1", companyId: "co-1", accepted: false, lines: [{ description: "EU-B2B", qty: 5, unitNetCents: 1000, taxRatePct: 0 }] });
    await svc.convertQuote("q-1");
    expect(repo.orders[0]?.lines[0]?.taxRatePct).toBe(0);
  });

  it("übernimmt den Veredelungsbezug (bezugPosition) des Angebots in den Auftrag", async () => {
    const { svc, repo } = setup();
    // Veredelungsposition verweist auf die Textilposition 1 → Bezug bleibt beim Wandeln erhalten (Kap. 5.4/11).
    repo.addQuote({ id: "q-1", companyId: "co-1", accepted: false, lines: [
      { position: 1, description: "200 T-Shirts", qty: 200, unitNetCents: 500, kind: "TEXTIL" },
      { position: 2, description: "Siebdruck Brust", qty: 200, unitNetCents: 150, kind: "VEREDELUNG", bezugPosition: 1 },
    ] });
    await svc.convertQuote("q-1");
    expect(repo.orders[0]?.lines[1]?.bezugPosition).toBe(1);
  });

  it("verhindert doppelte Umwandlung desselben Angebots", async () => {
    const { svc, repo } = setup();
    repo.addQuote({ id: "q-1", companyId: "co-1", accepted: false, lines: [{ description: "Cap", qty: 3, unitNetCents: 900 }] });
    await svc.convertQuote("q-1");
    await expect(svc.convertQuote("q-1")).rejects.toBeInstanceOf(SalesOrderError);
  });

  it("fragt bei Hauptartikel ohne Variante Farbe×Größe ab (resolutions)", async () => {
    const { svc, repo } = setup();
    repo.addQuote({
      id: "q-1", companyId: "co-1", accepted: false,
      lines: [{ position: 1, description: "Polo HAKRO", qty: 10, unitNetCents: 1200, articleId: "art-1", articleName: "Polo HAKRO" }],
    });
    // ohne Auflösung → Fehler
    await expect(svc.convertQuote("q-1")).rejects.toBeInstanceOf(SalesOrderError);
    // mit Auflösung → Variante landet am Auftrag
    const res = await svc.convertQuote("q-1", { 1: "var-rot-l" });
    expect(res.number).toMatch(/^AB-/);
    expect(repo.orders[0]?.lines[0]?.variantId).toBe("var-rot-l");
  });

  it("löst einen Größenlauf beim Wandeln in mehrere Größenzeilen auf (Varianten-Matrix)", async () => {
    const { svc, repo } = setup();
    repo.addQuote({
      id: "q-1", companyId: "co-1", accepted: false,
      lines: [
        { position: 1, description: "T-Shirts Navy", qty: 200, unitNetCents: 500, articleId: "art-tshirt", articleName: "T-Shirt", kind: "TEXTIL" },
        { position: 2, description: "Siebdruck", qty: 200, unitNetCents: 150, kind: "VEREDELUNG", bezugPosition: 1 },
      ],
    });
    // Stückzahlen je Größe (Navy S/M/L) aus der Varianten-Matrix nach der Anprobe.
    const res = await svc.convertQuote("q-1", { 1: [
      { variantId: "v-navy-s", qty: 50 }, { variantId: "v-navy-m", qty: 80 }, { variantId: "v-navy-l", qty: 70 },
    ] });
    const order = repo.orders.find((o) => o.id === res.id)!;
    // Position 1 wird in 3 Größenzeilen aufgeteilt, die Veredelung folgt nach.
    expect(order.lines).toHaveLength(4);
    expect(order.lines.slice(0, 3).map((l) => [l.variantId, l.qty])).toEqual([["v-navy-s", 50], ["v-navy-m", 80], ["v-navy-l", 70]]);
    // Veredelungsbezug auf die NEUE Position der ersten Größenzeile ummappen (Pos. 1).
    expect(order.lines[3]?.kind).toBe("VEREDELUNG");
    expect(order.lines[3]?.bezugPosition).toBe(1);
  });

  it("wandelt temporär erfasste Produktpositionen (TEXTIL/VEREDELUNG) in feste Artikel", async () => {
    const { svc, repo } = setup();
    repo.addQuote({
      id: "q-1", companyId: "co-1", accepted: false,
      lines: [
        { position: 1, description: "Sonder-Polo", qty: 5, unitNetCents: 1500, kind: "TEXTIL" }, // frei → Artikel
        { position: 2, description: "Sonderstick", qty: 5, unitNetCents: 400, kind: "VEREDELUNG" }, // frei → Veredelungsartikel
        { position: 3, description: "Versandkosten", qty: 1, unitNetCents: 590, kind: "SONSTIGE" }, // bleibt frei
      ],
    });
    const res = await svc.convertQuote("q-1");
    const lines = repo.orders[0]!.lines;
    expect(lines[0]?.materializeArticle).toMatchObject({ name: "Sonder-Polo", isVeredelung: false, sku: `${res.number}-P1` });
    expect(lines[1]?.materializeArticle).toMatchObject({ name: "Sonderstick", isVeredelung: true });
    expect(lines[2]?.materializeArticle).toBeUndefined(); // SONSTIGE bleibt freie Position
  });

  it("materialisiert KEINE Position, die bereits Variante oder Artikel hat", async () => {
    const { svc, repo } = setup();
    repo.addQuote({
      id: "q-1", companyId: "co-1", accepted: false,
      lines: [{ position: 1, description: "Cap rot", qty: 3, unitNetCents: 900, kind: "TEXTIL", variantId: "var-cap-rot" }],
    });
    await svc.convertQuote("q-1");
    expect(repo.orders[0]?.lines[0]?.materializeArticle).toBeUndefined();
  });
});

describe("SalesOrderService.updateOrder (vollständige Bearbeitung)", () => {
  it("ersetzt Positionen, solange nicht fakturiert/geliefert/in Produktion", async () => {
    const { svc, repo } = setup();
    const { id } = await svc.createManual("co-1", [{ description: "Polo", qty: 5, unitNetCents: 1200 }]);
    await svc.updateOrder(id, "co-1", [{ description: "Polo bestickt", qty: 8, unitNetCents: 1350, listNetCents: 1500, rabattPct: 10, dbCents: 600 }]);
    const o = await svc.getOrderForEdit(id);
    expect(o.lines).toHaveLength(1);
    expect(o.lines[0]).toMatchObject({ qty: 8, unitNetCents: 1350, listNetCents: 1500, rabattPct: 10 });
  });

  it("blockt die Bearbeitung nach Fakturierung", async () => {
    const { svc, repo } = setup();
    const { id } = await svc.createManual("co-1", [{ description: "Polo", qty: 5, unitNetCents: 1200 }]);
    repo.orderLocks.set(id, { invoiced: true });
    await expect(svc.updateOrder(id, "co-1", [{ description: "X", qty: 1, unitNetCents: 100 }]))
      .rejects.toBeInstanceOf(SalesOrderError);
  });

  it("friert den Auftrag ab Versand ein (nur noch Storno, TEXMA-Regel)", async () => {
    const { svc, repo } = setup();
    const { id } = await svc.createManual("co-1", [{ description: "Polo", qty: 5, unitNetCents: 1200 }]);
    repo.orderLocks.set(id, { status: "VERSENDET" });
    await expect(svc.updateOrder(id, "co-1", [{ description: "X", qty: 1, unitNetCents: 100 }]))
      .rejects.toThrow(/Storno/);
  });

  it("erlaubt die Bearbeitung während der Produktion (Stückliste wird später neu aufgebaut)", async () => {
    const { svc, repo } = setup();
    const { id } = await svc.createManual("co-1", [{ description: "Polo", qty: 5, unitNetCents: 1200 }]);
    repo.orderLocks.set(id, { inProduction: true });
    await svc.updateOrder(id, "co-1", [{ description: "Polo XL", qty: 8, unitNetCents: 1300 }]);
    expect((await svc.getOrderForEdit(id)).lines[0]?.qty).toBe(8);
  });

  it("schützt bereits gelieferte Positionen (keine Reduktion unter die Liefermenge)", async () => {
    const { svc, repo } = setup();
    const { id } = await svc.createManual("co-1", [{ description: "Polo", qty: 10, unitNetCents: 1200 }]);
    repo.setDelivered(id, [6]); // 6 von 10 geliefert
    await expect(svc.updateOrder(id, "co-1", [{ description: "Polo", qty: 4, unitNetCents: 1200 }]))
      .rejects.toThrow(/gelieferter Menge/);
    // auf 8 erhöhen ist erlaubt
    await svc.updateOrder(id, "co-1", [{ description: "Polo", qty: 8, unitNetCents: 1200 }]);
    expect((await svc.getOrderForEdit(id)).lines[0]?.qty).toBe(8);
  });

  it("übernimmt konkrete Varianten direkt und lässt Alternativen weg", async () => {
    const { svc, repo } = setup();
    repo.addQuote({
      id: "q-1", companyId: "co-1", accepted: false,
      lines: [
        { position: 1, description: "Polo rot L", qty: 5, unitNetCents: 1200, variantId: "var-rot-l" },
        { position: 2, description: "Alternative: Polo blau L", qty: 5, unitNetCents: 1100, variantId: "var-blau-l", isAlternative: true },
      ],
    });
    const res = await svc.convertQuote("q-1");
    expect(res.number).toMatch(/^AB-/);
    expect(repo.orders[0]?.lines).toHaveLength(1);
    expect(repo.orders[0]?.lines[0]?.variantId).toBe("var-rot-l");
  });

  it("liefert einen Umwandlungs-Plan mit needsVariant-Markierung", async () => {
    const { svc, repo } = setup();
    repo.addQuote({
      id: "q-1", companyId: "co-1", accepted: false,
      lines: [
        { position: 1, description: "Polo HAKRO", qty: 10, unitNetCents: 1200, articleId: "art-1", articleName: "Polo HAKRO" },
        { position: 2, description: "Cap rot", qty: 3, unitNetCents: 900, variantId: "var-cap-rot" },
      ],
    });
    const plan = await svc.conversionPlan("q-1");
    expect(plan.lines[0]?.needsVariant).toBe(true);
    expect(plan.lines[1]?.needsVariant).toBe(false);
  });
});
