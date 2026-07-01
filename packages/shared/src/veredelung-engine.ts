// Veredelungs-Kalkulations-Engine (Kap. 4.4) — das Herzstück, reine IO-freie Domäne.
//
// EINE Quelle für den Veredelungspreis: VK = EK-je-Stück(Menge) × Aufschlag, plus optionale
// Einrichtung NUR unter einer Stückzahl-Schwelle (TEXMA: < 10 Teile). Die Engine ist
// methoden-AGNOSTISCH — Stick und Druck rechnen identisch; nur die HERKUNFT des EK unterscheidet
// sich (fließt außerhalb der Engine in die Staffel):
//   • STICK        → EK je Stück von der Stickerei gepflegt (wir haben keine eigene Maschine).
//   • SIEBDRUCK / TRANSFER / DIGITALDRUCK → feste, bekannte EKs mit Mengenstaffel.
// Dadurch bekommen Angebot, Auftrag, Nachkalkulation und Fremdvergabe denselben, konsistenten
// Veredelungs-VK aus einer Hand. Baut auf der gemeinsamen Stufenfunktion `selectStaffel` auf.
//
// Strangler (ADR 0003): startet hier in @texma/shared; Extraktion in ein eigenes Paket erst bei
// echtem Lastpfad. Geld immer in Cent (Int), kaufmännische Rundung via roundCents.

import { type Cents, roundCents } from "./money.js";
import { deckungsbeitrag, dbMarge, selectStaffel } from "./pricing.js";

/** Veredelungsart. Nur Metadatum für Anzeige/Routing — die Kalkulation ist identisch. */
export type VeredelungMethode = "STICK" | "SIEBDRUCK" | "TRANSFER" | "DIGITALDRUCK";

/** Eine EK-Staffelstufe: ab `minMenge` gilt `ekCents` je Stück. */
export interface EkStaffelStufe {
  minMenge: number;
  ekCents: Cents;
}

/** TEXMA-Standard: Einrichtung wird nur unter 10 Teilen berechnet. */
export const EINRICHTUNG_SCHWELLE_STUECK = 10;

/**
 * Einmalige Einrichtungskosten (Film/Sieb/Punch/Datei). Werden NUR berechnet, wenn die
 * Bestellmenge `< schwelleStueck` ist (Default 10). Ab der Schwelle: Einrichtung = 0.
 */
export interface EinrichtungConfig {
  /** Einrichtungs-EK (Cent), einmalig je Position/Auftrag. */
  ekCents: Cents;
  /** Schwelle in Stück; darunter fällt Einrichtung an. Default `EINRICHTUNG_SCHWELLE_STUECK`. */
  schwelleStueck?: number;
  /**
   * Wird die Einrichtung mit dem Aufschlag kalkuliert (VK = EK × factor) oder zum EK durchgereicht
   * (VK = EK)? Default: mit Aufschlag (konsistent zum Stück-VK). ANNAHME — bei Bedarf umstellbar.
   */
  mitAufschlag?: boolean;
}

export interface VeredelungKalkInput {
  methode: VeredelungMethode;
  /** EK je Stück gestaffelt nach Menge (Herkunft je Methode, s. Modulkopf). */
  ekStaffel: ReadonlyArray<EkStaffelStufe>;
  /** Bestellmenge (Stück). */
  menge: number;
  /** Aufschlagsfaktor auf den Stück-EK: VK = round(EK × factor). Muss > 0 sein. */
  factor: number;
  /** Optionale Einrichtung; fehlt/null ⇒ keine Einrichtung. */
  einrichtung?: EinrichtungConfig | null;
}

export interface VeredelungKalkErgebnis {
  methode: VeredelungMethode;
  menge: number;
  /** EK je Stück aus der Staffel (größte minMenge ≤ Menge). */
  ekStueckCents: Cents;
  /** VK je Stück = round(EK × factor). */
  vkStueckCents: Cents;
  /** Einrichtungs-EK (0, wenn Menge ≥ Schwelle oder keine Einrichtung gepflegt). */
  einrichtungEkCents: Cents;
  /** Einrichtungs-VK (0 oder round(EK × factor) bzw. EK, je nach `mitAufschlag`). */
  einrichtungVkCents: Cents;
  /** Gesamt-EK = Menge × Stück-EK + Einrichtungs-EK. */
  ekGesamtCents: Cents;
  /** Gesamt-VK = Menge × Stück-VK + Einrichtungs-VK. */
  vkGesamtCents: Cents;
  /** Deckungsbeitrag gesamt = Gesamt-VK − Gesamt-EK. */
  dbGesamtCents: Cents;
  /** DB-Marge auf den Gesamt-VK (0..1). */
  dbMargePct: number;
  /** True, wenn Einrichtung angefallen ist (Menge unter Schwelle). */
  einrichtungBerechnet: boolean;
}

/**
 * Kalkuliert VK/EK/DB einer Veredelung für eine konkrete Bestellmenge. Wirft bei ungültigen
 * Eingaben (Menge < 0, factor ≤ 0) oder wenn keine EK-Staffel für die Menge greift (Pflegefehler,
 * kein stilles Ausweichen — Kap. 3.2 / T-08).
 */
export function kalkuliereVeredelung(input: VeredelungKalkInput): VeredelungKalkErgebnis {
  if (input.menge < 0) throw new Error("Menge darf nicht negativ sein.");
  if (!(input.factor > 0)) throw new Error("Aufschlagsfaktor muss > 0 sein.");

  const stufe = selectStaffel(input.ekStaffel, input.menge);
  if (!stufe) {
    throw new Error(
      `Keine EK-Staffel für Menge ${input.menge} (Veredelung ${input.methode}) — Pflegefehler (T-08).`
    );
  }
  if (stufe.ekCents < 0) throw new Error("EK je Stück darf nicht negativ sein.");
  const ekStueckCents = stufe.ekCents;
  const vkStueckCents = roundCents(ekStueckCents * input.factor);

  // Einrichtung: einmalig, nur unter der Schwelle (TEXMA: < 10 Teile).
  if (input.einrichtung != null && input.einrichtung.ekCents < 0) {
    throw new Error("Einrichtungs-EK darf nicht negativ sein.");
  }
  const schwelle = input.einrichtung?.schwelleStueck ?? EINRICHTUNG_SCHWELLE_STUECK;
  const einrichtungBerechnet = input.einrichtung != null && input.menge < schwelle;
  const einrichtungEkCents = einrichtungBerechnet ? input.einrichtung!.ekCents : 0;
  const einrichtungMitAufschlag = input.einrichtung?.mitAufschlag ?? true;
  const einrichtungVkCents = einrichtungBerechnet
    ? einrichtungMitAufschlag
      ? roundCents(einrichtungEkCents * input.factor)
      : einrichtungEkCents
    : 0;

  const ekGesamtCents = input.menge * ekStueckCents + einrichtungEkCents;
  const vkGesamtCents = input.menge * vkStueckCents + einrichtungVkCents;

  return {
    methode: input.methode,
    menge: input.menge,
    ekStueckCents,
    vkStueckCents,
    einrichtungEkCents,
    einrichtungVkCents,
    ekGesamtCents,
    vkGesamtCents,
    dbGesamtCents: deckungsbeitrag(vkGesamtCents, ekGesamtCents),
    dbMargePct: dbMarge(vkGesamtCents, ekGesamtCents),
    einrichtungBerechnet,
  };
}
