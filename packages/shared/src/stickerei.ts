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

export interface StickereiPlan {
  route: StickereiRoute;
  /**
   * Vor der Stickerei muss das Logo digitalisiert (gepuncht) werden — immer dann,
   * wenn keine Stickdatei vorliegt (neues Logo).
   */
  needsDigitizing: boolean;
  reason: string;
}

/**
 * Vollständiger Stickerei-Plan (Kap. 5.4): Weg + ob das Logo erst digitalisiert
 * (gepuncht) werden muss. Wiederholer mit Partner + Datei → Direktauftrag ohne Punch;
 * neues Logo/kein Partner → Ausschreibung, ggf. mit vorgeschaltetem Punch.
 */
export function planStickerei(ctx: StickereiContext): StickereiPlan {
  const route = decideStickereiRoute(ctx);
  const needsDigitizing = !ctx.hatStickdatei;
  let reason: string;
  if (route === "DIREKT") {
    reason = "Hinterlegter Partner und vorhandene Stickdatei → Direktauftrag.";
  } else if (!ctx.stickereiPartnerId) {
    reason = "Kein hinterlegter Partner → Ausschreibung.";
  } else {
    reason = "Partner hinterlegt, aber keine Stickdatei → Ausschreibung mit Digitalisierung.";
  }
  return { route, needsDigitizing, reason };
}

// ── Ausschreibung: Angebotsvergleich nach Stichzahl (Kap. 5.4) ──────────────

export interface StickereiOffer {
  partnerId: string;
  name: string;
  /** Einrichtungskosten (Punch/Setup) in Cent. */
  setupCents: number;
  /** Preis je 1.000 Stiche in Cent. */
  pricePer1000Cents: number;
  /** Zugesagte Durchlaufzeit in Tagen. */
  leadDays: number;
}

export interface StickereiQuote {
  partnerId: string;
  name: string;
  totalCents: number;
  leadDays: number;
}

/** Stickkosten = Einrichtung + aufgerundete Tausender-Stiche × Preis je 1.000. */
export function stickereiCostCents(stitches: number, offer: StickereiOffer): number {
  if (stitches < 0) throw new Error("stitches must be >= 0");
  return offer.setupCents + Math.ceil(stitches / 1000) * offer.pricePer1000Cents;
}

export interface StickereiComparison {
  quotes: StickereiQuote[];
  /** Günstigstes Angebot (bei Gleichstand kürzere Durchlaufzeit) oder null. */
  chosen: StickereiQuote | null;
}

/**
 * Vergleicht Partner-Angebote für eine Stichzahl (Ausschreibung, Kap. 5.4): je Angebot
 * Gesamtkosten, aufsteigend sortiert (bei Gleichstand kürzere Durchlaufzeit zuerst).
 */
export function compareStickereiOffers(
  stitches: number,
  offers: ReadonlyArray<StickereiOffer>
): StickereiComparison {
  const quotes = offers
    .map((o) => ({ partnerId: o.partnerId, name: o.name, totalCents: stickereiCostCents(stitches, o), leadDays: o.leadDays }))
    .sort((a, b) => a.totalCents - b.totalCents || a.leadDays - b.leadDays);
  return { quotes, chosen: quotes[0] ?? null };
}
