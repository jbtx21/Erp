import { describe, expect, it } from "vitest";
import { computeReorderProposals, groupReorderBySupplier } from "./reorder.js";

const cand = (variantId: string, qty: number, minStock: number, supplierId: string, ekCents: number) => ({
  variantId,
  qty,
  minStock,
  supplierId,
  ekCents,
});

describe("computeReorderProposals (T-12)", () => {
  it("schlägt nur für unterschrittene Bestände vor (Menge bis Mindestbestand)", () => {
    const proposals = computeReorderProposals([
      cand("v1", 3, 10, "s1", 500), // unterschritten → 7
      cand("v2", 10, 10, "s1", 400), // genau am Mindestbestand → kein Vorschlag
      cand("v3", 20, 5, "s2", 300), // ausreichend → kein Vorschlag
    ]);
    expect(proposals).toEqual([{ variantId: "v1", supplierId: "s1", orderQty: 7, ekCents: 500 }]);
  });
});

describe("groupReorderBySupplier (Kap. 6.1)", () => {
  it("bündelt je Lieferant und summiert den Bestellwert", () => {
    const groups = groupReorderBySupplier([
      { variantId: "v1", supplierId: "s1", orderQty: 7, ekCents: 500 },
      { variantId: "v2", supplierId: "s1", orderQty: 2, ekCents: 400 },
      { variantId: "v3", supplierId: "s2", orderQty: 5, ekCents: 300 },
    ]);
    const s1 = groups.find((g) => g.supplierId === "s1");
    expect(s1?.lines).toHaveLength(2);
    expect(s1?.totalEkCents).toBe(7 * 500 + 2 * 400);
    expect(groups.find((g) => g.supplierId === "s2")?.totalEkCents).toBe(1500);
  });
});

import { aggregateDemand } from "./reorder.js";

describe("aggregateDemand (auftragsübergreifend + Leihgut)", () => {
  it("sammelt Bedarf je Variante aus mehreren Aufträgen + Leihgut, verrechnet Bestand", () => {
    const props = aggregateDemand(
      [
        { variantId: "v1", qty: 10, source: "ORDER", ref: "AB-1" },
        { variantId: "v1", qty: 5, source: "ORDER", ref: "AB-2" },
        { variantId: "v1", qty: 2, source: "LOAN", ref: "Muster-1" },
        { variantId: "v2", qty: 3, source: "ORDER", ref: "AB-1" },
      ],
      [{ variantId: "v1", qty: 8 }], // 8 auf Lager
      [{ variantId: "v1", supplierId: "sup-a", ekCents: 500 }, { variantId: "v2", supplierId: "sup-b", ekCents: 300 }],
    );
    const v1 = props.find((p) => p.variantId === "v1")!;
    // Auftrag 10+5=15, Muster 2 kommen zurück → Netto-Bedarf 13; abzgl. 8 Bestand → 5 bestellen.
    expect(v1.requiredQty).toBe(13);
    expect(v1.stockQty).toBe(8);
    expect(v1.orderQty).toBe(5); // (15 − 2) − 8
    expect(v1.supplierId).toBe("sup-a");
    expect(v1.sources).toHaveLength(3);
    const v2 = props.find((p) => p.variantId === "v2")!;
    expect(v2.orderQty).toBe(3);
  });

  it("zieht zurückkommende Muster vom Auftragsbedarf ab (200 Auftrag − 5 Muster → 195)", () => {
    const props = aggregateDemand(
      [
        { variantId: "v-shirt", qty: 200, source: "ORDER", ref: "AB-9" },
        { variantId: "v-shirt", qty: 5, source: "LOAN", ref: "Muster-9" },
      ],
      [],
      [{ variantId: "v-shirt", supplierId: "sup-a", ekCents: 640 }],
    );
    expect(props[0]!.orderQty).toBe(195);
  });

  it("blendet Varianten ohne Netto-Bedarf aus (genug Bestand)", () => {
    const props = aggregateDemand([{ variantId: "v1", qty: 5, source: "ORDER", ref: "AB-1" }], [{ variantId: "v1", qty: 10 }], []);
    expect(props).toHaveLength(0);
  });

  it("zieht bereits bestellte, noch offene Mengen (offene POs) vom Bedarf ab (MTO-Loch)", () => {
    const props = aggregateDemand(
      [{ variantId: "v1", qty: 20, source: "ORDER", ref: "AB-1" }],
      [{ variantId: "v1", qty: 3 }], // 3 auf Lager
      [{ variantId: "v1", supplierId: "sup-a", ekCents: 500 }],
      [{ variantId: "v1", qty: 5 }], // 5 bereits offen bestellt
    );
    // 20 Bedarf − 3 Bestand − 5 offen bestellt → 12 nachbestellen.
    expect(props[0]).toMatchObject({ requiredQty: 20, stockQty: 3, orderedQty: 5, orderQty: 12 });
  });

  it("fällt bei voller Deckung durch offene Bestellungen aus (orderQty 0 → nicht bestellbar)", () => {
    const props = aggregateDemand(
      [{ variantId: "v1", qty: 10, source: "ORDER", ref: "AB-1" }],
      [{ variantId: "v1", qty: 2 }],
      [{ variantId: "v1", supplierId: "sup-a", ekCents: 500 }],
      [{ variantId: "v1", qty: 8 }], // 2 Bestand + 8 offen = 10 → gedeckt
    );
    expect(props).toHaveLength(0);
  });

  it("berücksichtigt Teil-Deckung durch offene Bestellungen", () => {
    const props = aggregateDemand(
      [{ variantId: "v1", qty: 10, source: "ORDER", ref: "AB-1" }],
      [],
      [{ variantId: "v1", supplierId: "sup-a", ekCents: 500 }],
      [{ variantId: "v1", qty: 4 }],
    );
    expect(props[0]).toMatchObject({ orderedQty: 4, orderQty: 6 });
  });
});

import { groupDemandBySupplier, type DemandProposal } from "./reorder.js";

describe("groupDemandBySupplier (MTO — 1-Klick-Bestellungen aus Auftragsbedarf, Kap. 6.1)", () => {
  const prop = (over: Partial<DemandProposal>): DemandProposal => ({
    variantId: "v", supplierId: "s", requiredQty: 1, stockQty: 0, orderedQty: 0, orderQty: 1, ekCents: 100, sources: [], ...over,
  });

  it("bündelt bestellbaren Bedarf je Lieferant und summiert den Bestellwert", () => {
    const { bestellbar, ohneLieferant } = groupDemandBySupplier([
      prop({ variantId: "v1", supplierId: "s1", orderQty: 7, ekCents: 500, sources: [{ source: "ORDER", ref: "AB-1", qty: 7 }] }),
      prop({ variantId: "v2", supplierId: "s1", orderQty: 2, ekCents: 400 }),
      prop({ variantId: "v3", supplierId: "s2", orderQty: 5, ekCents: 300 }),
    ]);
    expect(ohneLieferant).toHaveLength(0);
    expect(bestellbar).toHaveLength(2);
    const s1 = bestellbar.find((g) => g.supplierId === "s1")!;
    expect(s1.lines.map((l) => l.variantId)).toEqual(["v1", "v2"]);
    expect(s1.totalEkCents).toBe(7 * 500 + 2 * 400);
    // Bedarfsquellen bleiben an der Position (PO ↔ Auftrag-Rückverweis).
    expect(s1.lines[0]?.sources).toEqual([{ source: "ORDER", ref: "AB-1", qty: 7 }]);
  });

  it("partitioniert Bedarf ohne Hauptlieferant nach ohneLieferant (Klärung statt Bestellung)", () => {
    const offen = prop({ variantId: "v-x", supplierId: null, orderQty: 3 });
    const { bestellbar, ohneLieferant } = groupDemandBySupplier([offen, prop({ variantId: "v1", supplierId: "s1" })]);
    expect(bestellbar).toHaveLength(1);
    expect(ohneLieferant).toEqual([offen]);
  });

  it("ignoriert Zeilen ohne Bestellmenge (orderQty 0)", () => {
    const { bestellbar, ohneLieferant } = groupDemandBySupplier([prop({ orderQty: 0 }), prop({ orderQty: 0, supplierId: null })]);
    expect(bestellbar).toHaveLength(0);
    expect(ohneLieferant).toHaveLength(0);
  });
});
