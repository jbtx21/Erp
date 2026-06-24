// Versanddienstleister (Carrier) + Tracking-Link-Vorlagen und der reine Builder für
// die Kunden-Versand-/Storno-Mail (Kap. 4.2). IO-frei: erzeugt nur Strings/Payloads,
// der Versand (SMTP) bzw. Shop-Push erfolgt in der jeweiligen Schicht.
// Genutzt für Aufträge OHNE Shop (ERP/Beratung): das ERP mailt direkt an den Kunden.

import type { OrderStatus } from "./order.js";

/** Versanddienstleister — bestimmt die Tracking-Link-Vorlage. Spiegelt das Prisma-Enum `Carrier`. */
export type Carrier = "DPD" | "DHL" | "GLS" | "UPS" | "HERMES" | "SONSTIGE";

export const CARRIER_LABEL: Record<Carrier, string> = {
  DPD: "DPD",
  DHL: "DHL",
  GLS: "GLS",
  UPS: "UPS",
  HERMES: "Hermes",
  SONSTIGE: "Sonstige",
};

/** Tracking-URL-Vorlage je Carrier (`{tn}` = Trackingnummer). SONSTIGE ohne Vorlage. */
const TRACKING_URL_TEMPLATE: Record<Carrier, string | null> = {
  DPD: "https://tracking.dpd.de/status/de_DE/parcel/{tn}",
  DHL: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode={tn}",
  GLS: "https://gls-group.com/DE/de/paketverfolgung?match={tn}",
  UPS: "https://www.ups.com/track?loc=de_DE&tracknum={tn}",
  HERMES: "https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation/#{tn}",
  SONSTIGE: null,
};

/**
 * Baut den Tracking-Link aus Carrier + Trackingnummer. Gibt null zurück, wenn keine
 * Vorlage existiert (SONSTIGE) oder Angaben fehlen — der Aufrufer zeigt dann nur die Nummer.
 */
export function buildTrackingUrl(carrier: Carrier | null | undefined, trackingNumber: string | null | undefined): string | null {
  if (!carrier || !trackingNumber) return null;
  const tpl = TRACKING_URL_TEMPLATE[carrier];
  return tpl ? tpl.replace("{tn}", encodeURIComponent(trackingNumber)) : null;
}

export interface TrackingEmailInput {
  orderNumber: string;
  status: OrderStatus;
  customerName?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  carrier?: Carrier | null;
}

export interface BuiltEmail {
  subject: string;
  body: string;
}

/**
 * Reiner Builder der Kunden-Mail zum Statuswechsel (VERSENDET → Versandmitteilung mit
 * Tracking, STORNIERT → Stornobestätigung). Für Aufträge ohne Shop verschickt das ERP
 * diese Mail direkt; bei Shop-Aufträgen übernimmt das der Shop. Gibt null zurück, wenn
 * für den Status keine Kunden-Mail vorgesehen ist.
 */
export function buildTrackingEmail(input: TrackingEmailInput): BuiltEmail | null {
  const anrede = input.customerName ? `Hallo ${input.customerName},` : "Guten Tag,";
  if (input.status === "VERSENDET") {
    const carrier = input.carrier ? CARRIER_LABEL[input.carrier] : null;
    const lines = [
      anrede,
      "",
      `Ihr Auftrag ${input.orderNumber} wurde versendet.`,
    ];
    if (input.trackingNumber) {
      lines.push("", `Sendungsnummer${carrier ? ` (${carrier})` : ""}: ${input.trackingNumber}`);
      if (input.trackingUrl) lines.push(`Sendungsverfolgung: ${input.trackingUrl}`);
    }
    lines.push("", "Mit freundlichen Grüßen", "TEXMA Textilveredelung");
    return { subject: `Ihr Auftrag ${input.orderNumber} wurde versendet`, body: lines.join("\n") };
  }
  if (input.status === "STORNIERT") {
    return {
      subject: `Auftrag ${input.orderNumber} storniert`,
      body: [anrede, "", `Ihr Auftrag ${input.orderNumber} wurde storniert.`, "", "Mit freundlichen Grüßen", "TEXMA Textilveredelung"].join("\n"),
    };
  }
  return null;
}
