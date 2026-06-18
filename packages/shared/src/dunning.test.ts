import { describe, expect, it } from "vitest";
import { computeDunning, daysOverdue, type DunnableItem } from "./dunning.js";

const today = new Date("2026-06-18T00:00:00Z");
const due = (offsetDays: number) =>
  new Date(today.getTime() - offsetDays * 24 * 60 * 60 * 1000);

describe("Mahnwesen (T-14)", () => {
  it("erzeugt Stufe 1 für einen frisch überfälligen Posten", () => {
    const items: DunnableItem[] = [
      { id: "oi-1", openCents: 10000, dueDate: due(1), dunningLevel: 0, mahnsperre: false },
    ];
    const { proposals } = computeDunning(items, today);
    expect(proposals).toEqual([
      { itemId: "oi-1", fromLevel: 0, toLevel: 1, daysOverdue: 1 },
    ]);
  });

  it("respektiert die Mahnsperre", () => {
    const items: DunnableItem[] = [
      { id: "oi-1", openCents: 10000, dueDate: due(30), dunningLevel: 0, mahnsperre: true },
    ];
    const { proposals, blocked } = computeDunning(items, today);
    expect(proposals).toHaveLength(0);
    expect(blocked).toEqual(["oi-1"]);
  });

  it("erhöht pro Lauf nur um eine Stufe", () => {
    // 30 Tage überfällig → Zielstufe 3, aber aktuelle Stufe 0 → Vorschlag nur Stufe 1
    const items: DunnableItem[] = [
      { id: "oi-1", openCents: 10000, dueDate: due(30), dunningLevel: 0, mahnsperre: false },
    ];
    expect(computeDunning(items, today).proposals[0]?.toLevel).toBe(1);
  });

  it("mahnt nicht erneut, wenn die fällige Stufe schon erreicht ist", () => {
    const items: DunnableItem[] = [
      { id: "oi-1", openCents: 10000, dueDate: due(5), dunningLevel: 1, mahnsperre: false },
    ];
    expect(computeDunning(items, today).proposals).toHaveLength(0);
  });

  it("ignoriert bezahlte Posten", () => {
    const items: DunnableItem[] = [
      { id: "oi-1", openCents: 0, dueDate: due(30), dunningLevel: 0, mahnsperre: false },
    ];
    expect(computeDunning(items, today).proposals).toHaveLength(0);
  });

  it("daysOverdue rechnet ganze Tage", () => {
    expect(daysOverdue(due(14), today)).toBe(14);
  });
});
