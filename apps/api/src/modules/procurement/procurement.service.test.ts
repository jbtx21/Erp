// Produktionsstart-Gate (T-05): Start erst bei vollständigem Wareneingang ALLER
// Lieferanten-Komponenten. In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { InMemoryProcurementRepository } from "../../repositories/in-memory-procurement.repository.js";
import { ProcurementService } from "./procurement.service.js";

const required = [
  { variantId: "v_fhb", supplierId: "sup_fhb", qty: 10 },
  { variantId: "v_ss", supplierId: "sup_ss", qty: 5 },
];

const refs = [
  { variantId: "v_fhb", label: "Polo navy (POLO-NV-L)", supplierName: "FHB" },
  { variantId: "v_ss", label: "T-Shirt weiß (TS-WS-M)", supplierName: "Stanley/Stella" },
];

function setup(received: { variantId: string; supplierId: string; receivedQty: number }[]) {
  const repo = new InMemoryProcurementRepository({ pa: required }, { pa: received }, { pa: refs });
  return new ProcurementService(repo);
}

describe("ProcurementService.productionStartStatus (T-05)", () => {
  it("sperrt den Start, solange ein Lieferant nicht (vollständig) eingegangen ist", async () => {
    const service = setup([{ variantId: "v_fhb", supplierId: "sup_fhb", receivedQty: 10 }]);
    const status = await service.productionStartStatus("pa");
    expect(status.canStart).toBe(false);
    expect(status.components).toEqual([
      expect.objectContaining({ supplierId: "sup_fhb", complete: true }),
      expect.objectContaining({ supplierId: "sup_ss", receivedQty: 0, complete: false }),
    ]);
  });

  it("gibt den Start frei, sobald beide Lieferanten vollständig eingegangen sind", async () => {
    const service = setup([
      { variantId: "v_fhb", supplierId: "sup_fhb", receivedQty: 10 },
      { variantId: "v_ss", supplierId: "sup_ss", receivedQty: 5 },
    ]);
    expect((await service.productionStartStatus("pa")).canStart).toBe(true);
  });

  it("zählt Teil-Wareneingänge zusammen", async () => {
    const service = setup([
      { variantId: "v_fhb", supplierId: "sup_fhb", receivedQty: 6 },
      { variantId: "v_fhb", supplierId: "sup_fhb", receivedQty: 4 },
      { variantId: "v_ss", supplierId: "sup_ss", receivedQty: 5 },
    ]);
    expect((await service.productionStartStatus("pa")).canStart).toBe(true);
  });

  it("löst Roh-IDs zu lesbaren Komponenten-/Lieferantennamen auf (Bucket A)", async () => {
    const service = setup([{ variantId: "v_fhb", supplierId: "sup_fhb", receivedQty: 10 }]);
    const status = await service.productionStartStatus("pa");
    expect(status.components).toEqual([
      expect.objectContaining({ label: "Polo navy (POLO-NV-L)", supplierName: "FHB" }),
      expect.objectContaining({ label: "T-Shirt weiß (TS-WS-M)", supplierName: "Stanley/Stella" }),
    ]);
  });

  it("fällt auf die ID zurück, wenn kein Ref hinterlegt ist", async () => {
    const repo = new InMemoryProcurementRepository({ pa: required }, { pa: [] });
    const status = await new ProcurementService(repo).productionStartStatus("pa");
    expect(status.components[0]).toMatchObject({ label: "v_fhb", supplierName: "sup_fhb" });
  });
});
