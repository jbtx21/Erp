// Anwendungsfall: Sammelbestellung (Kap. 18.2). Mitarbeiter-Shopbestellungen eines
// SAMMEL-Shops werden je Periode (Intervall) zu einer Sammelbestellung gebündelt; SOFORT-
// Shops bleiben unberührt (Einzelauftrag direkt). Die Detailansicht fasst Artikel und
// Veredelung über alle Mitglieds-Aufträge zusammen (reine `bundleOrderLines`-Logik).

import { bundleOrderLines, currentPeriod, type BundleInputLine, type BundleResult, type SammelInterval } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface OrderShopMode {
  shopConnectorId: string;
  companyId: string;
  bestellmodus: string; // SOFORT | SAMMEL
  sammelInterval: string | null;
}

export interface CollectiveOrderRow {
  id: string;
  number: string;
  shopName: string;
  companyName: string;
  interval: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  orderCount: number;
}

export interface CollectiveOrderDetail extends CollectiveOrderRow {
  bundle: BundleResult;
  orders: Array<{ id: string; number: string; employeeNote: string | null; lineCount: number }>;
}

export interface SammelbestellungRepository {
  loadOrderShopMode(orderId: string): Promise<OrderShopMode | null>;
  ensureCollective(input: { shopConnectorId: string; companyId: string; interval: string; periodStart: Date; periodEnd: Date }): Promise<{ id: string }>;
  attachOrderToCollective(orderId: string, collectiveOrderId: string): Promise<void>;
  list(): Promise<CollectiveOrderRow[]>;
  detailMeta(id: string): Promise<CollectiveOrderRow | null>;
  /** Bündelungs-Eingaben (Positionen aller Mitglieds-Aufträge) + Mitgliederliste. */
  detailLines(id: string): Promise<{ lines: BundleInputLine[]; orders: CollectiveOrderDetail["orders"] }>;
  setStatus(id: string, status: "OFFEN" | "GEBUENDELT" | "UMGESETZT", closedAt: Date | null): Promise<void>;
  listShops(): Promise<ShopModeRow[]>;
  setShopMode(shopId: string, bestellmodus: string, sammelInterval: string | null): Promise<void>;
  /** Offene Sammelbestellungen, deren Periode bis `now` abgelaufen ist (Auto-Bündelung). */
  listDuePeriods(now: Date): Promise<Array<{ id: string; number: string }>>;
}

export interface ShopModeRow {
  id: string;
  name: string;
  companyName: string;
  bestellmodus: string;
  sammelInterval: string | null;
}

export class SammelbestellungError extends Error {}

export class SammelbestellungService {
  constructor(
    private readonly repo: SammelbestellungRepository,
    private readonly audit: AuditSink,
    private readonly now: () => Date = () => new Date()
  ) {}

  /**
   * Hängt einen frisch importierten Shopauftrag an die laufende Sammelbestellung seines
   * Shops, falls dieser im SAMMEL-Modus läuft. SOFORT-Shops → no-op (Einzelauftrag bleibt).
   */
  async attachOrder(orderId: string): Promise<{ collectiveOrderId: string; period: string } | null> {
    const mode = await this.repo.loadOrderShopMode(orderId);
    if (!mode || mode.bestellmodus !== "SAMMEL" || !mode.sammelInterval) return null;
    const period = currentPeriod(mode.sammelInterval as SammelInterval, this.now());
    const { id } = await this.repo.ensureCollective({
      shopConnectorId: mode.shopConnectorId, companyId: mode.companyId,
      interval: mode.sammelInterval, periodStart: period.start, periodEnd: period.end,
    });
    await this.repo.attachOrderToCollective(orderId, id);
    await this.audit.append(buildEntry({ entity: "CollectiveOrder", entityId: id, action: "UPDATE", after: { orderId, period: period.label } }));
    return { collectiveOrderId: id, period: period.label };
  }

  list(): Promise<CollectiveOrderRow[]> { return this.repo.list(); }

  async detail(id: string): Promise<CollectiveOrderDetail> {
    const meta = await this.repo.detailMeta(id);
    if (!meta) throw new SammelbestellungError("Sammelbestellung nicht gefunden.");
    const { lines, orders } = await this.repo.detailLines(id);
    return { ...meta, bundle: bundleOrderLines(lines), orders };
  }

  /** Status setzen (GEBUENDELT = abgeschlossen/gesperrt, UMGESETZT = in Produktion gegeben). */
  async setStatus(id: string, status: "OFFEN" | "GEBUENDELT" | "UMGESETZT"): Promise<void> {
    await this.repo.setStatus(id, status, status === "OFFEN" ? null : this.now());
    await this.audit.append(buildEntry({ entity: "CollectiveOrder", entityId: id, action: "UPDATE", after: { status } }));
  }

  /**
   * Auto-Bündelung am Periodenende (Cron, Kap. 13/18.2): alle offenen Sammelbestellungen,
   * deren Periode abgelaufen ist, werden auf GEBUENDELT gesetzt (abgeschlossen + auditiert).
   * Neue Bestellungen der Folgeperiode landen automatisch in einer frischen Sammelbestellung.
   */
  async autoBundleDuePeriods(): Promise<{ bundled: number; numbers: string[] }> {
    const due = await this.repo.listDuePeriods(this.now());
    for (const d of due) await this.setStatus(d.id, "GEBUENDELT");
    return { bundled: due.length, numbers: due.map((d) => d.number) };
  }

  listShops(): Promise<ShopModeRow[]> { return this.repo.listShops(); }

  /** Bestellmodus eines Shops setzen (SOFORT ohne Intervall, SAMMEL mit Intervall). */
  async setShopMode(shopId: string, bestellmodus: string, sammelInterval: string | null): Promise<void> {
    if (bestellmodus === "SAMMEL" && !sammelInterval) throw new SammelbestellungError("SAMMEL erfordert ein Intervall.");
    await this.repo.setShopMode(shopId, bestellmodus, bestellmodus === "SAMMEL" ? sammelInterval : null);
    await this.audit.append(buildEntry({ entity: "ShopConnector", entityId: shopId, action: "UPDATE", after: { bestellmodus, sammelInterval } }));
  }
}
