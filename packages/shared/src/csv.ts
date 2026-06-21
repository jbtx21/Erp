// CSV-Feld-Escaping nach RFC 4180: Felder mit Trennzeichen, Anführungszeichen oder
// Zeilenumbruch werden in "" gesetzt, innere " verdoppelt — verlustfrei. Eine
// gemeinsame Regel für alle CSV-Exporte (DSFinV-K, Offline-Bundle).

export function csvField(s: string): string {
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
