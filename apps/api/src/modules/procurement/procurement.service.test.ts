// Produktionsstart-Gate (T-05): Start erst bei vollständigem Wareneingang ALLER
// Lieferanten-Komponenten. In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { InMemoryProcurementRepository } from "../../repositories/in-memory-procurement.repository.js";
import { ProcurementService } from "./procurement.service.js";

const required = [
  { variantId: "v_fhb", supplierId: "sup_fhb", qty: 10 },
  { variantId: "v_ss", supplierId: "sup_ss", qty: 5 },
];

function setup(received: { variantId: string; supplierId: string; receivedQty: number }[]) {
  const repo = new InMemoryProcurementRepository({ pa: required }, { pa: received });
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
});
