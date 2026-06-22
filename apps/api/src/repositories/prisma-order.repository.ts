// Prisma-Implementierung der Auftrags-Repositories (Produktionspfad).
// Persistiert Shop-Aufträge gegen die Firma (T-01) inkl. Positionen; bei
// Policy FREIE_EINGABE wird die übernommene Lieferadresse angelegt (K-08).

import { prisma } from "@texma/db";
import type { MappedOrder } from "@texma/shared";
import type {
  CreatedOrder,
  OrderRepository,
} from "../modules/shop-import/order-import.service.js";
import type { OrderLineItem, OrderListItem, OrderQueryRepository } from "./read.js";

export class PrismaOrderRepository
  implements OrderRepository, OrderQueryRepository
{
  async findByExternalNumber(
    shopConnectorId: string,
    externalNumber: string
  ): Promise<CreatedOrder | null> {
    const o = await prisma.order.findFirst({
      where: { shopConnectorId, externalNumber },
      select: { id: true, number: true, companyId: true },
    });
    return o ?? null;
  }

  async createFromShop(mapped: MappedOrder): Promise<CreatedOrder> {
    let deliveryAddressId: string | undefined;
    if (mapped.delivery.policy === "FREIE_EINGABE" && mapped.delivery.address) {
      const a = mapped.delivery.address;
      const da = await prisma.deliveryAddress.create({
        data: {
          companyId: mapped.companyId,
          label: "Shop-Lieferadresse",
          street: a.street,
          zip: a.zip,
          city: a.city,
          country: a.country,
        },
      });
      deliveryAddressId = da.id;
    }

    const order = await prisma.order.create({
      data: {
        number: `WC-${mapped.shopConnectorId.slice(0, 6)}-${mapped.externalNumber}`,
        externalNumber: mapped.externalNumber,
        employeeNote: mapped.employeeNote,
        company: { connect: { id: mapped.companyId } },
        shopConnector: { connect: { id: mapped.shopConnectorId } },
        ...(deliveryAddressId
          ? { deliveryAddress: { connect: { id: deliveryAddressId } } }
          : {}),
        lines: {
          create: mapped.lines.map((l) => ({
            position: l.position,
            description: l.description,
            qty: l.qty,
            unitNetCents: l.unitNetCents,
            // rawPayload ist JSONB; unknown → InputJsonValue
            rawPayload: l.rawPayload as object,
          })),
        },
      },
      select: { id: true, number: true, companyId: true },
    });
    return order;
  }

  async countCompanies(): Promise<number> {
    return prisma.company.count();
  }

  async listRecent(limit: number): Promise<OrderListItem[]> {
    const rows = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        number: true,
        companyId: true,
        status: true,
        lieferstatus: true,
        fakturastatus: true,
        zugesagterLiefertermin: true,
        externalNumber: true,
        employeeNote: true,
        createdAt: true,
        lines: { select: { qty: true, unitNetCents: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      companyId: r.companyId,
      status: r.status,
      lieferstatus: r.lieferstatus,
      fakturastatus: r.fakturastatus,
      zugesagterLiefertermin: r.zugesagterLiefertermin,
      externalNumber: r.externalNumber,
      employeeNote: r.employeeNote,
      totalNetCents: r.lines.reduce((sum, l) => sum + l.qty * l.unitNetCents, 0),
      createdAt: r.createdAt,
    }));
  }

  async getStatus(orderId: string): Promise<string | null> {
    const o = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    return o?.status ?? null;
  }

  async setStatus(orderId: string, status: string): Promise<void> {
    await prisma.order.update({ where: { id: orderId }, data: { status: status as never } });
  }

  async setDeliveryDate(orderId: string, date: Date | null): Promise<void> {
    await prisma.order.update({ where: { id: orderId }, data: { zugesagterLiefertermin: date } });
  }

  async loadFulfillmentInput(orderId: string): Promise<{ orderNetCents: number; invoiceNetCents: number | null; status: string; hasDelivery: boolean } | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        lines: { select: { qty: true, unitNetCents: true } },
        invoice: { select: { netCents: true } },
        deliveryNotes: { select: { id: true }, take: 1 },
      },
    });
    if (!o) return null;
    return {
      orderNetCents: o.lines.reduce((s, l) => s + l.qty * l.unitNetCents, 0),
      invoiceNetCents: o.invoice?.netCents ?? null,
      status: o.status,
      hasDelivery: o.deliveryNotes.length > 0,
    };
  }

  async setFulfillment(orderId: string, lieferstatus: string, fakturastatus: string): Promise<void> {
    await prisma.order.update({
      where: { id: orderId },
      data: { lieferstatus: lieferstatus as never, fakturastatus: fakturastatus as never },
    });
  }

  async orderLines(orderId: string): Promise<OrderLineItem[]> {
    return prisma.orderLine.findMany({
      where: { orderId },
      orderBy: { position: "asc" },
      select: { id: true, position: true, description: true, qty: true, unitNetCents: true },
    });
  }
}
