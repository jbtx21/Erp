// Gesetzliche Feiertage Baden-Württemberg (für die Werktage-Terminierung). Rein, IO-frei.
// Bewegliche Feiertage über die Oster-Berechnung (Anonymous Gregorian Algorithm).
// In BW gesetzlich: Neujahr, Heilige Drei Könige, Karfreitag, Ostermontag, Tag der
// Arbeit, Christi Himmelfahrt, Pfingstmontag, Fronleichnam, Tag der Deutschen Einheit,
// Allerheiligen, 1. + 2. Weihnachtstag.

const DAY_MS = 24 * 60 * 60 * 1000;
const isoKey = (d: Date): string => d.toISOString().slice(0, 10);
const addUtcDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY_MS);

/** Ostersonntag (gregorianisch, UTC) nach Meeus/Jones/Butcher. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = März, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Menge der BW-Feiertage eines Jahres als ISO-Datum (yyyy-mm-dd, UTC). */
export function bwHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const days = [
    new Date(Date.UTC(year, 0, 1)), // Neujahr
    new Date(Date.UTC(year, 0, 6)), // Heilige Drei Könige
    addUtcDays(easter, -2), // Karfreitag
    addUtcDays(easter, 1), // Ostermontag
    new Date(Date.UTC(year, 4, 1)), // Tag der Arbeit
    addUtcDays(easter, 39), // Christi Himmelfahrt
    addUtcDays(easter, 50), // Pfingstmontag
    addUtcDays(easter, 60), // Fronleichnam
    new Date(Date.UTC(year, 9, 3)), // Tag der Deutschen Einheit
    new Date(Date.UTC(year, 10, 1)), // Allerheiligen
    new Date(Date.UTC(year, 11, 25)), // 1. Weihnachtstag
    new Date(Date.UTC(year, 11, 26)), // 2. Weihnachtstag
  ];
  return new Set(days.map(isoKey));
}

const cache = new Map<number, Set<string>>();

/** true, wenn das Datum ein gesetzlicher Feiertag in Baden-Württemberg ist. */
export function isBwHoliday(d: Date): boolean {
  const y = d.getUTCFullYear();
  let set = cache.get(y);
  if (!set) {
    set = bwHolidays(y);
    cache.set(y, set);
  }
  return set.has(isoKey(d));
}
