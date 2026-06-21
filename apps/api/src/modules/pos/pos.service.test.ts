// Unit-Test der Kasse (B6) mit Stub-TSE und In-Memory-Repo — ohne DB.

import { describe, expect, it } from "vitest";
import { dsfinvkExport, type CashSaleRecord } from "@texma/shared";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { InMemoryNumberingRepository } from "../../repositories/in-memory-numbering.repository.js";
import { InMemoryPosRepository } from "../../repositories/in-memory-pos.repository.js";
import { NumberingService } from "../numbering/numbering.service.js";
import { PosService, StubTseConnector } from "./pos.service.js";

function setup() {
  const repo = new InMemoryPosRepository();
  const numbering = new NumberingService(new InMemoryNumberingRepository());
  const service = new PosService(repo, new StubTseConnector("TSE-SN-7"), numbering, new MemoryAuditSink());
  return { repo, service };
}

const at = new Date(Date.UTC(2026, 5, 21, 10, 0, 0));

describe("PosService.recordSale (B6 / KassenSichV)", () => {
  it("signiert den Verkauf, vergibt eine BON-Nummer und hält ihn fest", async () => {
    const { repo, service } = setup();
    const res = await service.recordSale({ betragCents: 2499, art: "BAR", kassierer: "M.M." }, at);

    expect(res.belegNr).toBe("BON-2026-0001");
    expect(res.tse.seriennummer).toBe("TSE-SN-7");
    expect(res.tse.signatur.length).toBeGreaterThan(0);

    expect(repo.sales).toHaveLength(1);
    expect(repo.sales[0]).toMatchObject({ belegNr: "BON-2026-0001", betragCents: 2499, art: "BAR" });
  });

  it("vergibt fortlaufende BON-Nummern und ist append-only", async () => {
    const { repo, service } = setup();
    await service.recordSale({ betragCents: 1000, art: "BAR", kassierer: "A" }, at);
    await service.recordSale({ betragCents: 2000, art: "EC", kassierer: "A" }, at);
    expect(repo.sales.map((s) => s.belegNr)).toEqual(["BON-2026-0001", "BON-2026-0002"]);
  });

  it("lehnt nicht-positive Beträge ab", async () => {
    const { service } = setup();
    await expect(service.recordSale({ betragCents: 0, art: "BAR", kassierer: "A" }, at)).rejects.toThrow();
  });

  it("DSFinV-K-Export der erfassten Belege ist valide", async () => {
    const { repo, service } = setup();
    await service.recordSale({ betragCents: 2499, art: "BAR", kassierer: "M.M." }, at);
    const records: CashSaleRecord[] = repo.sales.map((s) => ({
      belegNr: s.belegNr,
      betragCents: s.betragCents,
      art: s.art,
      kassiertAm: s.kassiertAm,
      kassierer: s.kassierer,
      tseSignatur: s.tse.signatur,
      tseSeriennummer: s.tse.seriennummer,
      tseTxId: s.tse.txId,
    }));
    const csv = dsfinvkExport(records);
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv).toContain("BON-2026-0001;2026-06-21T10:00:00Z;24.99;BAR;M.M.;TSE-SN-7;");
  });
});
