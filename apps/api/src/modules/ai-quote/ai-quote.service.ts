// KI-Freitexterfassung Anfrage→Angebot (B14, Kap. 22.2). Freitext → strukturierter
// Entwurf (LLM hinter Port) → Validierung gegen Varianten/Preise (@texma/shared).
// MENSCH-FREIGABE ist Pflicht: dieser Service liefert NUR einen Entwurf und erzeugt
// niemals ein verbindliches Angebot — die Freigabe läuft über den QuoteService.

import {
  resolveDraft,
  type CatalogEntry,
  type ExtractedQuoteDraft,
  type ValidatedDraft,
} from "@texma/shared";

/**
 * Port zur LLM-Extraktion. Im Betrieb ein Connector gegen die Claude-API
 * (Modell `claude-opus-4-...`, jüngstes Opus) mit strenger Tool-/JSON-Ausgabe; im
 * Test ein deterministischer Stub.
 */
export interface LlmExtractor {
  extract(text: string): Promise<ExtractedQuoteDraft>;
}

export interface CatalogRepository {
  /** Verkaufsfähige Varianten mit Listenpreis (Standard-Preisgruppe). */
  catalog(): Promise<CatalogEntry[]>;
}

export class AiQuoteDraftService {
  constructor(
    private readonly extractor: LlmExtractor,
    private readonly repo: CatalogRepository
  ) {}

  /**
   * Erzeugt aus Freitext einen VALIDIERTEN Entwurf. `requiresApproval` ist immer
   * true; nicht zuordenbare Zeilen sind markiert und müssen manuell geklärt werden.
   */
  async draftFromText(text: string): Promise<ValidatedDraft> {
    if (!text || text.trim().length === 0) {
      throw new Error("Freitext ist leer");
    }
    const extracted = await this.extractor.extract(text);
    return resolveDraft(extracted, await this.repo.catalog());
  }
}

/**
 * Stub-Extractor für Tests/Dev: zerlegt Zeilen der Form "<menge>x <beschreibung>".
 * Ersetzt im Betrieb den echten Claude-API-Connector (gleicher Port).
 */
export class StubLlmExtractor implements LlmExtractor {
  async extract(text: string): Promise<ExtractedQuoteDraft> {
    const lines = text
      .split(/\n|,/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => {
        const m = /^(\d+)\s*x\s*(.+)$/i.exec(l);
        return m ? { query: m[2]!.trim(), qty: Number(m[1]) } : { query: l, qty: 1 };
      });
    return { lines };
  }
}
