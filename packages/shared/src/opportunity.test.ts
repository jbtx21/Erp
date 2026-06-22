import { describe, expect, it } from "vitest";
import { defaultProbabilityForStage, pipelineByStage, weightedForecast, type OpportunityLike } from "./opportunity.js";

const o = (over: Partial<OpportunityLike>): OpportunityLike => ({ stage: "ANGEBOT", status: "OFFEN", valueCents: 100000, probability: 40, ...over });

describe("Opportunity-Pipeline / Forecast", () => {
  it("Standardwahrscheinlichkeit je Phase", () => {
    expect(defaultProbabilityForStage("QUALIFIZIERUNG")).toBe(10);
    expect(defaultProbabilityForStage("ABSCHLUSS")).toBe(90);
  });
  it("gewichteter Forecast nur über offene Chancen", () => {
    const f = weightedForecast([
      o({ valueCents: 100000, probability: 40 }), // 40000
      o({ valueCents: 200000, probability: 70 }), // 140000
      o({ status: "GEWONNEN", valueCents: 999999, probability: 100 }), // ignoriert
    ]);
    expect(f).toBe(180000);
  });
  it("Pipeline je Phase summiert Anzahl/Wert/gewichtet", () => {
    const buckets = pipelineByStage([
      o({ stage: "ANGEBOT", valueCents: 100000, probability: 40 }),
      o({ stage: "ANGEBOT", valueCents: 100000, probability: 40 }),
      o({ stage: "VERHANDLUNG", valueCents: 100000, probability: 70 }),
    ]);
    const angebot = buckets.find((b) => b.stage === "ANGEBOT")!;
    expect(angebot.count).toBe(2);
    expect(angebot.valueCents).toBe(200000);
    expect(angebot.weightedCents).toBe(80000);
  });
});
