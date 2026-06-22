// In-Memory-Stammdaten für Im-/Export-Tests.

import type { ArticleImport, CompanyImport, SupplierImport } from "@texma/shared";
import type { DataIoRepository } from "../modules/dataio/dataio.service.js";

export class InMemoryDataIoRepository implements DataIoRepository {
  articles: ArticleImport[] = [];
  companies: CompanyImport[] = [];
  suppliers: SupplierImport[] = [];
  /** Bekannte Preisgruppen (für Company-Import). */
  priceGroups = new Set<string>(["STANDARD", "WIEDERVERKAEUFER"]);

  async listArticles(): Promise<ArticleImport[]> { return this.articles; }
  async upsertArticle(rec: ArticleImport): Promise<"created" | "updated"> {
    const i = this.articles.findIndex((a) => a.sku === rec.sku);
    if (i >= 0) { this.articles[i] = rec; return "updated"; }
    this.articles.push(rec); return "created";
  }
  async listCompanies(): Promise<CompanyImport[]> { return this.companies; }
  async upsertCompany(rec: CompanyImport): Promise<"created" | "updated" | "skipped"> {
    if (rec.priceGroupKind && !this.priceGroups.has(rec.priceGroupKind.toUpperCase())) return "skipped";
    const i = this.companies.findIndex((c) => c.name === rec.name);
    if (i >= 0) { this.companies[i] = rec; return "updated"; }
    this.companies.push(rec); return "created";
  }
  async listSuppliers(): Promise<SupplierImport[]> { return this.suppliers; }
  async upsertSupplier(rec: SupplierImport): Promise<"created" | "updated"> {
    const i = this.suppliers.findIndex((s) => s.name === rec.name);
    if (i >= 0) { this.suppliers[i] = rec; return "updated"; }
    this.suppliers.push(rec); return "created";
  }
}
