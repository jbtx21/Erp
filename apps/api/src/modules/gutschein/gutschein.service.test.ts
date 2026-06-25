import { describe, expect, it } from "vitest";
import { GutscheinService } from "./gutschein.service.js";
import { InMemoryGutscheinRepository } from "../../repositories/in-memory-gutschein.repository.js";
import { GutscheinError } from "@texma/shared";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }

function setup() {
  const repo = new InMemoryGutscheinRepository();
  const audit = new MemAudit();
  return { svc: new GutscheinService(repo, audit, () => new Date("2026-06-25T00:00:00Z")), audit };
}

describe("GutscheinService", () => {
  it("legt einen Gutschein an (Code normalisiert, Restguthaben = Wert)", async () => {
    const { svc } = setup();
    const g = await svc.create({ code: "sommer25", initialCents: 5000 });
    expect(g.code).toBe("SOMMER25");
    expect(g.remainingCents).toBe(5000);
  });

  it("verhindert doppelte Codes", async () => {
    const { svc } = setup();
    await svc.create({ code: "X1", initialCents: 1000 });
    await expect(svc.create({ code: "x1", initialCents: 2000 })).rejects.toBeInstanceOf(GutscheinError);
  });

  it("löst Teilbeträge ein und reduziert das Restguthaben (auditiert)", async () => {
    const { svc, audit } = setup();
    await svc.create({ code: "WERT", initialCents: 5000 });
    const r1 = await svc.redeem("wert", 2000);
    expect(r1).toEqual({ appliedCents: 2000, remainingCents: 3000 });
    const r2 = await svc.redeem("WERT", 9999); // mehr als Rest → nur Rest
    expect(r2).toEqual({ appliedCents: 3000, remainingCents: 0 });
    await expect(svc.redeem("WERT", 100)).rejects.toBeInstanceOf(GutscheinError); // leer
    expect(audit.entries.length).toBeGreaterThanOrEqual(3);
  });

  it("lehnt abgelaufene Gutscheine ab", async () => {
    const { svc } = setup();
    await svc.create({ code: "ALT", initialCents: 1000, validUntil: new Date("2026-01-01") });
    await expect(svc.redeem("ALT", 100)).rejects.toBeInstanceOf(GutscheinError);
  });
});
