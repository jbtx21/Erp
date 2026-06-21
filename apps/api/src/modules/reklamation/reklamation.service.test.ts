// Workflow C (Kap. 20): Kostenträger aus Ursache, Validierung der Folge-Kombination.
// In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryReklamationRepository } from "../../repositories/in-memory-reklamation.repository.js";
import { ReklamationService, ReklamationValidationError } from "./reklamation.service.js";

function setup() {
  const repo = new InMemoryReklamationRepository();
  return { repo, service: new ReklamationService(repo, new MemoryAuditSink()) };
}

describe("ReklamationService.create (Kap. 20)", () => {
  it("leitet den Kostenträger aus der Ursache ab und persistiert", async () => {
    const { service } = setup();
    expect((await service.create({ orderId: "o", orderLineId: "l", cause: "LIEFERANT", followUp: "GUTSCHRIFT", costCents: 1000 })).costBearer).toBe("LIEFERANT");
    expect((await service.create({ orderId: "o", orderLineId: "l", cause: "INTERN", followUp: "NACHPRODUKTION", costCents: 1000 })).costBearer).toBe("TEXMA");
    expect((await service.create({ orderId: "o", orderLineId: "l", cause: "EXTERN_VEREDLER", followUp: "EXPRESS_NACHPRODUKTION", costCents: 2000 })).costBearer).toBe("VEREDLER");
  });

  it("weist Kosten ohne Folgevorgang und Nachproduktion ohne Kosten ab", async () => {
    const { service } = setup();
    await expect(service.create({ orderId: "o", orderLineId: "l", cause: "INTERN", followUp: "KEINE", costCents: 500 })).rejects.toBeInstanceOf(ReklamationValidationError);
    await expect(service.create({ orderId: "o", orderLineId: "l", cause: "INTERN", followUp: "NACHPRODUKTION", costCents: 0 })).rejects.toBeInstanceOf(ReklamationValidationError);
  });

  it("listet die Reklamationen je Auftrag", async () => {
    const { service } = setup();
    await service.create({ orderId: "o1", orderLineId: "l", cause: "LIEFERANT", followUp: "GUTSCHRIFT", costCents: 100 });
    await service.create({ orderId: "o2", orderLineId: "l", cause: "INTERN", followUp: "NACHPRODUKTION", costCents: 100 });
    expect(await service.listByOrder("o1", 10)).toHaveLength(1);
  });
});
