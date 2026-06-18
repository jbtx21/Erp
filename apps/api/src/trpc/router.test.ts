// Vertikaler Slice durch die tRPC-Schicht: T-01 (Shop-Ingest), RBAC-Redaktion
// (Produktion ohne Preise) und die Auth-Guards. In-Memory, keine DB.

import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../modules/auth/auth.service.js";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { OrderImportService } from "../modules/shop-import/order-import.service.js";
import { SupplierImportService } from "../modules/supplier-import/supplier-import.service.js";
import { InMemoryOrderRepository } from "../repositories/in-memory-order.repository.js";
import { InMemorySupplierRepository } from "../repositories/in-memory-supplier.repository.js";
import { appRouter } from "./router.js";
import { createCallerFactory } from "./trpc.js";
import type { Context } from "./trpc.js";

const BUERO: AuthUser = { id: "u1", email: "b@texma.de", name: "Büro", role: "BUERO", totpEnabled: false };
const PRODUKTION: AuthUser = { id: "u2", email: "p@texma.de", name: "Prod", role: "PRODUKTION", totpEnabled: false };

function setup(user: AuthUser | null = BUERO) {
  const repo = new InMemoryOrderRepository(new Set(["company_acme"]));
  const orderImport = new OrderImportService(repo, new MemoryAuditSink());
  const supplierRepo = new InMemorySupplierRepository(new Map([["0020-RED-L", "var_1"]]));
  const supplierImport = new SupplierImportService(supplierRepo, new MemoryAuditSink());
  const ctx: Context = {
    orderImport,
    orders: repo,
    supplierImport,
    suppliers: supplierRepo,
    auth: {} as Context["auth"],
    user,
    sessionToken: user ? "tok" : null,
    setSessionCookie: vi.fn(),
    clearSessionCookie: vi.fn(),
  };
  const caller = createCallerFactory(appRouter)(ctx);
  return { caller, repo, supplierRepo };
}

const woo = (number: string, first: string) => ({
  id: Number(number.replace(/\D/g, "")),
  number,
  status: "processing",
  billing: { first_name: first, last_name: "X", email: `${first}@acme.de` },
  line_items: [{ name: "T-Shirt / L", quantity: 3, price: "19.90" }],
});

const cfg = { shopConnectorId: "shop_acme", companyId: "company_acme" };

describe("tRPC shopOrders — T-01 durch die Service-/Router-Schicht", () => {
  it("zwei Bestellungen verschiedener Mitarbeiter → eine Firma, keine neuen Firmen", async () => {
    const { caller, repo } = setup();
    const before = await repo.countCompanies();

    const a = await caller.shopOrders.ingest({ raw: woo("WC-1", "max"), ...cfg });
    const b = await caller.shopOrders.ingest({ raw: woo("WC-2", "erika"), ...cfg });

    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.order.companyId).toBe("company_acme");
    expect(b.order.companyId).toBe("company_acme");
    expect(await repo.countCompanies()).toBe(before); // T-01: 0 neue Company-Zeilen
  });

  it("ist idempotent bei gleicher externer Bestellnummer", async () => {
    const { caller } = setup();
    const a = await caller.shopOrders.ingest({ raw: woo("WC-9", "max"), ...cfg });
    const b = await caller.shopOrders.ingest({ raw: woo("WC-9", "max"), ...cfg });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.order.id).toBe(a.order.id);
  });
});

describe("tRPC RBAC — Produktion ohne Preis-/Kundenzugriff (Kap. 12)", () => {
  it("BUERO sieht Preis und Kundenvermerk", async () => {
    const { caller } = setup(BUERO);
    await caller.shopOrders.ingest({ raw: woo("WC-1", "max"), ...cfg });
    const list = await caller.shopOrders.list();
    expect(list[0]?.totalNetCents).toBe(3 * 1990);
    expect(list[0]?.employeeNote).toContain("max");
  });

  it("PRODUKTION erhält redigierte Preis-/Kundenfelder (null)", async () => {
    // Auftrag von BUERO anlegen, dann als PRODUKTION lesen.
    const buero = setup(BUERO);
    await buero.caller.shopOrders.ingest({ raw: woo("WC-1", "max"), ...cfg });
    const prod = createCallerFactory(appRouter)({
      orderImport: {} as Context["orderImport"],
      orders: buero.repo,
      supplierImport: {} as Context["supplierImport"],
      suppliers: buero.supplierRepo,
      auth: {} as Context["auth"],
      user: PRODUKTION,
      sessionToken: "tok",
      setSessionCookie: vi.fn(),
      clearSessionCookie: vi.fn(),
    });
    const list = await prod.shopOrders.list();
    expect(list[0]?.number).toBe("WC-WC-1"); // nicht-sensibles Feld bleibt
    expect(list[0]?.totalNetCents).toBeNull();
    expect(list[0]?.employeeNote).toBeNull();
  });
});

describe("tRPC Auth-Guards", () => {
  it("ohne Session wird die Auftragsliste mit UNAUTHORIZED abgewiesen", async () => {
    const { caller } = setup(null);
    await expect(caller.shopOrders.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("me liefert den eingeloggten Nutzer", async () => {
    const { caller } = setup(BUERO);
    expect(await caller.auth.me()).toMatchObject({ role: "BUERO", email: "b@texma.de" });
  });
});

describe("tRPC suppliers — Katalog-Import + RBAC (C3, Kap. 6/12)", () => {
  const catalogItem = {
    supplierSku: "IDI-0020",
    sku: "0020-RED-L",
    ekCents: 590,
    availableQty: 120,
  };

  it("BUERO importiert den Katalog und liest die Lieferanten-Artikel", async () => {
    const { caller } = setup(BUERO);
    const res = await caller.suppliers.ingestCatalog({
      supplierId: "sup_1",
      items: [catalogItem, { ...catalogItem, sku: "S-UNKNOWN", supplierSku: "IDI-X" }],
    });
    expect(res).toMatchObject({ upserted: 1, skipped: 1 });

    const items = await caller.suppliers.list({ supplierId: "sup_1" });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ ekCents: 590, supplierSku: "IDI-0020" });
  });

  it("PRODUKTION darf EK-Preise nicht importieren (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(
      caller.suppliers.ingestCatalog({ supplierId: "sup_1", items: [catalogItem] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("PRODUKTION darf die Lieferanten-Artikel nicht lesen (FORBIDDEN)", async () => {
    const { caller } = setup(PRODUKTION);
    await expect(caller.suppliers.list({ supplierId: "sup_1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
