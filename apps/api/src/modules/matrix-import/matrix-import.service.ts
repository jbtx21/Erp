// Matrixprodukt-Stammdaten-Import (Säule B der Artikelanlage, Xentral-Vorbild): nimmt eine
// flache Lieferanten-CSV (Hauptartikel + Farbe + Größe + optional EK/Lieferanten-SKU) und legt
// daraus Hauptartikel (falls neu) und das Farbe×Größe-Raster an. Zweistufig: `preview`
// (Abgleichplan Neu/Vorhanden, schreibt nichts) → `apply` (idempotent über generateMatrixVariants).
// Optional wird je Zeile mit EK ein SupplierItem für EINEN gewählten Lieferanten verknüpft.
//
// Bewusst wiederverwendet: dieselbe SKU-/Idempotenz-Logik wie der Matrix-Editor am Artikel
// (ProductRepository.generateMatrixVariants) — keine zweite SKU-Bildung. EK-Varianten werden
// nicht über die (im Preview geschätzte) SKU, sondern über die Farbe×Größe-Kombination
// aufgelöst, damit Achswert-Suffixe aus dem Stamm nicht zu Fehlzuordnungen führen.

import { planMatrixImport, type MatrixImportPlan } from "@texma/shared";
import { buildEntry, type AuditSink } from "@texma/audit";

export interface MatrixImportRepository {
  /** Vorhandene Hauptartikel-SKUs (für den Abgleich). */
  listArticleSkus(): Promise<string[]>;
  /** Vorhandene Varianten als `sku|farbe|größe` (für den Abgleich). */
  listVariantCombos(): Promise<string[]>;
  findArticleBySku(sku: string): Promise<{ id: string } | null>;
  createArticle(sku: string, name: string): Promise<{ id: string }>;
  /** Idempotentes Farbe×Größe-Raster (vorhandene Kombis übersprungen). */
  generateMatrixVariants(articleId: string, combos: ReadonlyArray<{ farbe: string; groesse: string }>): Promise<{ created: number; skipped: number; createdSkus: string[] }>;
  /** Variante eines Artikels über die Farbe×Größe-Kombination auflösen (für EK-Zuordnung). */
  findVariantIdByCombo(articleId: string, farbe: string, groesse: string): Promise<string | null>;
  upsertSupplierItem(supplierId: string, variantId: string, ekCents: number, supplierSku: string | null): Promise<void>;
  supplierExists(id: string): Promise<boolean>;
}

export interface MatrixApplyOptions {
  /** EK-Preis + Lieferantenzuordnung je Zeile mit EK schreiben (ein Lieferant für den Import). */
  ek?: { supplierId: string };
}

export interface MatrixApplySummary {
  articlesCreated: number;
  variantsCreated: number;
  variantsSkipped: number;
  ekLinked: number;
  errors: { row: number; message: string }[];
}

export class MatrixImportError extends Error {}

export class MatrixImportService {
  constructor(private readonly repo: MatrixImportRepository, private readonly audit: AuditSink) {}

  /** Vorschau: parst die Liste und gleicht gegen den Bestand ab — schreibt nichts. */
  async preview(csv: string): Promise<MatrixImportPlan> {
    const [articleSkus, variantCombos] = await Promise.all([this.repo.listArticleSkus(), this.repo.listVariantCombos()]);
    return planMatrixImport(csv, { articleSkus, variantCombos });
  }

  /** Wendet die Liste an (Artikel + Matrix-Varianten anlegen, optional EK verknüpfen). */
  async apply(csv: string, options: MatrixApplyOptions = {}): Promise<MatrixApplySummary> {
    if (options.ek && !(await this.repo.supplierExists(options.ek.supplierId))) {
      throw new MatrixImportError("Lieferant für die EK-Zuordnung nicht gefunden.");
    }
    const plan = await this.preview(csv);
    const summary: MatrixApplySummary = { articlesCreated: 0, variantsCreated: 0, variantsSkipped: 0, ekLinked: 0, errors: [...plan.errors] };

    // Zeilen je Hauptartikel bündeln (Reihenfolge der ersten Sichtung bewahren).
    const byArticle = new Map<string, { name: string; rows: typeof plan.rows }>();
    for (const r of plan.rows) {
      const key = r.sku;
      const g = byArticle.get(key);
      if (g) { if (!g.name && r.name) g.name = r.name; g.rows.push(r); }
      else byArticle.set(key, { name: r.name, rows: [r] });
    }

    for (const [sku, group] of byArticle) {
      // Artikel auflösen/anlegen.
      let article = await this.repo.findArticleBySku(sku);
      if (!article) {
        article = await this.repo.createArticle(sku, group.name || sku);
        summary.articlesCreated += 1;
      }
      // Eindeutige Farbe×Größe-Kombinationen dieses Artikels (Duplikate/Vorhandene egal — idempotent).
      const seen = new Set<string>();
      const combos: Array<{ farbe: string; groesse: string }> = [];
      for (const r of group.rows) {
        const k = `${r.farbe.toLowerCase()}|${r.groesse.toLowerCase()}`;
        if (!seen.has(k)) { seen.add(k); combos.push({ farbe: r.farbe, groesse: r.groesse }); }
      }
      const res = await this.repo.generateMatrixVariants(article.id, combos);
      summary.variantsCreated += res.created;
      summary.variantsSkipped += res.skipped;

      // EK + Lieferantenzuordnung je Zeile mit EK (über Farbe×Größe robust aufgelöst).
      if (options.ek) {
        for (const r of group.rows) {
          if (r.ekCents === null) continue;
          const variantId = await this.repo.findVariantIdByCombo(article.id, r.farbe, r.groesse);
          if (!variantId) { summary.errors.push({ row: r.row, message: "Variante für EK-Zuordnung nicht gefunden." }); continue; }
          await this.repo.upsertSupplierItem(options.ek.supplierId, variantId, r.ekCents, r.supplierSku);
          summary.ekLinked += 1;
        }
      }
    }

    summary.errors.sort((a, b) => a.row - b.row);
    await this.audit.append(buildEntry({
      entity: "MatrixImport", entityId: "apply", action: "CREATE",
      after: {
        articlesCreated: summary.articlesCreated, variantsCreated: summary.variantsCreated,
        variantsSkipped: summary.variantsSkipped, ekLinked: summary.ekLinked,
        errorCount: summary.errors.length, ek: options.ek?.supplierId ?? null,
      },
    }));
    return summary;
  }
}
