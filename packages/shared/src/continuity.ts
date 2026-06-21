// Notbetrieb & Resilienz (B17, K-17, Kap. 27). Reine Logik für das Tages-Offline-
// Bundle (Modus A): bei Internet-Ausfall am Standort arbeitet die Produktion mit den
// hier zusammengestellten offenen Aufträgen weiter (Produktionszettel-Basisdaten als
// druck-/CSV-fähiges Bündel). Die Vollständigkeit prüft nur die Basis-Pflichtfelder —
// Maschinenparameter trägt die Produktion vor Ort nach.

import {
  validateProductionBase,
  type ProductionBaseFields,
} from "./production-sheet.js";

export type OfflineBundleOrder = ProductionBaseFields;

export interface OfflineBundleItem {
  orderNumber: string;
  complete: boolean;
  missing: string[];
}

export interface OfflineBundle {
  generatedAt: Date;
  items: OfflineBundleItem[];
  /** Alle Aufträge offline-tauglich (Basisfelder vollständig)? */
  complete: boolean;
  /** Auftragsnummern mit fehlenden Pflichtfeldern. */
  incomplete: string[];
}

/** Baut das Offline-Bundle der offenen Aufträge (Modus A). */
export function buildOfflineBundle(
  orders: ReadonlyArray<OfflineBundleOrder>,
  generatedAt: Date = new Date()
): OfflineBundle {
  const items: OfflineBundleItem[] = orders.map((o) => {
    const missing = validateProductionBase(o);
    return { orderNumber: o.orderNumber, complete: missing.length === 0, missing };
  });
  const incomplete = items.filter((i) => !i.complete).map((i) => i.orderNumber);
  return { generatedAt, items, complete: incomplete.length === 0, incomplete };
}

const csvCell = (s: string): string => s.replace(/;/g, ",");

/** Flache CSV des Bundles für Druck/Tabelle ohne System. */
export function offlineBundleCsv(bundle: OfflineBundle): string {
  const header = "Auftrag;Vollstaendig;Fehlend";
  const rows = bundle.items.map(
    (i) => `${csvCell(i.orderNumber)};${i.complete ? "ja" : "nein"};${csvCell(i.missing.join("/"))}`
  );
  return [header, ...rows].join("\n");
}
