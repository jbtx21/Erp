// Vertikaler Slice durch die tRPC-Schicht: der Shop-Ingest hält die T-01-Invariante
// (keine Phantom-Kunden) und ist idempotent. Nutzt In-Memory-Repository/Audit (keine DB).

import { describe, expect, it } from "vitest";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { OrderImportService } from "../modules/shop-import/order-import.service.js";
import { InMemoryOrderRepository } from "../repositories/in-memory-order.repository.js";
import { appRouter } from "./router.js";
import { createCallerFactory } from "./trpc.js";

function setup() {
  const repo = new InMemoryOrderRepository(new Set(["company_acme"]));
  const orderImport = new OrderImportService(repo, new MemoryAuditSink());
  const caller = createCallerFactory(appRouter)({ orderImport, orders: repo });
  return { caller, repo };
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

  it("list liefert die importierten Aufträge", async () => {
    const { caller } = setup();
    await caller.shopOrders.ingest({ raw: woo("WC-1", "max"), ...cfg });
    const list = await caller.shopOrders.list({ limit: 50 });
    expect(list).toHaveLength(1);
    expect(list[0]?.externalNumber).toBe("WC-1");
  });
});
