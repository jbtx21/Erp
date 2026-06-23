import { describe, expect, it } from "vitest";
import { AuditQueryService, type AuditEntryRow } from "./audit-query.service.js";
import { InMemoryAuditLogRepository } from "../../repositories/in-memory-audit-log.repository.js";

function row(p: Partial<AuditEntryRow> & { id: string; createdAt: Date }): AuditEntryRow {
  return {
    userEmail: "a@texma.de", userName: "Anna", entity: "Order", entityId: "o1",
    action: "CREATE", before: null, after: { status: "NEU" }, ...p,
  };
}

function setup(): AuditQueryService {
  const rows: AuditEntryRow[] = [
    row({ id: "1", createdAt: new Date("2026-06-01"), entity: "Order", action: "CREATE", userEmail: "anna@texma.de" }),
    row({ id: "2", createdAt: new Date("2026-06-02"), entity: "Order", action: "UPDATE", userEmail: "ben@texma.de", entityId: "o2" }),
    row({ id: "3", createdAt: new Date("2026-06-03"), entity: "Invoice", action: "FINALIZE", userEmail: "anna@texma.de", entityId: "r1" }),
  ];
  return new AuditQueryService(new InMemoryAuditLogRepository(rows));
}

describe("AuditQueryService", () => {
  it("liefert Einträge neueste zuerst", async () => {
    const rows = await setup().list();
    expect(rows.map((r) => r.id)).toEqual(["3", "2", "1"]);
  });

  it("filtert nach Entität und Aktion", async () => {
    const rows = await setup().list({ entity: "Order", action: "UPDATE" });
    expect(rows.map((r) => r.id)).toEqual(["2"]);
  });

  it("filtert nach Nutzer-E-Mail (Teilstring, case-insensitiv)", async () => {
    const rows = await setup().list({ userEmail: "ANNA" });
    expect(rows.map((r) => r.id)).toEqual(["3", "1"]);
  });

  it("filtert nach Zeitraum", async () => {
    const rows = await setup().list({ from: new Date("2026-06-02"), to: new Date("2026-06-02T23:59:59") });
    expect(rows.map((r) => r.id)).toEqual(["2"]);
  });

  it("deckelt das Limit auf MAX_LIMIT (500)", async () => {
    const rows = await setup().list({ limit: 9999 });
    expect(rows.length).toBeLessThanOrEqual(500);
  });

  it("listet vorkommende Entitäten alphabetisch", async () => {
    expect(await setup().entities()).toEqual(["Invoice", "Order"]);
  });
});
