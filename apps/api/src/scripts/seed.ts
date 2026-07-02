// Demo-Seed für den Dev-Server (echtes Backend/Prisma). Befüllt die Module, die
// bereits tRPC-Endpunkte haben, mit realistischen Demo-Daten, damit die Oberfläche
// "durchklickbar" ist. Idempotent (feste IDs, upsert) — beliebig oft ausführbar.
//
//   pnpm --filter @texma/api build && node apps/api/dist/scripts/seed.js
import "./load-env.js"; // MUSS zuerst stehen: lädt DATABASE_URL aus packages/db/.env
import { prisma } from "@texma/db";
import { Argon2Hasher } from "../modules/auth/password.js";

const day = 24 * 60 * 60 * 1000;
const at = (offsetDays: number): Date => new Date(Date.now() + offsetDays * day);

async function main(): Promise<void> {
  // ── Default-Tenant (ADR 0004, RLS Slice 1) ────────────────────────────────
  // Backfill-Ziel der Migration 0121; alle Wurzel-Entitäten des Seeds hängen daran.
  // tenantId ist in Slice 1 noch nullable — der Seed setzt sie trotzdem vorbildlich.
  const TENANT_ID = "tenant_texma";
  await prisma.tenant.upsert({
    where: { id: TENANT_ID }, update: { name: "TEXMA" }, create: { id: TENANT_ID, name: "TEXMA" },
  });

  // ── Demo-Nutzer ───────────────────────────────────────────────────────────
  // Pflicht für den GoBD-Audit-Trail: jede Mutation schreibt AuditLog.userId (FK auf
  // User). Der Dev-Server handelt fest als "demo-admin" — dieser Datensatz MUSS also
  // existieren, sonst bricht JEDE Mutation an der FK ab. Zusätzlich je Rolle ein User
  // zum Durchklicken der RBAC. Login-Passwort einheitlich "demo" (nur Dev), kein TOTP.
  const hasher = new Argon2Hasher();
  const demoPasswordHash = await hasher.hash("demo");
  const demoUsers: Array<{ id: string; email: string; name: string; role: "ADMIN" | "BUERO" | "PRODUKTION" | "BUCHHALTUNG" }> = [
    // E-Mails auf der TEXMA-Domain (AUTH_EMAIL_DOMAIN=texma-gmbh.de) — sonst widerspricht
    // der Seed der Benutzeranlage-Validierung (man könnte die Konten nicht neu anlegen).
    { id: "demo-admin", email: "admin@texma-gmbh.de", name: "Demo Admin", role: "ADMIN" },
    { id: "demo-buero", email: "buero@texma-gmbh.de", name: "Demo Büro", role: "BUERO" },
    { id: "demo-produktion", email: "produktion@texma-gmbh.de", name: "Demo Produktion", role: "PRODUKTION" },
    { id: "demo-buchhaltung", email: "buchhaltung@texma-gmbh.de", name: "Demo Buchhaltung", role: "BUCHHALTUNG" },
  ];
  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { email: u.email, name: u.name, role: u.role, active: true, tenantId: TENANT_ID },
      create: { ...u, passwordHash: demoPasswordHash, totpEnabled: false, active: true, tenantId: TENANT_ID },
    });
  }

  // ── Preisgruppen ──────────────────────────────────────────────────────────
  const pgStandard = await prisma.priceGroup.upsert({
    where: { kind: "STANDARD" }, update: {}, create: { kind: "STANDARD", name: "Standard" },
  });
  const pgGross = await prisma.priceGroup.upsert({
    where: { kind: "WIEDERVERKAEUFER" }, update: {}, create: { kind: "WIEDERVERKAEUFER", name: "Großkunde / Wiederverkäufer" },
  });

  // ── Firmen ────────────────────────────────────────────────────────────────
  const muster = await prisma.company.upsert({
    where: { id: "co-muster" }, update: { tenantId: TENANT_ID },
    create: { id: "co-muster", name: "Muster GmbH", priceGroupId: pgStandard.id, zahlungszielTage: 14, tenantId: TENANT_ID },
  });
  const gross = await prisma.company.upsert({
    where: { id: "co-gross" }, update: { tenantId: TENANT_ID },
    create: { id: "co-gross", name: "Großkunde AG", priceGroupId: pgGross.id, zahlungszielTage: 30, tenantId: TENANT_ID },
  });

  // ── Shop-Connector (T-01: Shop → Firma) ───────────────────────────────────
  await prisma.shopConnector.upsert({
    where: { id: "shop-muster" }, update: {},
    create: { id: "shop-muster", name: "Muster-Shop (Woo)", kind: "WOOCOMMERCE", baseUrl: "https://shop.muster.example", companyId: muster.id },
  });

  // ── Artikel + Varianten (Farbe×Größe) + Preise ────────────────────────────
  // Artikelstammsatz mit den verbindlichen Mindestfeldern: Nr. (sku), Name, Beschreibung
  // (Text) + Stamm-PIM. EK liegt je Variante am SupplierItem, VK je Variante am Preis.
  const article = await prisma.article.upsert({
    where: { sku: "POLO-CLASSIC" }, update: { tenantId: TENANT_ID },
    create: {
      id: "art-polo", sku: "POLO-CLASSIC", name: "Poloshirt Classic",
      description: "Klassisches Piqué-Poloshirt aus 100 % Baumwolle — vielseitig veredelbar (Stick/Druck).",
      ekCents: 450, vkCents: 1290,
      brand: "Texile Premium", materialComposition: "100% Baumwolle", careInstructions: "40 °C, nicht bleichen",
      tenantId: TENANT_ID,
    },
  });
  // ── Lieferanten (zuerst, damit die EK-SupplierItems je Variante darauf zeigen) ──
  const sup1 = await prisma.supplier.upsert({
    where: { id: "sup-fhb" }, update: { tenantId: TENANT_ID },
    create: { id: "sup-fhb", name: "FHB Textil GmbH", vatId: "DE123456789", iban: "DE02120300000000202051", tenantId: TENANT_ID },
  });
  await prisma.supplier.upsert({
    where: { id: "sup-stanley" }, update: { tenantId: TENANT_ID },
    create: { id: "sup-stanley", name: "Stanley/Stella", vatId: "BE0987654321", tenantId: TENANT_ID },
  });
  // Jede Variante bekommt VK (Preis) UND EK (SupplierItem) — keine Variante ohne EK.
  for (const [id, sku, farbe, groesse, cents, ekCents] of [
    ["var-polo-navy-l", "POLO-NAVY-L", "Navy", "L", 1290, 640],
    ["var-polo-navy-xl", "POLO-NAVY-XL", "Navy", "XL", 1390, 690],
    ["var-polo-white-m", "POLO-WHITE-M", "Weiß", "M", 1190, 590],
  ] as const) {
    await prisma.variant.upsert({
      where: { id }, update: {},
      create: {
        id, articleId: article.id, sku,
        attributes: { create: [{ name: "Farbe", value: farbe }, { name: "Größe", value: groesse }] },
        prices: { create: [{ priceGroupId: pgStandard.id, netCents: cents }] },
      },
    });
    await prisma.supplierItem.upsert({
      where: { id: `si-${sku}` }, update: {},
      create: { id: `si-${sku}`, supplierId: sup1.id, supplierSku: `FHB-${sku}`, variantId: id, ekCents, availableQty: 500, priority: 1 },
    }).catch(() => {});
    // var-polo-navy-l bewusst UNTER Mindestbestand → erzeugt Reorder-Vorschlag (T-12).
    const qty = id === "var-polo-navy-l" ? 10 : 120;
    await prisma.stockLevel.upsert({ where: { variantId: id }, update: { qty, minStock: 50 }, create: { variantId: id, qty, minStock: 50 } });
  }

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
      where: { id }, update: { status, deliveryAddressId, tenantId: TENANT_ID },
      create: {
        id, number, companyId, status, externalNumber, deliveryAddressId, tenantId: TENANT_ID,
        employeeNote: externalNumber ? "Shop-Bestellung" : null,
        lines: { create: [{ position: 1, description: "Poloshirt Navy L, bestickt", qty: 20, unitNetCents: Math.round(net / 20) }] },
      },
    });
  }

  // ── Produktionsaufträge mit Liefertermin (Ampel/Dashboard, Kap. 35.4) ──────
  // Mischung ROT/GELB/GRÜN für die Termin-Ampel: überfällig, knapp, im Plan.
  for (const [id, number, orderId, dueOffset] of [
    ["pa-1", "PA-2026-0001", "ord-1", -2], // überfällig → ROT
    ["pa-2", "PA-2026-0002", "ord-4", 2],  // in 2 Tagen → GELB
    ["pa-3", "PA-2026-0003", "ord-2", 12], // im Plan → GRÜN
  ] as const) {
    await prisma.productionOrder.upsert({
      where: { id }, update: { dueDate: at(dueOffset) },
      create: { id, number, orderId, dueDate: at(dueOffset) },
    }).catch(() => {});
  }

  // ── Mehrstufige Fremdvergabe / Lohnveredelung (T-04, Kap. 5.3) ─────────────
  // Zwei Stufen an pa-1: Stufe 1 (Siebdruck) zurück inkl. Schwund, Stufe 2 (Stickerei)
  // dadurch handlungsfähig. Zeigt sequenzielles Gate, Schwund/Ausbeute, Lohnkosten.
  for (const s of [
    { id: "sub-1", number: "PA-2026-0001-a", productionId: "pa-1", sequence: 1, supplierId: "sup-fhb",
      status: "RUECKLAUF_ERHALTEN", beistellMenge: 200, ruecklaufMenge: 195, lohnCents: 30_000,
      beistellungVersandtAm: at(-6), ruecklaufErhaltenAm: at(-2), dueDate: at(-3) },
    { id: "sub-2", number: "PA-2026-0001-b", productionId: "pa-1", sequence: 2, supplierId: "sup-stanley",
      status: "OFFEN", lohnCents: 25_000, dueDate: at(2) },
  ] as const) {
    await prisma.subProductionOrder.upsert({ where: { id: s.id }, update: {}, create: { ...s } }).catch(() => {});
  }

  // ── Angebote mit Wiedervorlage (Ampel-Ebene ANGEBOT, Kap. 35.1/35.4) ───────
  for (const [id, number, companyId, status, wvOffset] of [
    ["qt-1", "AN-2026-0001", muster.id, "ENTWURF", -1],  // Nachfass überfällig → ROT
    ["qt-2", "AN-2026-0002", gross.id, "VERSENDET", 1],  // Nachfass morgen → GELB
  ] as const) {
    await prisma.quote.upsert({
      where: { id }, update: { wiedervorlageAm: at(wvOffset), tenantId: TENANT_ID },
      create: {
        id, number, companyId, status, wiedervorlageAm: at(wvOffset), tenantId: TENANT_ID,
        lines: { create: [{ position: 1, description: "Poloshirt Navy L, bestickt", qty: 50, unitNetCents: 1290 }] },
      },
    }).catch(() => {});
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
      where: { id }, update: { tenantId: TENANT_ID },
      create: {
        id, number, companyId, netCents: net, taxCents: tax, grossCents: net + tax, finalized: true, tenantId: TENANT_ID,
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

  // ── Muster-Leihgut (B5) ────────────────────────────────────────────────────
  await prisma.sampleLoan.upsert({
    where: { id: "loan-1" }, update: {},
    create: { id: "loan-1", companyId: muster.id, variantId: "var-polo-navy-l", menge: 3, status: "VERLIEHEN", ausgegebenAm: at(-5) },
  });

  // ── Kostenstellen (B7) ─────────────────────────────────────────────────────
  for (const [id, nummer, name] of [["cc-1", "1000", "Veredelung"], ["cc-2", "2000", "Vertrieb"]] as const) {
    await prisma.costCenter.upsert({ where: { id }, update: {}, create: { id, nummer, name } });
  }

  // Nummernkreise auf das TATSÄCHLICHE Maximum der vorhandenen Belege heben (nicht
  // hartkodiert), damit die echte Nummernvergabe (NumberingService.next) auch nach
  // Re-Seeds und zur Laufzeit angelegten Belegen kollisionsfrei dahinter weiterzählt.
  // Wurzel des „eindeutiges Feld verletzt"-Fehlers bei Anfrage→Angebot / Angebot→Auftrag:
  // ein Reset hinter ein höher nummeriertes Bestandsdokument erzeugte Nummern-Kollisionen.
  const year = 2026;
  const syncSeq = async (key: string, numbers: ReadonlyArray<string | null>): Promise<void> => {
    let max = 0;
    for (const num of numbers) {
      const parts = String(num ?? "").split("-");
      if (parts.length >= 3 && Number(parts[parts.length - 2]) === year) {
        max = Math.max(max, Number(parts[parts.length - 1]) || 0);
      }
    }
    await prisma.numberSequence.upsert({
      where: { key_year: { key, year } },
      update: { next: { set: max } },
      create: { key, year, next: max },
    });
  };
  const num = <T extends { number: string }>(rows: T[]): string[] => rows.map((r) => r.number);
  await syncSeq("ORDER", num(await prisma.order.findMany({ select: { number: true } })));
  await syncSeq("QUOTE", num(await prisma.quote.findMany({ select: { number: true } })));
  await syncSeq("INVOICE", num(await prisma.invoice.findMany({ select: { number: true } })));
  await syncSeq("INQUIRY", num(await prisma.inquiry.findMany({ select: { number: true } })));
  await syncSeq("PRODUCTION_ORDER", num(await prisma.productionOrder.findMany({ select: { number: true } })));
  await syncSeq("DELIVERY_NOTE", num(await prisma.deliveryNote.findMany({ select: { number: true } })));
  await syncSeq("PURCHASE_ORDER", num(await prisma.purchaseOrder.findMany({ select: { number: true } })));
  await syncSeq("CREDIT_NOTE", num(await prisma.creditNote.findMany({ select: { number: true } })));
  await syncSeq("ABSCHLAG", num(await prisma.abschlagsrechnung.findMany({ select: { number: true } })));

  console.log("Seed fertig: Preisgruppen, 2 Firmen, Shop, Artikel+3 Varianten, 2 Lieferanten, 4 Aufträge, 3 Produktionsaufträge + 2 Fremdvergabe-Stufen + 2 Angebote (Ampel), 2 Eingangs-/2 Ausgangsrechnungen; Nummernkreise synchronisiert.");
}

type OrderStatusLit = "ANGELEGT" | "IN_BEARBEITUNG" | "IN_PRODUKTION" | "VERSANDBEREIT" | "VERSENDET" | "FAKTURIERT" | "ABGESCHLOSSEN" | "STORNIERT";

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => void prisma.$disconnect());
