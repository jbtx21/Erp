// Globale Suche (ERP-Grundfunktion / G-6). Eine entitätsübergreifende Suche über die
// Kern-Stammdaten/Belege; liefert einheitliche Treffer mit Navigationsziel (navKey).
// Reine Orchestrierung — die Feldsuche liegt im Repository.

export interface SearchHit {
  entity: string; // "Firma" | "Lieferant" | "Auftrag" | "Artikel" | "Lead"
  id: string;
  label: string;
  sub: string | null; // Zusatzinfo (z. B. Nummer, E-Mail)
  navKey: string; // Web-Navigationsschlüssel des Moduls
}

export interface SearchRepository {
  search(query: string, limit: number): Promise<SearchHit[]>;
}

export class SearchService {
  constructor(private readonly repo: SearchRepository) {}

  /** Globale Suche; ab 2 Zeichen, sonst leer (kein Volldurchlauf bei einem Buchstaben). */
  async global(query: string, limit = 20): Promise<SearchHit[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    return this.repo.search(q, limit);
  }
}
