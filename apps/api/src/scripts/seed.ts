// Demo-Seed für den Dev-Server (echtes Backend/Prisma). Befüllt die Module, die
// bereits tRPC-Endpunkte haben, mit realistischen Demo-Daten, damit die Oberfläche
// "durchklickbar" ist. Idempotent (feste IDs, upsert) — beliebig oft ausführbar.
//
//   pnpm --filter @texma/api build && node apps/api/dist/scripts/seed.js
import "./load-env.js"; // MUSS zuerst stehen: lädt DATABASE_URL aus packages/db/.env
import { prisma } from "@texma/db";

const day = 24 * 60 * 60 * 1000;
const at = (offsetDays: number): Date => new Date(Date.now() + offsetDays * day);

async function main(): Promise<void> {
  // ── Preisgruppen ──────────────────────────────────────────────────────────
  const pgStandard = await prisma.priceGroup.upsert({
    where: { kind: "STANDARD" }, update: {}, create: { kind: "STANDARD", name: "Standard" },
  });
  const pgGross = await prisma.priceGroup.upsert({
    where: { kind: "WIEDERVERKAEUFER" }, update: {}, create: { kind: "WIEDERVERKAEUFER", name: "Großkunde / Wiederverkäufer" },
  });

  // ── Firmen ────────────────────────────────────────────────────────────────
  const muster = await prisma.company.upsert({
    where: { id: "co-muster" }, update: {},
    create: { id: "co-muster", name: "Muster GmbH", priceGroupId: pgStandard.id, zahlungszielTage: 14 },
  });
  const gross = await prisma.company.upsert({
    where: { id: "co-gross" }, update: {},
    create: { id: "co-gross", name: "Großkunde AG", priceGroupId: pgGross.id, zahlungszielTage: 30 },
  });

  // ── Shop-Connector (T-01: Shop → Firma) ───────────────────────────────────
  await prisma.shopConnector.upsert({
    where: { id: "shop-muster" }, update: {},
    create: { id: "shop-muster", name: "Muster-Shop (Woo)", kind: "WOOCOMMERCE", baseUrl: "https://shop.muster.example", companyId: muster.id },
  });

  // ── Artikel + Varianten (Farbe×Größe) + Preise ────────────────────────────
  const article = await prisma.article.upsert({
    where: { sku: "POLO-CLASSIC" }, update: {},
    create: { id: "art-polo", sku: "POLO-CLASSIC", name: "Poloshirt Classic" },
  });
  for (const [id, sku, farbe, groesse, cents] of [
    ["var-polo-navy-l", "POLO-NAVY-L", "Navy", "L", 1290],
    ["var-polo-navy-xl", "POLO-NAVY-XL", "Navy", "XL", 1390],
    ["var-polo-white-m", "POLO-WHITE-M", "Weiß", "M", 1190],
  ] as const) {
    await prisma.variant.upsert({
      where: { id }, update: {},
      create: {
        id, articleId: article.id, sku,
        attributes: { create: [{ name: "Farbe", value: farbe }, { name: "Größe", value: groesse }] },
        prices: { create: [{ priceGroupId: pgStandard.id, netCents: cents }] },
      },
    });
    // var-polo-navy-l bewusst UNTER Mindestbestand → erzeugt Reorder-Vorschlag (T-12).
    const qty = id === "var-polo-navy-l" ? 10 : 120;
    await prisma.stockLevel.upsert({ where: { variantId: id }, update: { qty, minStock: 50 }, create: { variantId: id, qty, minStock: 50 } });
  }

  // ── Lieferanten + Katalog ──────────────────────────────────────────────────
  const sup1 = await prisma.supplier.upsert({
    where: { id: "sup-fhb" }, update: {},
    create: { id: "sup-fhb", name: "FHB Textil GmbH", vatId: "DE123456789", iban: "DE02120300000000202051" },
  });
  await prisma.supplier.upsert({
    where: { id: "sup-stanley" }, update: {},
    create: { id: "sup-stanley", name: "Stanley/Stella", vatId: "BE0987654321" },
  });
  await prisma.supplierItem.upsert({
    where: { id: "si-1" }, update: {},
    create: { id: "si-1", supplierId: sup1.id, supplierSku: "FHB-POLO-NAVY-L", variantId: "var-polo-navy-l", ekCents: 640, availableQty: 500 },
  }).catch(() => {});

  // ── Lieferadresse (Pflicht für Versand-Liste) ──────────────────────────────
  const addrGross = await prisma.deliveryAddress.upsert({
    where: { id: "addr-gross" }, update: {},
    create: { id: "addr-gross", companyId: gross.id, label: "Zentrallager", street: "Industriestr. 5", zip: "33602", city: "Bielefeld" },
  });

  // ── Aufträge (verschiedene Status für Liste/Versand) ───────────────────────
  const orders: Array<[string, string, string, OrderStatusLit, string | null, number, string | null]> = [
    ["ord-1", "AB-2026-0001", muster.id, "IN_PRODUKTION", "WC-5512", 25_800, null],
    ["ord-2", "AB-2026-0002", gross.id, "VERSANDBEREIT", "WC-5513", 139_000, addrGross.id],
    ["ord-3", "AB-2026-0003", muster.id, "VERSENDET", null, 11_900, null],
    ["ord-4", "AB-2026-0004", gross.id, "ANGELEGT", "WC-5520", 64_500, null],
  ];
  for (const [id, number, companyId, status, externalNumber, net, deliveryAddressId] of orders) {
    await prisma.order.upsert({
      where: { id }, update: { status, deliveryAddressId },
      create: {
        id, number, companyId, status, externalNumber, deliveryAddressId,
        employeeNote: externalNumber ? "Shop-Bestellung" : null,
        lines: { create: [{ position: 1, description: "Poloshirt Navy L, bestickt", qty: 20, unitNetCents: Math.round(net / 20) }] },
      },
    });
  }

  // ── Eingangsrechnungen ─────────────────────────────────────────────────────
  for (const [id, number, net] of [["ii-1", "ER-5001", 38_000], ["ii-2", "ER-5002", 15_126]] as const) {
    await prisma.incomingInvoice.upsert({
      where: { id }, update: {},
      create: { id, number, supplierId: sup1.id, netCents: net, taxCents: Math.round(net * 0.19), grossCents: Math.round(net * 1.19) },
    });
  }

  // ── Ausgangsrechnungen + offene Posten (Mahnwesen) ─────────────────────────
  for (const [id, number, companyId, net, daysOverdue] of [
    ["inv-1", "RE-2026-0001", muster.id, 25_800, 20],
    ["inv-2", "RE-2026-0002", gross.id, 139_000, 5],
  ] as const) {
    const tax = Math.round(net * 0.19);
    await prisma.invoice.upsert({
      where: { id }, update: {},
      create: {
        id, number, companyId, netCents: net, taxCents: tax, grossCents: net + tax, finalized: true,
        openItem: { create: { openCents: net + tax, dueDate: at(-daysOverdue) } },
      },
    }).catch(() => {});
  }

  // ── Leads (B15) ────────────────────────────────────────────────────────────
  for (const [id, name, quelle, status] of [
    ["lead-1", "Sportverein Adler e.V.", "WEB", "NEU"],
    ["lead-2", "Müller Bau GmbH", "TELEFON", "QUALIFIZIERT"],
  ] as const) {
    await prisma.lead.upsert({ where: { id }, update: {}, create: { id, name, quelle, status, email: "info@example.de" } });
  }

  // ── Anfragen (B20) ─────────────────────────────────────────────────────────
  for (const [id, number, text, status, cid] of [
    ["inq-1", "AF-2026-0001", "200 Polos navy, Logo bestickt, bis KW40", "NEU", muster.id],
    ["inq-2", "AF-2026-0002", "50 Softshelljacken, Rückenprint", "IN_BEARBEITUNG", gross.id],
  ] as const) {
    await prisma.inquiry.upsert({ where: { id }, update: {}, create: { id, number, text, status, quelle: "WEB", companyId: cid } });
  }

  // ── Kostenstellen (B7) ─────────────────────────────────────────────────────
  for (const [id, nummer, name] of [["cc-1", "1000", "Veredelung"], ["cc-2", "2000", "Vertrieb"]] as const) {
    await prisma.costCenter.upsert({ where: { id }, update: {}, create: { id, nummer, name } });
  }

  console.log("Seed fertig: Preisgruppen, 2 Firmen, Shop, Artikel+3 Varianten, 2 Lieferanten, 4 Aufträge, 2 Eingangs-/2 Ausgangsrechnungen.");
}

type OrderStatusLit = "ANGELEGT" | "IN_BEARBEITUNG" | "IN_PRODUKTION" | "VERSANDBEREIT" | "VERSENDET" | "FAKTURIERT" | "ABGESCHLOSSEN" | "STORNIERT";

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => void prisma.$disconnect());
