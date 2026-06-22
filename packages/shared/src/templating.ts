// Platzhalter-Rendering für E-Mail-/Text-Vorlagen (ERP-Grundfunktion / G-5). Ersetzt
// {{ schluessel }} durch Werte; unbekannte Platzhalter bleiben sichtbar stehen (kein
// stilles Verschlucken → Pflegefehler fallen auf). Rein und IO-frei.

export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
}

/** Liefert die im Template referenzierten Platzhalter-Schlüssel (für die Pflege/Validierung). */
export function templatePlaceholders(template: string): string[] {
  const keys = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) keys.add(m[1]!);
  return [...keys];
}
