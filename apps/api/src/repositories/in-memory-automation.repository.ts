// In-Memory-Automation-Repo für Tests.
import type { RuleAction, RuleCondition } from "@texma/shared";
import type { AutomationRepository, AutomationRuleRow } from "../modules/automation/automation.service.js";

export class InMemoryAutomationRepository implements AutomationRepository {
  private seq = 0;
  private readonly rules: AutomationRuleRow[] = [];

  async list(): Promise<AutomationRuleRow[]> {
    return [...this.rules];
  }
  async activeForTrigger(triggerEvent: string): Promise<AutomationRuleRow[]> {
    return this.rules.filter((r) => r.active && r.triggerEvent === triggerEvent);
  }
  async create(input: { name: string; triggerEvent: string; conditions: RuleCondition[]; actions: RuleAction[] }): Promise<{ id: string }> {
    const id = `rule_${String(++this.seq)}`;
    this.rules.push({ id, name: input.name, triggerEvent: input.triggerEvent, conditions: input.conditions, actions: input.actions, active: true, lastFiredAt: null });
    return { id };
  }
  async setActive(id: string, active: boolean): Promise<void> {
    const r = this.rules.find((x) => x.id === id);
    if (r) r.active = active;
  }
  async remove(id: string): Promise<void> {
    const i = this.rules.findIndex((x) => x.id === id);
    if (i >= 0) this.rules.splice(i, 1);
  }
  async markFired(id: string, at: Date): Promise<void> {
    const r = this.rules.find((x) => x.id === id);
    if (r) r.lastFiredAt = at;
  }
}
