// Anwendungsfall: ebenenübergreifende Terminübersicht / Ampel (Kap. 35.4). Bindet die
// reine `buildAmpelOverview`-Logik (@texma/shared) an die terminierten Vorgänge (Angebote
// mit Wiedervorlage, Produktionsaufträge mit Liefertermin). Ersetzt die Excel-Terminliste.
// Reine Lese-Analyse; Repository als Interface.

import {
  AMPEL_WORKLIST_COLUMNS,
  ampelWorklistRows,
  buildAmpelOverview,
  summarizeAmpel,
  type AmpelRow,
  type AmpelSummary,
  type TrackedProcess,
} from "@texma/shared";
import { renderReportPdf } from "../../pdf/report-pdf.js";
import type { ReportDocument } from "../reporting/report-document.js";

export interface AmpelRepository {
  /** Alle terminierten Vorgänge (Angebot/Auftrag/Produktion/Veredler). */
  trackedProcesses(): Promise<TrackedProcess[]>;
}

/** Tabellenmodell der Arbeitsliste (für CSV-Download in der UI). */
export interface AmpelWorklist {
  columns: string[];
  rows: string[][];
  generatedAt: Date;
}

export class AmpelService {
  constructor(private readonly repo: AmpelRepository) {}

  async overview(today: Date = new Date()): Promise<AmpelRow[]> {
    return buildAmpelOverview(await this.repo.trackedProcesses(), today);
  }

  /** Dashboard-Verdichtung der Ampel (Zählungen je Status/Ebene, Eskalation). */
  async summary(today: Date = new Date()): Promise<AmpelSummary> {
    return summarizeAmpel(buildAmpelOverview(await this.repo.trackedProcesses(), today));
  }

  /** Arbeitsliste als Tabellenmodell (Notbetrieb, K-17) — Basis für CSV-Download. */
  async worklist(today: Date = new Date()): Promise<AmpelWorklist> {
    const rows = await this.overview(today);
    return { columns: [...AMPEL_WORKLIST_COLUMNS], rows: ampelWorklistRows(rows), generatedAt: today };
  }

  /** Arbeitsliste als druckbares A4-PDF (Offline-Notbetrieb, K-17). */
  async worklistPdf(today: Date = new Date()): Promise<{ fileName: string; pdfBase64: string }> {
    const { columns, rows } = await this.worklist(today);
    const document: ReportDocument = {
      title: "Termin-Ampel — Arbeitsliste (Notbetrieb)",
      subtitle: `Stand ${today.toLocaleString("de-DE")} · ${rows.length} offene Vorgänge`,
      sections: [{ heading: "Offene Vorgänge (dringendste zuerst)", table: { columns, rows } }],
    };
    const bytes = await renderReportPdf(document);
    return { fileName: `termin-ampel-${today.toISOString().slice(0, 10)}.pdf`, pdfBase64: Buffer.from(bytes).toString("base64") };
  }
}
