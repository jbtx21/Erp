// Löst interne IDs (cuid) der Audit-Einträge auf sprechende Belegnummern auf (P1.4/P1.8),
// damit das GoBD-Protokoll keine rohen cuids zeigt. Batcht je Entitätstyp eine Abfrage
// auf das `number`-Feld (bzw. `name` bei Firmen). Unbekannte Entitäten bleiben unaufgelöst.

import { prisma } from "@texma/db";
import type { EntityNumberResolver } from "../modules/audit-log/audit-query.service.js";

// Entität (Audit-`entity`) → Prisma-Delegate + Anzeigefeld. Nur belegt-/stammdatenartige
// Entitäten mit sprechender Kennung; alles andere fällt auf die entityId zurück.
const NUMBER_FIELD: Record<string, "number" | "name"> = {
  Order: "number",
  Invoice: "number",
  Quote: "number",
  CreditNote: "number",
  IncomingInvoice: "number",
  PurchaseOrder: "number",
  DeliveryNote: "number",
  Inquiry: "number",
  Company: "name",
};

// Prisma-Client ist über die Delegates dynamisch ansprechbar; bewusst lose typisiert.
type Delegate = { findMany: (args: unknown) => Promise<Array<Record<string, unknown>>> };
const delegateFor = (entity: string): Delegate | null => {
  const key = entity.charAt(0).toLowerCase() + entity.slice(1);
  const d = (prisma as unknown as Record<string, unknown>)[key];
  return d && typeof (d as Delegate).findMany === "function" ? (d as Delegate) : null;
};

export class PrismaEntityNumberResolver implements EntityNumberResolver {
  async resolve(refs: ReadonlyArray<{ entity: string; entityId: string }>): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    // Nach Entitätstyp gruppieren (eine Abfrage je bekannten Typ).
    const byEntity = new Map<string, Set<string>>();
    for (const r of refs) {
      if (!(r.entity in NUMBER_FIELD)) continue;
      (byEntity.get(r.entity) ?? byEntity.set(r.entity, new Set()).get(r.entity)!).add(r.entityId);
    }
    for (const [entity, ids] of byEntity) {
      const field = NUMBER_FIELD[entity]!;
      const delegate = delegateFor(entity);
      if (!delegate) continue;
      try {
        const rows = await delegate.findMany({ where: { id: { in: [...ids] } }, select: { id: true, [field]: true } });
        for (const row of rows) {
          const val = row[field];
          if (typeof val === "string" && val) out.set(`${entity}:${String(row.id)}`, val);
        }
      } catch { /* unbekanntes Feld/Modell → entityId bleibt Fallback */ }
    }
    return out;
  }
}
