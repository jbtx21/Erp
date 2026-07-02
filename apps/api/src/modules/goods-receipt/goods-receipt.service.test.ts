import { describe, expect, it } from "vitest";
import { GoodsReceiptError, GoodsReceiptService } from "./goods-receipt.service.js";
import { InMemoryGoodsReceiptRepository } from "../../repositories/in-memory-goods-receipt.repository.js";

class MemAudit { entries: Array<Record<string, unknown>> = []; async append(e: unknown): Promise<void> { this.entries.push(e as Record<string, unknown>); } }

function setup() {
  const repo = new InMemoryGoodsReceiptRepository([
    {
      id: "po1", number: "BE-2026-0001", supplierName: "FHB", status: "BESTELLT", productionId: "pa1",
      lines: [
        {
          id: "l1", variantId: "v1", label: "Polo rot (POLO-1)", articleName: "Polo", orderedQty: 100, ekCents: 500,
          attributes: [{ name: "Farbe", value: "Rot" }, { name: "Größe", value: "M" }],
          sources: [{ orderId: "o1", ref: "AU-2026-0042", qty: 80 }],
        },
        { id: "l2", variantId: "v2", label: "Cap (CAP-1)", articleName: "Cap", orderedQty: 50, ekCents: 300 },
      ],
    },
  ]);
  const audit = new MemAudit();
  return { repo, audit, svc: new GoodsReceiptService(repo, audit) };
}

describe("GoodsReceiptService.record (T-05/Kap. 6.3)", () => {
  it("Teil-Wareneingang setzt den Status auf TEILWEISE_ERHALTEN", async () => {
    const { svc } = setup();
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100 }] });
    expect(r.status).toBe("TEILWEISE_ERHALTEN"); // v2 fehlt noch
  });

  it("vollständiger Wareneingang aller Positionen setzt ERHALTEN", async () => {
    const { svc } = setup();
    await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100 }] });
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v2", receivedQty: 50 }] });
    expect(r.status).toBe("ERHALTEN");
  });

  it("kumuliert Teilmengen je Variante über mehrere Wareneingänge", async () => {
    const { svc } = setup();
    await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 60 }] });
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 40 }, { variantId: "v2", receivedQty: 50 }] });
    expect(r.status).toBe("ERHALTEN");
  });

  it("erledigte Bestellungen verschwinden aus der offenen Liste", async () => {
    const { svc, repo } = setup();
    await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100 }, { variantId: "v2", receivedQty: 50 }] });
    expect(await repo.listOpenPurchaseOrders()).toHaveLength(0);
  });

  it("weist leere Erfassung und unbekannte Varianten ab", async () => {
    const { svc } = setup();
    await expect(svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 0 }] })).rejects.toBeInstanceOf(GoodsReceiptError);
    await expect(svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "vX", receivedQty: 5 }] })).rejects.toBeInstanceOf(GoodsReceiptError);
  });
});

describe("Überlieferung (Kap. 6.3): Empfangsmenge über der Bestellmenge", () => {
  it("bucht die volle Empfangsmenge und meldet den Überschuss je Position", async () => {
    const { svc, repo } = setup();
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 120 }] });
    expect(r.lines).toEqual([{ variantId: "v1", ueberliefert: 20 }]);
    expect(r.status).toBe("TEILWEISE_ERHALTEN"); // v2 fehlt noch
    // Der Bestand stimmt physisch: die echte Empfangsmenge (120) ist kumuliert gebucht.
    const lines = await repo.purchaseOrderLines("po1");
    expect(lines.find((l) => l.variantId === "v1")?.receivedQty).toBe(120);
  });

  it("Status wird ERHALTEN, sobald kumuliert >= bestellt (auch mit Überschuss)", async () => {
    const { svc } = setup();
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 130 }, { variantId: "v2", receivedQty: 50 }] });
    expect(r.status).toBe("ERHALTEN");
    expect(r.lines).toEqual([
      { variantId: "v1", ueberliefert: 30 },
      { variantId: "v2", ueberliefert: 0 },
    ]);
  });

  it("Überlieferung kumuliert über mehrere Wareneingänge", async () => {
    const { svc } = setup();
    await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 90 }] });
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 25 }] });
    expect(r.lines).toEqual([{ variantId: "v1", ueberliefert: 15 }]);
  });

  it("Überlieferungen landen im Audit-Eintrag", async () => {
    const { svc, audit } = setup();
    await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 110 }] });
    const after = audit.entries[0]?.after as { ueberlieferungen: unknown };
    expect(after.ueberlieferungen).toEqual([{ variantId: "v1", ueberliefert: 10 }]);
  });
});

describe("Unterlieferung abschließen (Kap. 6.3): closeShort", () => {
  it("schließt ohne lineIds alle offenen Positionen → ERHALTEN + closedShortAt + Fehlmengen", async () => {
    const { svc, repo, audit } = setup();
    await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 60 }] });
    const r = await svc.closeShort({ purchaseOrderId: "po1" });
    expect(r.status).toBe("ERHALTEN");
    expect(r.closedLines).toEqual([
      { lineId: "l1", variantId: "v1", orderedQty: 100, receivedQty: 60, fehlmenge: 40 },
      { lineId: "l2", variantId: "v2", orderedQty: 50, receivedQty: 0, fehlmenge: 50 },
    ]);
    const po = repo.poState("po1");
    expect(po?.status).toBe("ERHALTEN");
    expect(po?.closedShortAt).toBeInstanceOf(Date);
    expect(po?.lines.every((l) => l.closedShort)).toBe(true);
    // Audit (GoBD): UPDATE am Beleg mit unterlieferten Positionen + Fehlmengen.
    const entry = audit.entries.at(-1) as { entity: string; action: string; after: { closedShort: unknown; status: string } };
    expect(entry).toMatchObject({ entity: "PurchaseOrder", action: "UPDATE" });
    expect(entry.after.status).toBe("ERHALTEN");
    expect(entry.after.closedShort).toEqual(r.closedLines);
  });

  it("schließt gezielt einzelne Positionen; Rest bleibt offen (kein ERHALTEN)", async () => {
    const { svc, repo } = setup();
    await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 60 }] });
    const r = await svc.closeShort({ purchaseOrderId: "po1", lineIds: ["l2"] });
    expect(r.status).toBe("TEILWEISE_ERHALTEN");
    expect(r.closedLines).toEqual([{ lineId: "l2", variantId: "v2", orderedQty: 50, receivedQty: 0, fehlmenge: 50 }]);
    const po = repo.poState("po1");
    expect(po?.status).toBe("TEILWEISE_ERHALTEN");
    expect(po?.closedShortAt ?? null).toBeNull();
  });

  it("record berücksichtigt closedShort: geschlossene Positionen zählen nicht mehr als offen", async () => {
    const { svc } = setup();
    await svc.closeShort({ purchaseOrderId: "po1", lineIds: ["l2"] }); // v2 kommt nicht mehr
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100 }] });
    expect(r.status).toBe("ERHALTEN"); // v2 ist closedShort → nicht mehr offen
  });

  it("weist unbekannte Bestellung, nicht-offene lineIds und komplett erledigte POs ab", async () => {
    const { svc } = setup();
    await expect(svc.closeShort({ purchaseOrderId: "poX" })).rejects.toBeInstanceOf(GoodsReceiptError);
    await expect(svc.closeShort({ purchaseOrderId: "po1", lineIds: ["lX"] })).rejects.toBeInstanceOf(GoodsReceiptError);
    await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100 }, { variantId: "v2", receivedQty: 50 }] });
    await expect(svc.closeShort({ purchaseOrderId: "po1" })).rejects.toBeInstanceOf(GoodsReceiptError);
  });
});

describe("DTO für Größenlauf + Auftrags-Verdrahtung (Kap. 6.3)", () => {
  it("liefert je Position attributes, articleName, closedShort und sources", async () => {
    const { svc } = setup();
    const [po] = await svc.listOpen();
    expect(po?.lines[0]).toMatchObject({
      id: "l1",
      articleName: "Polo",
      attributes: [{ name: "Farbe", value: "Rot" }, { name: "Größe", value: "M" }],
      closedShort: false,
      sources: [{ orderId: "o1", ref: "AU-2026-0042", qty: 80 }],
    });
    expect(po?.lines[1]).toMatchObject({ id: "l2", articleName: "Cap", attributes: [], sources: [] });
  });
});

describe("EK-Abgleich beim Wareneingang gegen die Bestellung (Kap. 9.6)", () => {
  it("kein Eingangs-EK erfasst → kein Abgleich (ekCheck null)", async () => {
    const { svc } = setup();
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100 }] });
    expect(r.ekCheck).toBeNull();
  });

  it("Eingangs-EK = Bestell-EK → OK", async () => {
    const { svc } = setup();
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100, ekCents: 500 }] });
    expect(r.ekCheck?.overall).toBe("OK");
    expect(r.ekCheck?.lines[0]).toMatchObject({ verdict: "OK", masterEkCents: 500 });
  });

  it("Eingangs-EK über Toleranz → ABWEICHUNG (Wareneingang wird trotzdem gebucht)", async () => {
    const { svc } = setup();
    const r = await svc.record({ purchaseOrderId: "po1", lines: [{ variantId: "v1", receivedQty: 100, ekCents: 560 }] }); // +12 %
    expect(r.status).toBe("TEILWEISE_ERHALTEN"); // Buchung erfolgt
    expect(r.ekCheck?.overall).toBe("ABWEICHUNG");
    expect(r.ekCheck?.lines[0]?.diffCents).toBe(60);
  });
});
