// Automations-/Regel-Engine (Event → Bedingung → Aktion). Verwaltet konfigurierbare
// Regeln und führt sie bei einem Event aus: passende aktive Regeln werden über die reine
// Logik (@texma/shared) ausgewertet; die resultierenden Aktionen laufen über injizierbare
// Handler (notify/slack/email …). Fehler einzelner Aktionen brechen das Event nicht ab.

import { type AutomationRule, type RuleAction, type RuleCondition, evaluateRule } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export class AutomationError extends Error {}

export interface AutomationRuleRow {
  id: string;
  name: string;
  triggerEvent: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  active: boolean;
  lastFiredAt: Date | null;
}

export interface AutomationRepository {
  list(): Promise<AutomationRuleRow[]>;
  activeForTrigger(triggerEvent: string): Promise<AutomationRuleRow[]>;
  create(input: { name: string; triggerEvent: string; conditions: RuleCondition[]; actions: RuleAction[] }): Promise<{ id: string }>;
  setActive(id: string, active: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  markFired(id: string, at: Date): Promise<void>;
}

/** Führt eine einzelne Aktion aus (z. B. In-App-Benachrichtigung, Slack). */
export type ActionHandler = (params: Record<string, string>) => Promise<void>;

export interface FiredAction {
  ruleId: string;
  type: string;
  params: Record<string, string>;
  ok: boolean;
  error?: string;
}

const KNOWN_TRIGGERS = [
  "order.status.changed",
  // Auftragsampel auf Auftragsebene: Prozessstufe gewechselt bzw. Ampel auf ROT (Eskalation).
  "order.stage.changed",
  "auftragsampel.red",
  "invoice.created",
  "invoice.credited",
  "lead.created",
  "openitem.overdue",
] as const;

export class AutomationService {
  constructor(
    private readonly repo: AutomationRepository,
    private readonly handlers: Record<string, ActionHandler>,
    private readonly audit: AuditSink,
    private readonly now: () => Date = () => new Date()
  ) {}

  knownTriggers(): readonly string[] { return KNOWN_TRIGGERS; }
  knownActions(): string[] { return Object.keys(this.handlers); }
  list(): Promise<AutomationRuleRow[]> { return this.repo.list(); }

  async create(input: { name: string; triggerEvent: string; conditions: RuleCondition[]; actions: RuleAction[] }): Promise<{ id: string }> {
    if (!input.name.trim()) throw new AutomationError("Name ist Pflicht.");
    if (!(KNOWN_TRIGGERS as readonly string[]).includes(input.triggerEvent)) throw new AutomationError(`Unbekannter Trigger „${input.triggerEvent}".`);
    for (const a of input.actions) {
      if (!this.handlers[a.type]) throw new AutomationError(`Unbekannte Aktion „${a.type}".`);
    }
    const res = await this.repo.create(input);
    await this.audit.append(buildEntry({ entity: "AutomationRule", entityId: res.id, action: "CREATE", after: { name: input.name, trigger: input.triggerEvent } }));
    return res;
  }

  async setActive(id: string, active: boolean): Promise<void> {
    await this.repo.setActive(id, active);
    await this.audit.append(buildEntry({ entity: "AutomationRule", entityId: id, action: "UPDATE", after: { active } }));
  }

  async remove(id: string): Promise<void> {
    await this.repo.remove(id);
    await this.audit.append(buildEntry({ entity: "AutomationRule", entityId: id, action: "UPDATE", after: { removed: true } }));
  }

  /**
   * Wird bei einem Geschäftsereignis aufgerufen: wertet alle aktiven Regeln des Triggers
   * aus und führt deren Aktionen aus. Robust — eine fehlschlagende Aktion stoppt die
   * anderen nicht.
   */
  async handleEvent(eventType: string, payload: Record<string, unknown>): Promise<FiredAction[]> {
    const rules = await this.repo.activeForTrigger(eventType);
    const fired: FiredAction[] = [];
    for (const r of rules) {
      const rule: AutomationRule = { trigger: r.triggerEvent, conditions: r.conditions, actions: r.actions };
      const actions = evaluateRule(rule, eventType, payload);
      if (actions.length === 0) continue;
      await this.repo.markFired(r.id, this.now());
      for (const a of actions) {
        const handler = this.handlers[a.type];
        if (!handler) { fired.push({ ruleId: r.id, type: a.type, params: a.params, ok: false, error: "kein Handler" }); continue; }
        try {
          await handler(a.params);
          fired.push({ ruleId: r.id, type: a.type, params: a.params, ok: true });
        } catch (e) {
          fired.push({ ruleId: r.id, type: a.type, params: a.params, ok: false, error: (e as Error).message });
        }
      }
    }
    return fired;
  }
}
