// Prisma-Stammdaten für den CSV-Im-/Export. Upsert über den natürlichen Schlüssel:
// Artikel = SKU (unique), Kunde/Lieferant = Name (per findFirst, da nicht unique).

import { prisma } from "@texma/db";
import { parseEuroInput, type ArticleImport, type CompanyImport, type SupplierImport } from "@texma/shared";

/** Cent → de-DE-Dezimalstring ohne Symbol für den CSV-Export ("4,50"). */
const centsToEuroStr = (cents: number): string => (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
import type { DataIoRepository } from "../modules/dataio/dataio.service.js";

export class PrismaDataIoRepository implements DataIoRepository {
  // ── Artikel ──
  async listArticles(): Promise<ArticleImport[]> {
    const rows = await prisma.article.findMany({ orderBy: { sku: "asc" } });
    return rows.map((a) => ({
      sku: a.sku, name: a.name, description: a.description ?? "", ekCents: centsToEuroStr(a.ekCents), vkCents: centsToEuroStr(a.vkCents), brand: a.brand ?? "",
      materialComposition: a.materialComposition ?? "", careInstructions: a.careInstructions ?? "",
      hsCode: a.hsCode ?? "", originCountry: a.originCountry ?? "",
    }));
  }
  async upsertArticle(rec: ArticleImport): Promise<"created" | "updated"> {
    const exists = await prisma.article.findUnique({ where: { sku: rec.sku }, select: { id: true } });
    // Pflichtfelder hart (überall): Beschreibung + EK/VK müssen geliefert werden (Import sonst Fehler).
    const description = rec.description?.trim();
    if (!description) throw new Error(`Artikel ${rec.sku}: Beschreibung ist Pflicht.`);
    const ekEur = parseEuroInput(rec.ekCents);
    const vkEur = parseEuroInput(rec.vkCents);
    if (ekEur == null || vkEur == null) throw new Error(`Artikel ${rec.sku}: EK und VK sind Pflicht (gültiger Betrag).`);
    const ekCents = Math.round(ekEur * 100);
    const vkCents = Math.round(vkEur * 100);
    const data = {
      name: rec.name, description, brand: rec.brand || null,
      materialComposition: rec.materialComposition || null, careInstructions: rec.careInstructions || null,
      hsCode: rec.hsCode || null, originCountry: rec.originCountry || null,
    };
    await prisma.article.upsert({ where: { sku: rec.sku }, update: { ...data, ekCents, vkCents }, create: { sku: rec.sku, ...data, ekCents, vkCents } });
    return exists ? "updated" : "created";
  }

  // ── Kunden ──
  async listCompanies(): Promise<CompanyImport[]> {
    const rows = await prisma.company.findMany({ orderBy: { name: "asc" }, include: { priceGroup: { select: { kind: true } } } });
    return rows.map((c) => ({
      name: c.name, branche: c.branche ?? "",
      zahlungszielTage: String(c.zahlungszielTage), priceGroupKind: c.priceGroup.kind,
    }));
  }
  async upsertCompany(rec: CompanyImport): Promise<"created" | "updated" | "skipped"> {
    const kind = (rec.priceGroupKind || "STANDARD").toUpperCase();
    const pg = await prisma.priceGroup.findUnique({ where: { kind: kind as never }, select: { id: true } });
    if (!pg) return "skipped"; // unbekannte Preisgruppe → kein Phantom-Datensatz
    const ziel = Number.parseInt(rec.zahlungszielTage, 10);
    const data = {
      branche: rec.branche || null,
      zahlungszielTage: Number.isFinite(ziel) ? ziel : 14,
      priceGroupId: pg.id,
    };
    const existing = await prisma.company.findFirst({ where: { name: rec.name }, select: { id: true } });
    if (existing) { await prisma.company.update({ where: { id: existing.id }, data }); return "updated"; }
    await prisma.company.create({ data: { name: rec.name, ...data } });
    return "created";
  }

  // ── Lieferanten ──
  async listSuppliers(): Promise<SupplierImport[]> {
    const rows = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
    return rows.map((s) => ({ name: s.name, vatId: s.vatId ?? "", iban: s.iban ?? "", bic: s.bic ?? "" }));
  }
  async upsertSupplier(rec: SupplierImport): Promise<"created" | "updated"> {
    const data = { vatId: rec.vatId || null, iban: rec.iban || null, bic: rec.bic || null };
    const existing = await prisma.supplier.findFirst({ where: { name: rec.name }, select: { id: true } });
    if (existing) { await prisma.supplier.update({ where: { id: existing.id }, data }); return "updated"; }
    await prisma.supplier.create({ data: { name: rec.name, ...data } });
    return "created";
  }
}
