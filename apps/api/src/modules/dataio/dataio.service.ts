// Stammdaten-Im-/Export (Artikel, Kunden, Lieferanten) als CSV. Export liest die
// Stammdaten und serialisiert über die festen Spaltenlisten; Import parst + validiert
// (rein, @texma/shared) und upsertet je natürlichem Schlüssel (SKU/Name). Unbekannte/
// fehlerhafte Zeilen werden gezählt + gemeldet, nicht abgebrochen (robuster Migrations-Import).

import {
  ARTICLE_COLUMNS, COMPANY_COLUMNS, SUPPLIER_COLUMNS,
  csvToRecords, recordsToCsv,
  type ArticleImport, type CompanyImport, type SupplierImport, type RowError,
} from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export type EntityKind = "ARTICLE" | "COMPANY" | "SUPPLIER";

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: RowError[];
}

export interface DataIoRepository {
  listArticles(): Promise<ArticleImport[]>;
  upsertArticle(rec: ArticleImport): Promise<"created" | "updated">;
  listCompanies(): Promise<CompanyImport[]>;
  /** @returns "created"|"updated"|"skipped" (skipped = unbekannte Preisgruppe o. Ä.). */
  upsertCompany(rec: CompanyImport): Promise<"created" | "updated" | "skipped">;
  listSuppliers(): Promise<SupplierImport[]>;
  upsertSupplier(rec: SupplierImport): Promise<"created" | "updated">;
}

export class DataIoService {
  constructor(
    private readonly repo: DataIoRepository,
    private readonly audit: AuditSink
  ) {}

  async exportCsv(kind: EntityKind): Promise<string> {
    switch (kind) {
      case "ARTICLE": return recordsToCsv(ARTICLE_COLUMNS, await this.repo.listArticles());
      case "COMPANY": return recordsToCsv(COMPANY_COLUMNS, await this.repo.listCompanies());
      case "SUPPLIER": return recordsToCsv(SUPPLIER_COLUMNS, await this.repo.listSuppliers());
    }
  }

  async importCsv(kind: EntityKind, csv: string): Promise<ImportSummary> {
    const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] };
    const tally = (res: "created" | "updated" | "skipped"): void => {
      if (res === "created") summary.created++;
      else if (res === "updated") summary.updated++;
      else summary.skipped++;
    };

    if (kind === "ARTICLE") {
      const { records, errors } = csvToRecords(ARTICLE_COLUMNS, csv);
      summary.errors = errors;
      for (const rec of records) tally(await this.repo.upsertArticle(rec));
    } else if (kind === "COMPANY") {
      const { records, errors } = csvToRecords(COMPANY_COLUMNS, csv);
      summary.errors = errors;
      for (const rec of records) tally(await this.repo.upsertCompany(rec));
    } else {
      const { records, errors } = csvToRecords(SUPPLIER_COLUMNS, csv);
      summary.errors = errors;
      for (const rec of records) tally(await this.repo.upsertSupplier(rec));
    }

    await this.audit.append(buildEntry({
      entity: "DataImport", entityId: kind, action: "CREATE",
      after: { kind, created: summary.created, updated: summary.updated, skipped: summary.skipped, errorCount: summary.errors.length },
    }));
    return summary;
  }
}
