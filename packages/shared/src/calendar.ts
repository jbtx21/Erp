// Büro-Kalender (Terminmanagement): reine Hilfslogik. Validierung des Zeitraums und
// Überschneidung mit einem Anzeigefenster. IO-frei.

export type CalendarEventKind = "TERMIN" | "URLAUB" | "ABWESENHEIT" | "SONSTIGES" | "AUFGABE";

// Vom Nutzer manuell wählbare Arten (AUFGABE wird nur aus Aufgaben-Fälligkeiten abgeleitet).
export const CALENDAR_KINDS: ReadonlyArray<{ value: CalendarEventKind; label: string }> = [
  { value: "TERMIN", label: "Termin" },
  { value: "URLAUB", label: "Urlaub" },
  { value: "ABWESENHEIT", label: "Abwesenheit" },
  { value: "SONSTIGES", label: "Sonstiges" },
];

export const CALENDAR_KIND_LABEL: Record<CalendarEventKind, string> = {
  TERMIN: "Termin", URLAUB: "Urlaub", ABWESENHEIT: "Abwesenheit", SONSTIGES: "Sonstiges", AUFGABE: "Aufgabe",
};

export class CalendarRangeError extends Error {}

/** Stellt sicher, dass das Ende nicht vor dem Beginn liegt. */
export function assertEventRange(start: Date, end: Date): void {
  if (end.getTime() < start.getTime()) throw new CalendarRangeError("Ende darf nicht vor dem Beginn liegen.");
}

/** Überschneidet sich [start,end] mit dem Fenster [from,to]? (Halboffen-tolerant.) */
export function overlapsWindow(start: Date, end: Date, from: Date, to: Date): boolean {
  return start.getTime() <= to.getTime() && end.getTime() >= from.getTime();
}
