import { describe, expect, it } from "vitest";
import { type AutomationRule, evaluateRule, getPath, matchConditions, renderRuleTemplate } from "./automation.js";

const rule: AutomationRule = {
  trigger: "order.status.changed",
  conditions: [{ field: "status", op: "eq", value: "VERSENDET" }],
  actions: [{ type: "notify", params: { to: "{{userEmail}}", title: "Auftrag {{number}} versendet", body: "Tracking: {{trackingNumber}}" } }],
};

describe("automation — Bedingungen", () => {
  it("getPath liest verschachtelte Werte", () => {
    expect(getPath({ a: { b: 7 } }, "a.b")).toBe(7);
    expect(getPath({ a: {} }, "a.x")).toBeUndefined();
  });
  it("matchConditions: alle Bedingungen müssen zutreffen (UND)", () => {
    const conds = [{ field: "status", op: "eq" as const, value: "OFFEN" }, { field: "openCents", op: "gt" as const, value: 0 }];
    expect(matchConditions(conds, { status: "OFFEN", openCents: 100 })).toBe(true);
    expect(matchConditions(conds, { status: "OFFEN", openCents: 0 })).toBe(false);
  });
  it("Operatoren in/contains", () => {
    expect(matchConditions([{ field: "s", op: "in", value: ["A", "B"] }], { s: "B" })).toBe(true);
    expect(matchConditions([{ field: "s", op: "contains", value: "abc" }], { s: "xxabcxx" })).toBe(true);
  });
});

describe("automation — Template + evaluate", () => {
  it("renderRuleTemplate ersetzt Platzhalter", () => {
    expect(renderRuleTemplate("Nr {{number}}", { number: "AB-1" })).toBe("Nr AB-1");
    expect(renderRuleTemplate("{{fehlt}}", {})).toBe("");
  });
  it("evaluateRule feuert nur bei passendem Trigger + Bedingung und löst Platzhalter auf", () => {
    const payload = { status: "VERSENDET", number: "AB-7", trackingNumber: "DPD123", userEmail: "a@texma-gmbh.de" };
    const actions = evaluateRule(rule, "order.status.changed", payload);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "notify", params: { to: "a@texma-gmbh.de", title: "Auftrag AB-7 versendet", body: "Tracking: DPD123" } });
  });
  it("feuert nicht bei falschem Trigger oder nicht erfüllter Bedingung", () => {
    expect(evaluateRule(rule, "other.event", {})).toHaveLength(0);
    expect(evaluateRule(rule, "order.status.changed", { status: "ANGELEGT" })).toHaveLength(0);
  });
});
