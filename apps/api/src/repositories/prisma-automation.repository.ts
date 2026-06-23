// Prisma-Automation-Repo (Produktionspfad). conditions/actions liegen als JSON-Text.
import { prisma } from "@texma/db";
import type { RuleAction, RuleCondition } from "@texma/shared";
import type { AutomationRepository, AutomationRuleRow } from "../modules/automation/automation.service.js";

function parse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

function map(r: { id: string; name: string; triggerEvent: string; conditionsJson: string; actionsJson: string; active: boolean; lastFiredAt: Date | null }): AutomationRuleRow {
  return {
    id: r.id,
    name: r.name,
    triggerEvent: r.triggerEvent,
    conditions: parse<RuleCondition[]>(r.conditionsJson, []),
    actions: parse<RuleAction[]>(r.actionsJson, []),
    active: r.active,
    lastFiredAt: r.lastFiredAt,
  };
}

export class PrismaAutomationRepository implements AutomationRepository {
  async list(): Promise<AutomationRuleRow[]> {
    return (await prisma.automationRule.findMany({ orderBy: { createdAt: "desc" } })).map(map);
  }
  async activeForTrigger(triggerEvent: string): Promise<AutomationRuleRow[]> {
    return (await prisma.automationRule.findMany({ where: { triggerEvent, active: true } })).map(map);
  }
  async create(input: { name: string; triggerEvent: string; conditions: RuleCondition[]; actions: RuleAction[] }): Promise<{ id: string }> {
    return prisma.automationRule.create({
      data: { name: input.name, triggerEvent: input.triggerEvent, conditionsJson: JSON.stringify(input.conditions), actionsJson: JSON.stringify(input.actions) },
      select: { id: true },
    });
  }
  async setActive(id: string, active: boolean): Promise<void> {
    await prisma.automationRule.update({ where: { id }, data: { active } });
  }
  async remove(id: string): Promise<void> {
    await prisma.automationRule.deleteMany({ where: { id } });
  }
  async markFired(id: string, at: Date): Promise<void> {
    await prisma.automationRule.update({ where: { id }, data: { lastFiredAt: at } });
  }
}
