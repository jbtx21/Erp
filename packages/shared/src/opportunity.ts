// Verkaufschancen / Pipeline (komplexes CRM): reine Forecast-/Pipeline-Logik.
// Gewichteter Forecast = Summe(Wert × Wahrscheinlichkeit) der OFFENEN Chancen.

export type OpportunityStage = "QUALIFIZIERUNG" | "ANGEBOT" | "VERHANDLUNG" | "ABSCHLUSS";
export type OpportunityStatus = "OFFEN" | "GEWONNEN" | "VERLOREN";

export const OPPORTUNITY_STAGES: ReadonlyArray<{ value: OpportunityStage; label: string; defaultProbability: number }> = [
  { value: "QUALIFIZIERUNG", label: "Qualifizierung", defaultProbability: 10 },
  { value: "ANGEBOT", label: "Angebot", defaultProbability: 40 },
  { value: "VERHANDLUNG", label: "Verhandlung", defaultProbability: 70 },
  { value: "ABSCHLUSS", label: "Abschluss", defaultProbability: 90 },
];

const BY_STAGE = new Map(OPPORTUNITY_STAGES.map((s) => [s.value, s]));

/** Standard-Abschlusswahrscheinlichkeit (%) einer Phase. */
export function defaultProbabilityForStage(stage: OpportunityStage): number {
  return BY_STAGE.get(stage)?.defaultProbability ?? 10;
}

export interface OpportunityLike {
  stage: OpportunityStage;
  status: OpportunityStatus;
  valueCents: number;
  probability: number;
}

/** Gewichteter Pipeline-Wert (Cent): nur OFFENE Chancen, Wert × Wahrscheinlichkeit/100. */
export function weightedForecast(opps: ReadonlyArray<OpportunityLike>): number {
  return opps
    .filter((o) => o.status === "OFFEN")
    .reduce((sum, o) => sum + Math.round((o.valueCents * clampPct(o.probability)) / 100), 0);
}

export interface StageBucket {
  stage: OpportunityStage;
  label: string;
  count: number;
  valueCents: number;
  weightedCents: number;
}

/** Pipeline je Phase (nur OFFENE): Anzahl, Bruttowert und gewichteter Wert. */
export function pipelineByStage(opps: ReadonlyArray<OpportunityLike>): StageBucket[] {
  return OPPORTUNITY_STAGES.map((s) => {
    const inStage = opps.filter((o) => o.status === "OFFEN" && o.stage === s.value);
    return {
      stage: s.value,
      label: s.label,
      count: inStage.length,
      valueCents: inStage.reduce((sum, o) => sum + o.valueCents, 0),
      weightedCents: inStage.reduce((sum, o) => sum + Math.round((o.valueCents * clampPct(o.probability)) / 100), 0),
    };
  });
}

function clampPct(p: number): number {
  return Math.max(0, Math.min(100, p));
}
