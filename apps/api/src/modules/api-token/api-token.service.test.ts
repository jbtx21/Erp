import { describe, expect, it } from "vitest";
import { ApiTokenService, ApiTokenError } from "./api-token.service.js";
import { InMemoryApiTokenRepository } from "../../repositories/in-memory-api-token.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }
function setup() {
  return { svc: new ApiTokenService(new InMemoryApiTokenRepository(), new MemAudit(), () => new Date("2026-06-25T00:00:00Z")) };
}

describe("ApiTokenService (PAT)", () => {
  it("stellt ein Token aus (Klartext einmalig) und prüft es", async () => {
    const { svc } = setup();
    const { token, record } = await svc.create("MCP-Agent", "BUERO");
    expect(token).toMatch(/^texma_pat_/);
    expect(record.role).toBe("BUERO");
    const v = await svc.verify(token);
    expect(v).toEqual({ tokenId: record.id, role: "BUERO" });
  });

  it("lehnt ungültige/widerrufene Tokens ab", async () => {
    const { svc } = setup();
    expect(await svc.verify("texma_pat_falsch")).toBeNull();
    const { token, record } = await svc.create("Tmp", "ADMIN");
    await svc.revoke(record.id);
    expect(await svc.verify(token)).toBeNull();
  });

  it("verlangt einen Namen", async () => {
    await expect(setup().svc.create("  ", "ADMIN")).rejects.toBeInstanceOf(ApiTokenError);
  });

  it("speichert nie den Klartext (nur Hash) — Liste ohne Token", async () => {
    const { svc } = setup();
    await svc.create("X", "BUCHHALTUNG");
    const list = await svc.list();
    expect(JSON.stringify(list)).not.toContain("texma_pat_");
  });
});
