import { describe, expect, it } from "vitest";
import { crmStageMachine, canConvertCrmToQuote, isCrmOpen, CRM_STAGES } from "./crm.js";

describe("crmStageMachine (vereinheitlichter Funnel)", () => {
  it("erlaubt den linearen Funnel + Verloren-Abzweig", () => {
    expect(crmStageMachine.can("NEU", "KONTAKTIERT")).toBe(true);
    expect(crmStageMachine.can("QUALIFIZIERT", "ANGEBOT")).toBe(true);
    expect(crmStageMachine.can("ANGEBOT", "GEWONNEN")).toBe(true);
    expect(crmStageMachine.can("NEU", "VERLOREN")).toBe(true);
  });
  it("verbietet Sprünge + Endzustände", () => {
    expect(crmStageMachine.can("NEU", "ANGEBOT")).toBe(false);
    expect(crmStageMachine.can("GEWONNEN", "ANGEBOT")).toBe(false);
    expect(crmStageMachine.next("VERLOREN")).toEqual([]);
  });
  it("konvertierbar nur aus offenen Vor-Angebot-Stufen", () => {
    expect(canConvertCrmToQuote("QUALIFIZIERT")).toBe(true);
    expect(canConvertCrmToQuote("NEU")).toBe(true);
    expect(canConvertCrmToQuote("ANGEBOT")).toBe(false);
    expect(canConvertCrmToQuote("GEWONNEN")).toBe(false);
  });
  it("isCrmOpen", () => {
    expect(isCrmOpen("QUALIFIZIERT")).toBe(true);
    expect(isCrmOpen("GEWONNEN")).toBe(false);
    expect(CRM_STAGES).toHaveLength(6);
  });
});
