import { describe, expect, it, vi } from "vitest";
import { createOrderStatusUpdateHandler, type ShopWriter } from "./order-status-handler.js";
import type { OutboxRecord } from "@texma/orchestration";

const rec = (payload: unknown): OutboxRecord => ({ id: "e1", type: "order.status.update", payload, attempts: 0 });

describe("order.status.update Handler (T-06/T-09)", () => {
  it("pusht Status + Tracking an den Shop (VERSENDET → completed + Tracking)", async () => {
    const writer: ShopWriter = { updateOrderStatus: vi.fn().mockResolvedValue(undefined) };
    const resolveShopWriter = vi.fn().mockResolvedValue(writer);
    const handler = createOrderStatusUpdateHandler({ resolveShopWriter });

    await handler(
      rec({ externalNumber: "500", shopConnectorId: "shop_1", status: "VERSENDET", trackingNumber: "DPD123" })
    );

    expect(resolveShopWriter).toHaveBeenCalledWith("shop_1");
    expect(writer.updateOrderStatus).toHaveBeenCalledWith("500", "completed", "DPD123");
  });

  it("hängt KEIN Tracking an, solange nicht VERSENDET", async () => {
    const writer: ShopWriter = { updateOrderStatus: vi.fn().mockResolvedValue(undefined) };
    const handler = createOrderStatusUpdateHandler({ resolveShopWriter: vi.fn().mockResolvedValue(writer) });

    await handler(rec({ externalNumber: "500", shopConnectorId: "shop_1", status: "VERSANDBEREIT", trackingNumber: "DPD123" }));

    expect(writer.updateOrderStatus).toHaveBeenCalledWith("500", "on-hold", undefined);
  });

  it("ist ein No-op für manuelle Aufträge ohne Shop-Herkunft", async () => {
    const resolveShopWriter = vi.fn();
    const handler = createOrderStatusUpdateHandler({ resolveShopWriter });
    await handler(rec({ externalNumber: null, shopConnectorId: null, status: "VERSENDET" }));
    expect(resolveShopWriter).not.toHaveBeenCalled();
  });
});
