import { describe, expect, it, vi } from "vitest";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";
import { OrderStatusSyncService, type OrderStatusSyncRepository, type OrderSyncInfo } from "./order-status-sync.service.js";
import type { MailSendService } from "../mail/mail.service.js";

function setup(info: OrderSyncInfo | null) {
  const enqueue = vi.fn(async () => undefined);
  const repo: OrderStatusSyncRepository = { loadSyncInfo: async () => info, enqueueShopStatusUpdate: enqueue };
  const send = vi.fn(async () => undefined);
  const mail = { send } as unknown as MailSendService;
  const svc = new OrderStatusSyncService(repo, mail, new MemoryAuditSink());
  return { svc, enqueue, send };
}

const shop = (over: Partial<OrderSyncInfo> = {}): OrderSyncInfo => ({
  orderId: "o1", number: "AB-1", shopConnectorId: "shop_1", externalNumber: "500",
  trackingNumber: "DPD9", carrier: "DPD", customerEmail: null, customerName: "Muster", pushStatuses: ["VERSENDET", "STORNIERT"], ...over,
});
const noShop = (over: Partial<OrderSyncInfo> = {}): OrderSyncInfo => ({
  orderId: "o2", number: "AB-2", shopConnectorId: null, externalNumber: null,
  trackingNumber: "DPD9", carrier: "DPD", customerEmail: "kunde@example.de", customerName: "Muster", pushStatuses: [], ...over,
});

describe("OrderStatusSyncService", () => {
  it("Shop-Auftrag + Status in pushStatuses → Outbox-Push, keine Mail", async () => {
    const { svc, enqueue, send } = setup(shop());
    await svc.onStatusChanged("o1", "STORNIERT", { enqueueShopPush: true });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ status: "STORNIERT", externalNumber: "500", carrier: "DPD" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("Shop-Auftrag, Status NICHT in pushStatuses → kein Push", async () => {
    const { svc, enqueue } = setup(shop({ pushStatuses: ["VERSENDET"] }));
    await svc.onStatusChanged("o1", "IN_PRODUKTION", { enqueueShopPush: true });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("Shop-Auftrag mit enqueueShopPush=false → kein doppelter Push (confirmShipped hat schon)", async () => {
    const { svc, enqueue } = setup(shop());
    await svc.onStatusChanged("o1", "VERSENDET", { enqueueShopPush: false });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("Auftrag ohne Shop + VERSENDET + Kunden-Mail → Versandmail mit Tracking-Link", async () => {
    const { svc, send } = setup(noShop());
    await svc.onStatusChanged("o2", "VERSENDET", { enqueueShopPush: false });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "kunde@example.de", subject: expect.stringContaining("AB-2"), body: expect.stringContaining("DPD9") }));
  });

  it("Auftrag ohne Shop ohne Kunden-E-Mail → keine Mail", async () => {
    const { svc, send } = setup(noShop({ customerEmail: null }));
    await svc.onStatusChanged("o2", "VERSENDET", { enqueueShopPush: false });
    expect(send).not.toHaveBeenCalled();
  });
});
