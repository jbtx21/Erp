// Auftrags-Prozesskette (TEXMA-Veredelungs-Workflow) für die Auftragsampel auf
// Auftragsebene: leitet aus den vorhandenen Vorgängen (Bestellung, Termin, Fremdvergabe,
// Wareneingang, Veredelung, Rücklauf, Faktura, Versand) den Fortschritt je Stufe ab.
// Reine, IO-freie Logik (Kap. 35). Routenabhängig: ohne Veredelung entfallen Veredler-Stufen.

import type { OrderStatus } from "./order.js";
import type { FulfillmentStatus } from "./fulfillment.js";
import type { OrderRoute } from "./workflow.js";

/** DONE = erledigt, AKTIV = aktueller Schritt, OFFEN = noch offen, NA = für diese Route ohne Belang. */
export type StageState = "DONE" | "AKTIV" | "OFFEN" | "NA";

export interface ProzessStage {
  key: string;
  label: string;
  state: StageState;
  hint: string;
}

export interface AuftragProzessFacts {
  status: OrderStatus;
  route: OrderRoute | null;
  terminSet: boolean;
  hasPurchaseOrder: boolean;
  hasGoodsReceipt: boolean;
  subCount: number;
  subBeigestellt: number; // Fremdvergabe-Stufen mit „Material versandt"
  subZurueck: number; // Fremdvergabe-Stufen mit gebuchtem Rücklauf
  fakturastatus: FulfillmentStatus;
  lieferstatus: FulfillmentStatus;
}

const ORDER_RANK: Record<OrderStatus, number> = {
  ANGELEGT: 0, IN_BEARBEITUNG: 1, IN_PRODUKTION: 2, VERSANDBEREIT: 3,
  VERSENDET: 4, FAKTURIERT: 5, ABGESCHLOSSEN: 6, STORNIERT: -1,
};

/** true, wenn der Auftragsstatus mindestens `target` erreicht hat (Storno zählt nie). */
function atLeast(status: OrderStatus, target: OrderStatus): boolean {
  return status !== "STORNIERT" && ORDER_RANK[status] >= ORDER_RANK[target];
}

const hasVeredelung = (route: OrderRoute | null): boolean => route !== "ROUTE1_KEINE";
const hasExtern = (route: OrderRoute | null): boolean => route === "ROUTE3_EXTERN" || route === "ROUTE4_EXTERN_INTERN";

const done = (b: boolean): "DONE" | "OFFEN" => (b ? "DONE" : "OFFEN");

/**
 * Baut die Prozess-Stufen eines Auftrags. Die erste nicht erledigte, nicht-NA-Stufe wird
 * als AKTIV markiert (aktueller Arbeitsschritt). Bei Storno ist die Kette gegenstandslos.
 */
export function computeAuftragProzess(f: AuftragProzessFacts): ProzessStage[] {
  const extern = hasExtern(f.route);
  const veredelung = hasVeredelung(f.route);
  const alleZurueck = f.subCount > 0 && f.subZurueck >= f.subCount;

  const raw: ProzessStage[] = [
    { key: "angelegt", label: "Auftrag angelegt", state: "DONE", hint: "Auftrag erfasst" },
    { key: "bestellt", label: "Ware bestellt", state: done(f.hasPurchaseOrder), hint: f.hasPurchaseOrder ? "Bestellung vorhanden" : "Noch keine Bestellung" },
    { key: "termin", label: "Termin gesetzt", state: done(f.terminSet), hint: f.terminSet ? "Liefertermin gesetzt" : "Kein Liefertermin" },
    { key: "veredler_auftrag", label: "Veredlerauftrag angelegt & versendet",
      state: extern ? done(f.subCount > 0) : "NA", hint: extern ? (f.subCount > 0 ? `${f.subCount} Fremdvergabe-Stufe(n)` : "Noch kein Veredlerauftrag") : "Keine externe Veredelung" },
    { key: "wareneingang", label: "Wareneingang", state: done(f.hasGoodsReceipt), hint: f.hasGoodsReceipt ? "Wareneingang gebucht" : "Kein Wareneingang" },
    { key: "veredelung", label: extern ? "Ware zu Veredler" : "Inhouse-Veredelung",
      state: veredelung ? (extern ? done(f.subBeigestellt > 0) : done(atLeast(f.status, "IN_PRODUKTION"))) : "NA",
      hint: !veredelung ? "Keine Veredelung (Route 1)" : extern ? (f.subBeigestellt > 0 ? "Material beigestellt" : "Material noch nicht beigestellt") : (atLeast(f.status, "IN_PRODUKTION") ? "In Produktion" : "Produktion nicht gestartet") },
    { key: "ruecklauf", label: "Rücklauf",
      state: veredelung ? (extern ? done(alleZurueck) : done(atLeast(f.status, "VERSANDBEREIT"))) : "NA",
      hint: !veredelung ? "Keine Veredelung" : extern ? (alleZurueck ? "Rücklauf vollständig" : `${f.subZurueck}/${f.subCount} zurück`) : (atLeast(f.status, "VERSANDBEREIT") ? "Veredelung fertig" : "Veredelung läuft") },
    { key: "qk", label: "Qualitätskontrolle", state: done(atLeast(f.status, "VERSANDBEREIT")), hint: atLeast(f.status, "VERSANDBEREIT") ? "Geprüft" : "Ausstehend" },
    { key: "versandfertig", label: "Versandfertig", state: done(atLeast(f.status, "VERSANDBEREIT")), hint: atLeast(f.status, "VERSANDBEREIT") ? "Bereit zum Versand" : "Noch nicht bereit" },
    { key: "fakturiert", label: "Fakturiert", state: done(f.fakturastatus === "VOLL" || atLeast(f.status, "FAKTURIERT")), hint: f.fakturastatus === "VOLL" ? "Rechnung erstellt" : "Noch nicht fakturiert" },
    { key: "versendet", label: "Versendet", state: done(f.lieferstatus === "VOLL" || atLeast(f.status, "VERSENDET")), hint: atLeast(f.status, "VERSENDET") ? "Versendet" : "Noch nicht versendet" },
  ];

  if (f.status === "STORNIERT") {
    return raw.map((s) => (s.key === "angelegt" ? s : { ...s, state: "OFFEN" as StageState, hint: "Auftrag storniert" }));
  }
  // Erste offene (nicht-NA) Stufe = aktueller Schritt.
  const firstOpen = raw.find((s) => s.state === "OFFEN");
  if (firstOpen) firstOpen.state = "AKTIV";
  return raw;
}
