// Stickerei-Partnerlogik — Kap. 5.4 (Custom, Kap. 31).
// Neues Logo / kein hinterlegter Partner → Ausschreibung an Stickerei-Partner.
// Wiederholer mit hinterlegtem Partner UND vorhandener Stickdatei → Direktauftrag.

export type StickereiRoute = "DIREKT" | "AUSSCHREIBUNG";

export interface StickereiContext {
  /** Hinterlegter Stickerei-Partner der Firma (oder null). */
  stickereiPartnerId: string | null;
  /** Liegt eine fertige Stickdatei vor? */
  hatStickdatei: boolean;
}

/**
 * Entscheidet den Weg eines Stick-Auftrags (Kap. 5.4): Direktauftrag nur, wenn
 * Partner UND Stickdatei vorhanden sind — sonst Ausschreibung (Erstauftrag/Logo).
 */
export function decideStickereiRoute(ctx: StickereiContext): StickereiRoute {
  return ctx.stickereiPartnerId && ctx.hatStickdatei ? "DIREKT" : "AUSSCHREIBUNG";
}
