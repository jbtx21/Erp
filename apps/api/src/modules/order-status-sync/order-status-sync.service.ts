// Auftragsstatus-Rückmeldung (Kap. 4.2): zentrale Stelle für die Effekte eines
// Statuswechsels. Shop-Aufträge → Status (gemäß Update-Strategie pushStatuses) als
// Outbox-Event an den Shop; der Shop verschickt die Kunden-Mail selbst. Aufträge OHNE
// Shop (ERP/Beratung) → das ERP mailt Versand-/Stornoinfo direkt an den Kunden.
// Mailfehler sind best-effort und blockieren den Statuswechsel nie.

import { buildTrackingEmail, buildTrackingUrl, type Carrier, type OrderStatus } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";
import type { MailSendService } from "../mail/mail.service.js";

export interface OrderSyncInfo {
  orderId: string;
  number: string;
  shopConnectorId: string | null;
  externalNumber: string | null;
  trackingNumber: string | null;
  carrier: Carrier | null;
  customerEmail: string | null;
  customerName: string | null;
  /** Statuswechsel, die der Shop-Connector zurückgespielt haben will (Update-Strategie). */
  pushStatuses: OrderStatus[];
}

export interface OrderStatusSyncRepository {
  loadSyncInfo(orderId: string): Promise<OrderSyncInfo | null>;
  enqueueShopStatusUpdate(input: {
    orderId: string;
    shopConnectorId: string;
    externalNumber: string;
    status: OrderStatus;
    trackingNumber: string | null;
    carrier: Carrier | null;
  }): Promise<void>;
}

export class OrderStatusSyncService {
  constructor(
    private readonly repo: OrderStatusSyncRepository,
    private readonly mail: MailSendService,
    private readonly audit: AuditSink
  ) {}

  /**
   * Reagiert auf einen Statuswechsel. `enqueueShopPush=false`, wenn der Shop-Push
   * bereits anderweitig eingereiht wurde (z. B. confirmShipped) — dann nur die
   * Kunden-Mail für Aufträge ohne Shop.
   */
  async onStatusChanged(orderId: string, status: OrderStatus, opts: { enqueueShopPush: boolean }): Promise<void> {
    const info = await this.repo.loadSyncInfo(orderId);
    if (!info) return;

    // Shop-Auftrag: Rückmeldung an den Shop (Shop mailt den Kunden selbst).
    if (info.shopConnectorId && info.externalNumber) {
      if (opts.enqueueShopPush && info.pushStatuses.includes(status)) {
        await this.repo.enqueueShopStatusUpdate({
          orderId,
          shopConnectorId: info.shopConnectorId,
          externalNumber: info.externalNumber,
          status,
          trackingNumber: info.trackingNumber,
          carrier: info.carrier,
        });
      }
      return;
    }

    // Auftrag ohne Shop (ERP/Beratung): Kunden-Mail direkt aus dem ERP.
    if (!info.customerEmail) return;
    const built = buildTrackingEmail({
      orderNumber: info.number,
      status,
      customerName: info.customerName,
      trackingNumber: info.trackingNumber,
      carrier: info.carrier,
      trackingUrl: buildTrackingUrl(info.carrier, info.trackingNumber),
    });
    if (!built) return;
    try {
      await this.mail.send({ to: info.customerEmail, subject: built.subject, body: built.body });
      await this.audit.append(
        buildEntry({ entity: "Order", entityId: orderId, action: "UPDATE", after: { kundenMail: status, to: info.customerEmail } })
      );
    } catch {
      // best-effort: ein Mailfehler darf den Statuswechsel nicht scheitern lassen.
    }
  }
}
