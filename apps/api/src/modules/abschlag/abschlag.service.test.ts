import { describe, expect, it } from "vitest";
import { AbschlagService } from "./abschlag.service.js";
import { InMemoryAbschlagRepository } from "../../repositories/in-memory-abschlag.repository.js";
import { AbschlagError } from "@texma/shared";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }
const numbering = { next: async () => `AR-2026-${String(++n).padStart(4, "0")}` } as unknown as import("../numbering/numbering.service.js").NumberingService;
let n = 0;

function setup() {
  n = 0;
  const repo = new InMemoryAbschlagRepository();
  repo.seedOrder({ id: "o1", number: "AB-2026-0001", companyId: "c1", orderNetCents: 100000, taxRatePct: 19, zahlungszielTage: 14 });
  return { svc: new AbschlagService(repo, numbering, new MemAudit(), () => new Date("2026-06-25T00:00:00Z")), repo };
}

describe("AbschlagService", () => {
  it("erzeugt einen prozentualen Abschlag mit USt", async () => {
    const { svc } = setup();
    const a = await svc.create("o1", { percent: 30 });
    expect(a.netCents).toBe(30000);
    expect(a.taxCents).toBe(5700);
    expect(a.number).toBe("AR-2026-0001");
  });

  it("verrechnet mehrere Abschläge zur Restsumme", async () => {
    const { svc } = setup();
    await svc.create("o1", { percent: 30 });
    await svc.create("o1", { netCents: 20000 });
    const v = await svc.forOrder("o1");
    expect(v.summary.sumNetCents).toBe(50000);
    expect(v.summary.restNetCents).toBe(50000);
    expect(v.abschlaege).toHaveLength(2);
  });

  it("sperrt Abschläge über die Restsumme hinaus", async () => {
    const { svc } = setup();
    await svc.create("o1", { percent: 80 });
    await expect(svc.create("o1", { percent: 30 })).rejects.toBeInstanceOf(AbschlagError);
  });

  it("markiert Abschläge als bezahlt", async () => {
    const { svc } = setup();
    const a = await svc.create("o1", { percent: 10 });
    await svc.setBezahlt(a.id, true);
    const v = await svc.forOrder("o1");
    expect(v.abschlaege[0]?.bezahlt).toBe(true);
  });
});
