// Verknüpfte Belege („Connections", ERP-Grundfunktion): alle mit einem Auftrag
// verbundenen Dokumente auf einen Blick — Angebot, Produktionsauftrag, Lieferscheine,
// Rechnung, Reklamationen, Barverkäufe, Nachproduktionen. Read-only über die bestehende
// Belegkette (vorhandene FKs), keine Denormalisierung. Finanzbelege (Rechnung/Barverkauf)
// werden für Rollen ohne Finanzsicht ausgeblendet (RBAC, Kap. 12).

/** PDF-Generator-Kennung für den Direkt-Download eines Belegs (UI → print.*). */
export type DocPdfKind = "invoice" | "quote" | "auftragsbestaetigung" | "deliveryNote" | "creditNote" | "veredelungsauftrag" | "mahnung" | "sampleLoan";

export interface LinkRef {
  /** Belegtyp (Anzeigename), z. B. "Angebot", "Rechnung". */
  type: string;
  /** Kurzlabel, i. d. R. die Belegnummer/Status. */
  label: string;
  /** Ziel-Navigationsschlüssel der Web-UI (null = keine eigene Seite). */
  navKey: string | null;
  /** Finanzbeleg → für Rollen ohne Finanzsicht (PRODUKTION) ausblenden. */
  financial: boolean;
  /** Interne Beleg-ID (für Deep-Link/PDF/Archiv-Abgleich), falls vorhanden. */
  id?: string;
  /** PDF-Generator für den Direkt-Download (print.*), falls druckbar. */
  pdfKind?: DocPdfKind;
  /** Archiv-Quelle (sourceEntity) für den „Archiviert ✓"-Abgleich, falls archiviert. */
  sourceEntity?: string;
}

export interface OrderLinks {
  orderNumber: string;
  links: LinkRef[];
}

export interface LinksRepository {
  /** Verknüpfungen eines Auftrags; null, wenn der Auftrag nicht existiert. */
  orderLinks(orderId: string): Promise<OrderLinks | null>;
}

export class LinksError extends Error {}

export class LinksService {
  constructor(private readonly repo: LinksRepository) {}

  /** Belege zu einem Auftrag; ohne Finanzbelege, wenn `includeFinancials=false`. */
  async forOrder(orderId: string, includeFinancials = true): Promise<OrderLinks> {
    const res = await this.repo.orderLinks(orderId);
    if (!res) throw new LinksError(`Auftrag ${orderId} nicht gefunden.`);
    return {
      orderNumber: res.orderNumber,
      links: includeFinancials ? res.links : res.links.filter((l) => !l.financial),
    };
  }
}
