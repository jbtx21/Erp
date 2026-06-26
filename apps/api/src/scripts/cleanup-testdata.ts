// Einmaliges Aufräumen von Testdaten-Resten aus früheren Funktionstests:
// das fehlerhafte Angebot AN-2026-0005 und die Veredelungs-Test-Artikel
// STICK-SG-H2KU / STICK-SG-H2KU-V2 (samt Varianten + abhängigen Zeilen).
//
// Sicher & defensiv: löscht NUR die namentlich genannten Datensätze, und nur wenn
// sie NICHT mit einem Auftrag/finalen Beleg verknüpft sind (GoBD-Schutz). Per
// deleteMany (kein Fehler, wenn Kind-Tabellen leer sind), in einer Transaktion.
//
//   pnpm --filter @texma/api build && node apps/api/dist/scripts/cleanup-testdata.js
import "./load-env.js"; // lädt DATABASE_URL aus packages/db/.env
import { prisma } from "@texma/db";

const QUOTE_NUMBERS = ["AN-2026-0005"];
const ARTICLE_SKUS = ["STICK-SG-H2KU", "STICK-SG-H2KU-V2"];

async function deleteQuote(number: string): Promise<string> {
  const q = await prisma.quote.findUnique({ where: { number }, select: { id: true, status: true, order: { select: { id: true } } } });
  if (!q) return `Angebot ${number}: nicht vorhanden (übersprungen).`;
  if (q.order) return `Angebot ${number}: in einen Auftrag gewandelt — NICHT gelöscht (GoBD).`;
  await prisma.$transaction([
    prisma.quoteLine.deleteMany({ where: { quoteId: q.id } }),
    prisma.quote.delete({ where: { id: q.id } }),
  ]);
  return `Angebot ${number}: gelöscht.`;
}

async function deleteArticle(sku: string): Promise<string> {
  const a = await prisma.article.findUnique({ where: { sku }, select: { id: true, variants: { select: { id: true } } } });
  if (!a) return `Artikel ${sku}: nicht vorhanden (übersprungen).`;
  const variantIds = a.variants.map((v) => v.id);
  // GoBD-Schutz: an Aufträgen/Wareneingängen verwendete Varianten bleiben unangetastet.
  const usedInOrders = variantIds.length > 0 ? await prisma.orderLine.count({ where: { variantId: { in: variantIds } } }) : 0;
  const usedInReceipts = variantIds.length > 0 ? await prisma.goodsReceiptLine.count({ where: { variantId: { in: variantIds } } }) : 0;
  if (usedInOrders > 0 || usedInReceipts > 0) return `Artikel ${sku}: in Aufträgen/Wareneingängen verwendet — NICHT gelöscht (GoBD).`;
  await prisma.$transaction(async (tx) => {
    if (variantIds.length > 0) {
      const w = { variantId: { in: variantIds } } as const;
      await tx.quoteLine.deleteMany({ where: w });
      await tx.priceGroupPrice.deleteMany({ where: w });
      await tx.priceGroupPriceTier.deleteMany({ where: w });
      await tx.customerPriceTier.deleteMany({ where: w });
      await tx.supplierItem.deleteMany({ where: w });
      await tx.bomItem.deleteMany({ where: w });
      await tx.sampleLoanLine.deleteMany({ where: w });
      await tx.purchaseOrderLine.deleteMany({ where: w });
      await tx.stockReservation.deleteMany({ where: w });
      await tx.stockMove.deleteMany({ where: w });
      await tx.stockThreshold.deleteMany({ where: w });
      await tx.stockLevel.deleteMany({ where: w });
      await tx.variantAttribute.deleteMany({ where: w });
    }
    await tx.finishingSpec.deleteMany({ where: { articleId: a.id } });
    await tx.mediaAsset.deleteMany({ where: { articleId: a.id } });
    await tx.variant.deleteMany({ where: { articleId: a.id } });
    await tx.article.delete({ where: { id: a.id } });
  });
  return `Artikel ${sku}: gelöscht (inkl. ${variantIds.length} Variante[n]).`;
}

async function main(): Promise<void> {
  const out: string[] = [];
  for (const n of QUOTE_NUMBERS) out.push(await deleteQuote(n));
  for (const s of ARTICLE_SKUS) out.push(await deleteArticle(s));
  for (const line of out) console.log("•", line);
  await prisma.$disconnect();
}

void main().catch(async (e) => {
  console.error("Cleanup fehlgeschlagen:", e);
  await prisma.$disconnect();
  process.exit(1);
});
