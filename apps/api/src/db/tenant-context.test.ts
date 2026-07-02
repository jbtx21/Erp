// Unit-Tests (ohne DB) für den Tenant-Kontext (ADR 0004, RLS Slice 1):
// AsyncLocalStorage-Semantik — verschachtelt, parallel, außerhalb des Kontexts.
import { describe, expect, it } from "vitest";
import { currentTenantId, DEFAULT_TENANT_ID, runWithTenant, setTenantLocal } from "./tenant-context.js";

describe("tenant-context", () => {
  it("liefert null außerhalb eines Tenant-Kontexts", () => {
    expect(currentTenantId()).toBeNull();
  });

  it("liefert den gesetzten Mandanten innerhalb von runWithTenant (sync + async)", async () => {
    expect(runWithTenant("tenant_a", () => currentTenantId())).toBe("tenant_a");
    const seen = await runWithTenant("tenant_a", async () => {
      await Promise.resolve(); // Kontext überlebt await-Grenzen
      return currentTenantId();
    });
    expect(seen).toBe("tenant_a");
  });

  it("verschachtelt: innerer Kontext gewinnt, äußerer wird wiederhergestellt", () => {
    runWithTenant("tenant_outer", () => {
      expect(currentTenantId()).toBe("tenant_outer");
      runWithTenant("tenant_inner", () => {
        expect(currentTenantId()).toBe("tenant_inner");
      });
      expect(currentTenantId()).toBe("tenant_outer");
    });
    expect(currentTenantId()).toBeNull();
  });

  it("parallel: konkurrierende async-Kontexte leaken nicht ineinander", async () => {
    const results = await Promise.all(
      ["tenant_a", "tenant_b", "tenant_c"].map((id) =>
        runWithTenant(id, async () => {
          // absichtlich versetzte Ticks, damit sich die Ausführungen verschränken
          await new Promise((r) => setTimeout(r, id === "tenant_b" ? 5 : 1));
          return currentTenantId();
        })
      )
    );
    expect(results).toEqual(["tenant_a", "tenant_b", "tenant_c"]);
  });

  it("setTenantLocal setzt app.tenant_id parametrisiert und transaktionslokal", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const tx = {
      $executeRawUnsafe: async (query: string, ...values: unknown[]) => {
        calls.push({ query, values });
        return 1;
      },
    };
    await setTenantLocal(tx, "tenant'; DROP TABLE \"Order\"; --");
    expect(calls).toHaveLength(1);
    // Wert reist als Bind-Parameter ($1), NIE interpoliert (SQL-Injection-sicher);
    // dritter set_config-Parameter true = transaktionslokal (SET LOCAL).
    expect(calls[0]!.query).toBe("SELECT set_config('app.tenant_id', $1, true)");
    expect(calls[0]!.values).toEqual(["tenant'; DROP TABLE \"Order\"; --"]);
  });

  it("exportiert den Default-Tenant des Backfills (Migration 0121)", () => {
    expect(DEFAULT_TENANT_ID).toBe("tenant_texma");
  });
});
