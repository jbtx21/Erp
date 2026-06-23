// Schlanke, deklarative Automations-/Regel-Engine (Antwort auf den Xentral-Flow-Editor
// in „klein"): „Event → Bedingung → Aktion". IO-frei und testbar — die Ausführung der
// Aktionen (Benachrichtigung, Slack, Mail …) liegt in apps/api. Eine Regel feuert, wenn
// ihr Trigger zum Event passt und ALLE Bedingungen (UND-Verknüpfung) erfüllt sind.

export type ConditionOp = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";

export interface RuleCondition {
  field: string; // Pfad im Event-Payload, Punkt-Notation erlaubt (z. B. "order.status")
  op: ConditionOp;
  value: string | number | boolean | string[];
}

export interface RuleAction {
  type: string; // z. B. "notify" | "slack" | "email"
  params: Record<string, string>; // Werte dürfen {{platzhalter}} aus dem Payload enthalten
}

export interface AutomationRule {
  trigger: string; // Event-Typ, z. B. "order.status.changed"
  conditions: RuleCondition[];
  actions: RuleAction[];
}

/** Liest einen (ggf. verschachtelten) Wert per Punkt-Pfad aus dem Payload. */
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function compare(actual: unknown, op: ConditionOp, expected: RuleCondition["value"]): boolean {
  switch (op) {
    case "eq": return actual === expected;
    case "ne": return actual !== expected;
    case "gt": return typeof actual === "number" && actual > Number(expected);
    case "gte": return typeof actual === "number" && actual >= Number(expected);
    case "lt": return typeof actual === "number" && actual < Number(expected);
    case "lte": return typeof actual === "number" && actual <= Number(expected);
    case "contains": return typeof actual === "string" && actual.includes(String(expected));
    case "in": return Array.isArray(expected) && expected.map(String).includes(String(actual));
    default: return false;
  }
}

/** Prüft, ob ALLE Bedingungen auf den Payload zutreffen (leere Liste = immer wahr). */
export function matchConditions(conditions: readonly RuleCondition[], payload: unknown): boolean {
  return conditions.every((c) => compare(getPath(payload, c.field), c.op, c.value));
}

/** Ersetzt {{feld}}-Platzhalter im Text durch Werte aus dem Payload (Punkt-Pfad). */
export function renderRuleTemplate(template: string, payload: unknown): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const v = getPath(payload, path);
    return v === undefined || v === null ? "" : String(v);
  });
}

/**
 * Liefert die auszuführenden Aktionen einer Regel für ein Event (Platzhalter bereits
 * aufgelöst), oder eine leere Liste, wenn Trigger/Bedingungen nicht passen.
 */
export function evaluateRule(rule: AutomationRule, eventType: string, payload: unknown): RuleAction[] {
  if (rule.trigger !== eventType) return [];
  if (!matchConditions(rule.conditions, payload)) return [];
  return rule.actions.map((a) => ({
    type: a.type,
    params: Object.fromEntries(Object.entries(a.params).map(([k, v]) => [k, renderRuleTemplate(v, payload)])),
  }));
}
