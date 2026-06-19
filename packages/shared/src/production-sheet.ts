// Produktionszettel — Kap. 5.1. Testfall T-11.
// Zwei Vorlagen: INTERN (DTF/Flex/Flock — Maschinenparameter) und EXTERN (Dienst-
// leister — Logo, Positionierung, Anliefer-/Fertigstellungstermin). Diese reine Logik
// validiert die Pflichtfelder und baut ein strukturiertes Inhaltsmodell (Abschnitte/
// Zeilen), das ein Renderer in ein druckbereites PDF umsetzt. IO-frei.

export type ProductionSheetKind = "INTERN" | "EXTERN";

export interface ProductionSheetInput {
  orderNumber: string;
  articleName: string;
  farbe: string;
  groesse: string;
  qty: number;
  logoLabel: string;
  // INTERN (Maschinenparameter)
  maschine?: string;
  temperaturC?: number;
  presszeitSek?: number;
  // EXTERN (Dienstleister)
  dienstleister?: string;
  positionierung?: string;
  anlieferDatum?: Date;
  fertigstellDatum?: Date;
}

export interface SheetRow {
  label: string;
  value: string;
}
export interface SheetSection {
  label: string;
  rows: SheetRow[];
}
export interface ProductionSheet {
  kind: ProductionSheetKind;
  title: string;
  sections: SheetSection[];
}

export class ProductionSheetIncompleteError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Produktionszettel unvollständig — fehlende Pflichtfelder: ${missing.join(", ")} (T-11).`);
    this.name = "ProductionSheetIncompleteError";
  }
}

function isBlank(v: string | undefined | null): boolean {
  return v == null || v.trim() === "";
}

/** Liefert die fehlenden Pflichtfelder (leer = vollständig). */
export function validateProductionSheet(
  input: ProductionSheetInput,
  kind: ProductionSheetKind
): string[] {
  const missing: string[] = [];
  if (isBlank(input.orderNumber)) missing.push("Auftragsnummer");
  if (isBlank(input.articleName)) missing.push("Artikel");
  if (isBlank(input.farbe)) missing.push("Farbe");
  if (isBlank(input.groesse)) missing.push("Größe");
  if (!(input.qty > 0)) missing.push("Menge");
  if (isBlank(input.logoLabel)) missing.push("Logo");

  if (kind === "INTERN") {
    if (isBlank(input.maschine)) missing.push("Maschine");
    if (input.temperaturC == null) missing.push("Temperatur");
    if (input.presszeitSek == null) missing.push("Presszeit");
  } else {
    if (isBlank(input.dienstleister)) missing.push("Dienstleister");
    if (isBlank(input.positionierung)) missing.push("Positionierung");
    if (input.anlieferDatum == null) missing.push("Anliefertermin");
    if (input.fertigstellDatum == null) missing.push("Fertigstellungstermin");
  }
  return missing;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Baut das Inhaltsmodell des Produktionszettels (T-11). Wirft, wenn Pflichtfelder
 * fehlen — so entsteht nie ein unvollständiger Zettel.
 */
export function buildProductionSheet(
  input: ProductionSheetInput,
  kind: ProductionSheetKind
): ProductionSheet {
  const missing = validateProductionSheet(input, kind);
  if (missing.length > 0) throw new ProductionSheetIncompleteError(missing);

  const sections: SheetSection[] = [
    {
      label: "Auftrag",
      rows: [
        { label: "Auftragsnummer", value: input.orderNumber },
        { label: "Artikel", value: input.articleName },
        { label: "Menge", value: String(input.qty) },
      ],
    },
    {
      label: "Artikel",
      rows: [
        { label: "Farbe", value: input.farbe },
        { label: "Größe", value: input.groesse },
      ],
    },
    { label: "Veredelung", rows: [{ label: "Logo", value: input.logoLabel }] },
  ];

  if (kind === "INTERN") {
    sections.push({
      label: "Maschinenparameter",
      rows: [
        { label: "Maschine", value: input.maschine as string },
        { label: "Temperatur", value: `${input.temperaturC} °C` },
        { label: "Presszeit", value: `${input.presszeitSek} s` },
      ],
    });
  } else {
    sections.push({
      label: "Dienstleister",
      rows: [
        { label: "Dienstleister", value: input.dienstleister as string },
        { label: "Positionierung", value: input.positionierung as string },
        { label: "Anliefertermin", value: isoDate(input.anlieferDatum as Date) },
        { label: "Fertigstellungstermin", value: isoDate(input.fertigstellDatum as Date) },
      ],
    });
  }

  return {
    kind,
    title: kind === "INTERN" ? "Produktionszettel (intern)" : "Produktionszettel (extern)",
    sections,
  };
}
