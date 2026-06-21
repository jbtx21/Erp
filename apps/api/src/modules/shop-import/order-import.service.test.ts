import { describe, it, expect, vi } from "vitest";
import {
  OrderImportService,
  type OrderRepository,
  type CreatedOrder,
} from "./order-import.service.js";
import type { AuditSink } from "@texma/audit";
import type { MappedOrder } from "@texma/shared";

const config = { shopConnectorId: "shop_acme", companyId: "company_acme" };

function makeRepo(): { repo: OrderRepository; companyCount: { n: number } } {
  const orders = new Map<string, CreatedOrder>();
  const companyCount = { n: 1 }; // genau EINE Firma existiert vorab
  let seq = 0;
  const repo: OrderRepository = {
    async findByExternalNumber(shopId, ext) {
      return orders.get(`${shopId}:${ext}`) ?? null;
    },
    async createFromShop(mapped: MappedOrder) {
      const order: CreatedOrder = {
        id: `ord_${++seq}`,
        number: mapped.externalNumber,
        companyId: mapped.companyId,
      };
      orders.set(`${mapped.shopConnectorId}:${mapped.externalNumber}`, order);
      // T-01: createFromShop legt NIE einen Kunden an → companyCount unverändert
      return order;
    },
    async countCompanies() {
      return companyCount.n;
    },
  };
  return { repo, companyCount };
}

const wooOrder = {
  id: 1,
  number: "WC-1",
  status: "processing",
  billing: { first_name: "Max", last_name: "Mustermann", email: "max@acme.de" },
  line_items: [{ name: "T-Shirt / L", quantity: 3, price: "19.90" }],
};

describe("OrderImportService — T-01 Ende-zu-Ende", () => {
  it("legt Auftrag an, schreibt Audit, erzeugt KEINEN neuen Kunden", async () => {
    const { repo } = makeRepo();
    const append = vi.fn().mockResolvedValue(undefined);
    const audit: AuditSink = { append };
    const svc = new OrderImportService(repo, audit);

    const before = await repo.countCompanies();
    const res = await svc.importWooOrder(wooOrder, config);
    const after = await repo.countCompanies();

    expect(res.created).toBe(true);
    expect(res.order.companyId).toBe("company_acme");
    expect(append).toHaveBeenCalledOnce();
    expect(after).toBe(before); // keine Phantom-Kunden
  });

  it("ist idempotent — zweiter Import derselben Bestellung legt nichts neu an", async () => {
    const { repo } = makeRepo();
    const audit: AuditSink = { append: vi.fn().mockResolvedValue(undefined) };
    const svc = new OrderImportService(repo, audit);

    const a = await svc.importWooOrder(wooOrder, config);
    const b = await svc.importWooOrder(wooOrder, config);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.order.id).toBe(a.order.id);
  });

  it("verschiedene Mitarbeiter desselben Shops → dieselbe Firma", async () => {
    const { repo } = makeRepo();
    const audit: AuditSink = { append: vi.fn().mockResolvedValue(undefined) };
    const svc = new OrderImportService(repo, audit);

    const a = await svc.importWooOrder(wooOrder, config);
    const b = await svc.importWooOrder(
      { ...wooOrder, number: "WC-2", billing: { first_name: "Erika", last_name: "Musterfrau", email: "erika@acme.de" } },
      config
    );
    expect(a.order.companyId).toBe(b.order.companyId);
  });
});
