// In-Memory-Implementierung der Auftrags-Repositories — für Tests und lokale
// Durchstiche ohne DB. Bildet die T-01-Invariante ab: der Import legt NIE eine
// Firma an; countCompanies basiert auf der vorab gesetzten Firmenmenge.

import type {
  CreatedOrder,
  OrderRepository,
} from "../modules/shop-import/order-import.service.js";
import type { MappedOrder } from "@texma/shared";
import type { OrderLineItem, OrderListItem, OrderQueryRepository } from "./read.js";

interface StoredOrder {
  id: string;
  number: string;
  companyId: string;
  status: string;
  lieferstatus: string;
  fakturastatus: string;
  zugesagterLiefertermin: Date | null;
  shopConnectorId: string;
  externalNumber: string;
  employeeNote: string;
  totalNetCents: number;
  fastLane?: boolean;
  createdAt: Date;
}

export class InMemoryOrderRepository
  implements OrderRepository, OrderQueryRepository
{
  private readonly orders: StoredOrder[] = [];
  private seq = 0;

  /** companyIds = bereits existierende Firmen (Stammdaten). Wächst durch Import NICHT. */
  constructor(private readonly companyIds: Set<string>) {}

  async findByExternalNumber(
    shopConnectorId: string,
    externalNumber: string
  ): Promise<CreatedOrder | null> {
    const o = this.orders.find(
      (x) => x.shopConnectorId === shopConnectorId && x.externalNumber === externalNumber
    );
    return o ? { id: o.id, number: o.number, companyId: o.companyId } : null;
  }

  async createFromShop(mapped: MappedOrder): Promise<CreatedOrder> {
    const id = `order_${++this.seq}`;
    const number = `WC-${mapped.externalNumber}`;
    this.orders.push({
      id,
      number,
      companyId: mapped.companyId,
      status: "ANGELEGT",
      lieferstatus: "NICHT",
      fakturastatus: "NICHT",
      zugesagterLiefertermin: null,
      shopConnectorId: mapped.shopConnectorId,
      externalNumber: mapped.externalNumber,
      employeeNote: mapped.employeeNote,
      totalNetCents: mapped.lines.reduce((sum, l) => sum + l.qty * l.unitNetCents, 0),
      createdAt: new Date(),
    });
    return { id, number, companyId: mapped.companyId };
  }

  async countCompanies(): Promise<number> {
    return this.companyIds.size;
  }

  readonly manualFetches: Array<{ shopConnectorId: string; externalNumber: string }> = [];
  async enqueueManualFetch(shopConnectorId: string, externalNumber: string): Promise<void> {
    this.manualFetches.push({ shopConnectorId, externalNumber });
  }

  // In-Memory speichert keine Einzelpositionen (nur Test/Demo) → leere Liste.
  async orderLines(_orderId: string): Promise<OrderLineItem[]> {
    return [];
  }

  async getStatus(orderId: string): Promise<string | null> {
    return this.orders.find((o) => o.id === orderId)?.status ?? null;
  }

  async getNumber(orderId: string): Promise<string | null> {
    return this.orders.find((o) => o.id === orderId)?.number ?? null;
  }

  async setStatus(orderId: string, status: string): Promise<void> {
    const o = this.orders.find((x) => x.id === orderId);
    if (o) o.status = status;
  }

  async setDeliveryDate(orderId: string, date: Date | null): Promise<void> {
    const o = this.orders.find((x) => x.id === orderId);
    if (o) o.zugesagterLiefertermin = date;
  }

  async loadFulfillmentInput(orderId: string): Promise<{ orderNetCents: number; invoiceNetCents: number | null; orderedQty: number; deliveredQty: number } | null> {
    const o = this.orders.find((x) => x.id === orderId);
    if (!o) return null;
    // In-Memory verfolgt keine Zeilenmengen/Rechnungen → konservativ leer.
    return { orderNetCents: o.totalNetCents, invoiceNetCents: null, orderedQty: 0, deliveredQty: 0 };
  }

  async setFulfillment(orderId: string, lieferstatus: string, fakturastatus: string): Promise<void> {
    const o = this.orders.find((x) => x.id === orderId);
    if (o) { o.lieferstatus = lieferstatus; o.fakturastatus = fakturastatus; }
  }

  async listRecent(limit: number): Promise<OrderListItem[]> {
    return this.orders
      .slice(-limit)
      .reverse()
      .map((o) => ({
        id: o.id,
        number: o.number,
        companyId: o.companyId,
        companyName: o.companyId, // In-Memory: kein Stammsatz-Join → ID als Fallback
        status: o.status,
        lieferstatus: o.lieferstatus,
        fakturastatus: o.fakturastatus,
        zugesagterLiefertermin: o.zugesagterLiefertermin,
        externalNumber: o.externalNumber,
        employeeNote: o.employeeNote,
        totalNetCents: o.totalNetCents,
        fastLane: o.fastLane ?? false,
        createdAt: o.createdAt,
      }));
  }

  async setFastLane(orderId: string, on: boolean): Promise<void> {
    const o = this.orders.find((x) => x.id === orderId);
    if (o) o.fastLane = on;
  }
}
