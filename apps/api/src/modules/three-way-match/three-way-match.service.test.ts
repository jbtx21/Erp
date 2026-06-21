// 3-Way-Match (Kap. 9.6): Übereinstimmung → GEPRUEFT; Mengen-/Preisabweichung →
// GESPERRT; ohne PO → KEINE_BESTELLUNG. In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryThreeWayMatchRepository } from "../../repositories/in-memory-three-way-match.repository.js";
import { ThreeWayMatchService } from "./three-way-match.service.js";

function setup() {
  const repo = new InMemoryThreeWayMatchRepository({
    ok: { po: { poQty: 10, poUnitCents: 500, receivedQty: 10 } },
    nopo: { po: null },
  });
  return { repo, service: new ThreeWayMatchService(repo, new MemoryAuditSink()) };
}

describe("ThreeWayMatchService.verify (Kap. 9.6)", () => {
  it("setzt GEPRUEFT, wenn Menge und Preis passen", async () => {
    const { repo, service } = setup();
    const res = await service.verify({ incomingInvoiceId: "ok", invoicedQty: 10, invoicedUnitCents: 500 });
    expect(res).toMatchObject({ status: "GEPRUEFT", ok: true });
    expect(repo.statusOf("ok")).toBe("GEPRUEFT");
  });

  it("sperrt bei zu hoher berechneter Menge (über Bestellung/Wareneingang)", async () => {
    const { service } = setup();
    const res = await service.verify({ incomingInvoiceId: "ok", invoicedQty: 12, invoicedUnitCents: 500 });
    expect(res.status).toBe("GESPERRT");
    expect(res.variances).toEqual(
      expect.arrayContaining(["MENGE_RECHNUNG_UEBER_BESTELLUNG", "MENGE_RECHNUNG_UEBER_WARENEINGANG"])
    );
  });

  it("sperrt bei Preisabweichung außerhalb der Toleranz", async () => {
    const { service } = setup();
    const res = await service.verify({ incomingInvoiceId: "ok", invoicedQty: 10, invoicedUnitCents: 560 });
    expect(res.variances).toContain("PREIS_ABWEICHUNG");
  });

  it("akzeptiert Abweichung innerhalb der Toleranz", async () => {
    const { service } = setup();
    const res = await service.verify({
      incomingInvoiceId: "ok",
      invoicedQty: 10,
      invoicedUnitCents: 510,
      tolerance: { qtyTolerance: 0, priceToleranceCents: 20 },
    });
    expect(res.status).toBe("GEPRUEFT");
  });

  it("meldet KEINE_BESTELLUNG, wenn keine PO verknüpft ist", async () => {
    const { service } = setup();
    expect((await service.verify({ incomingInvoiceId: "nopo", invoicedQty: 1, invoicedUnitCents: 1 })).status).toBe(
      "KEINE_BESTELLUNG"
    );
  });
});
