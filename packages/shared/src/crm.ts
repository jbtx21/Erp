import { defineMachine } from "./statemachine.js";

// Vereinheitlichter CRM-Funnel (IA-Objekt-Merge): EINE Statusmaschine löst die drei
// früheren Backends Lead/Anfrage/Chance ab. Lineare Stufen + Verloren-Abzweig.
export type CrmStage = "NEU" | "KONTAKTIERT" | "QUALIFIZIERT" | "ANGEBOT" | "GEWONNEN" | "VERLOREN";

export const crmStageMachine = defineMachine<CrmStage>("CrmStage", {
  NEU: ["KONTAKTIERT", "QUALIFIZIERT", "VERLOREN"],
  KONTAKTIERT: ["QUALIFIZIERT", "VERLOREN"],
  QUALIFIZIERT: ["ANGEBOT", "VERLOREN"],
  ANGEBOT: ["GEWONNEN", "VERLOREN"],
  GEWONNEN: [],
  VERLOREN: [],
});

export class CrmError extends Error {
  constructor(m: string) { super(m); this.name = "CrmError"; }
}

/** Offen = noch im Funnel (nicht gewonnen/verloren). */
export function isCrmOpen(stage: CrmStage): boolean {
  return stage !== "GEWONNEN" && stage !== "VERLOREN";
}

/** Aus einer offenen Vor-Angebot-Stufe ist eine Angebotsüberführung möglich. */
export function canConvertCrmToQuote(stage: CrmStage): boolean {
  return stage === "NEU" || stage === "KONTAKTIERT" || stage === "QUALIFIZIERT";
}

export const CRM_STAGES: readonly CrmStage[] = ["NEU", "KONTAKTIERT", "QUALIFIZIERT", "ANGEBOT", "GEWONNEN", "VERLOREN"];
