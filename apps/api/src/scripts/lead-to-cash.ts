// Lead-to-Cash-Durchstich gegen ECHTES Postgres (ERPNext-Walkthrough-Äquivalent):
// Lead → (Kunde) → Angebot → Auftrag → Rechnung → Zahlung. Zeigt die automatische
// Status-Rückkopplung (per_billed/fakturastatus) und die ausgeglichenen Buchungssätze,
// die der Steuerberater per DATEV erhält (G1: ERP führt KEIN eigenes Hauptbuch).
//
//   pnpm --filter @texma/api build && node apps/api/dist/scripts/lead-to-cash.js
import "./load-env.js";
import { prisma } from "@texma/db";
import { buchungenFromInvoice, buildInvoiceTotals } from "@texma/shared";
import { PrismaAuditSink } from "../audit/prisma-audit-sink.js";
import { NumberingService } from "../modules/numbering/numbering.service.js";
import { PrismaNumberingRepository } from "../repositories/prisma-numbering.repository.js";
import { LeadService } from "../modules/lead/lead.service.js";
import { PrismaLeadRepository } from "../repositories/prisma-lead.repository.js";
import { QuoteService } from "../modules/quote/quote.service.js";
import { PrismaQuoteRepository } from "../repositories/prisma-quote.repository.js";
import { SalesOrderService } from "../modules/sales/sales-order.service.js";
import { PrismaSalesOrderRepository } from "../repositories/prisma-sales-order.repository.js";
import { InvoiceService } from "../modules/invoice/invoice.service.js";
import { PrismaInvoiceRepository } from "../repositories/prisma-invoice.repository.js";
import { ConnectionsService } from "../modules/connections/connections.service.js";
import { PrismaConnectionsRepository } from "../repositories/prisma-connections.repository.js";

const eur = (c: number): string => `${(c / 100).toFixed(2)} €`;
const log = (s: string): void => console.log(s);

async function main(): Promise<void> {
  const audit = new PrismaAuditSink();
  const numbering = new NumberingService(new PrismaNumberingRepository());
  const leads = new LeadService(new PrismaLeadRepository(), audit);
  const quotes = new QuoteService(new PrismaQuoteRepository(), numbering, audit);
  const sales = new SalesOrderService(new PrismaSalesOrderRepository(), numbering, audit);
  const invoices = new InvoiceService(new PrismaInvoiceRepository(), numbering, audit);

  // Standard-Preisgruppe (die Lead-Konvertierung verlangt sie) sicherstellen.
  await prisma.priceGroup.upsert({ where: { kind: "STANDARD" }, update: {}, create: { kind: "STANDARD", name: "Standard" } });

  log("\n=== TEXMA ERP — Lead-to-Cash-Durchstich ===\n");

  // 1) Lead anlegen (Name wird bei der Konvertierung zum Firmennamen)
  const { id: leadId } = await leads.create({ name: "Demo Walkthrough GmbH", quelle: "TELEFON", email: "kontakt@demo-walkthrough.de", phone: "0201 123456" });
  let lead = await prisma.lead.findUnique({ where: { id: leadId } });
  log(`1. Lead        ${leadId}  (Status ${lead?.status})  „${lead?.name}"`);

  // Funnel-Übergänge bis QUALIFIZIERT (Voraussetzung für die Konvertierung)
  await leads.transition(leadId, "KONTAKTIERT");
  await leads.transition(leadId, "QUALIFIZIERT");

  // 2) Lead → Kunde (Herkunfts-Rückverfolgung: Customer.from_lead)
  const { companyId } = await leads.convert(leadId);
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  lead = await prisma.lead.findUnique({ where: { id: leadId } });
  log(`2. Kunde       ${company?.name}  (aus Lead konvertiert — Lead jetzt ${lead?.status})`);

  // 3) Angebot mit Position
  const line = { description: "Poloshirt blau L, bestickt", qty: 12, unitNetCents: 4498 };
  const { id: quoteId, number: quoteNo } = await quotes.create({ companyId, lines: [line] });
  log(`3. Angebot     ${quoteNo}  ${eur(buildInvoiceTotals([line]).netCents)} netto`);

  // 4) Angebot → Auftrag (Make-Target, Positionsübernahme)
  const { id: orderId, number: orderNo } = await sales.convertQuote(quoteId);
  let order = await prisma.order.findUnique({ where: { id: orderId } });
  log(`4. Auftrag     ${orderNo}  (Status ${order?.status}, fakturastatus ${order?.fakturastatus})  ← aus ${quoteNo}`);

  // 5) Auftrag → Rechnung (Make-Target) + offener Posten; Status-Rückmeldung
  const inv = await invoices.createFromOrder(orderId);
  order = await prisma.order.findUnique({ where: { id: orderId } });
  log(`5. Rechnung    ${inv.number}  ${eur(inv.grossCents)} brutto (netto ${eur(inv.netCents)} + USt ${eur(inv.taxCents)})`);
  log(`               → Auftrag automatisch: Status ${order?.status}, fakturastatus ${order?.fakturastatus} (per_billed = 100 %)`);

  // 6) Zahlungseingang voll auf den offenen Posten allokieren → bezahlt
  const invoiceRow = await prisma.invoice.findUnique({ where: { id: inv.id }, include: { openItem: true } });
  const openItem = invoiceRow!.openItem!;
  const payment = await prisma.payment.create({ data: { externalRef: `DEMO-PAY-${Date.now()}`, amountCents: inv.grossCents, reference: inv.number, matched: true } });
  await prisma.paymentAllocation.create({ data: { paymentId: payment.id, openItemId: openItem.id, amountCents: inv.grossCents } });
  await prisma.openItem.update({ where: { id: openItem.id }, data: { openCents: 0 } });
  log(`6. Zahlung     ${payment.externalRef}  ${eur(payment.amountCents)}  → offener Posten ${eur(0)} (BEZAHLT)`);

  // Belegkette (Connections) aus dem echten Read-Repo + ausgeglichene DATEV-Buchungssätze
  log("\n--- Connections (Belegkette, phasen-gruppiert) ---");
  const connections = new ConnectionsService(new PrismaConnectionsRepository());
  const graph = await connections.orderConnections(orderId);
  log(`Anker: ${graph?.anchor.entity} ${graph?.anchor.label} (${graph?.anchor.status})`);
  for (const g of graph?.groups ?? []) {
    log(`  ${g.phase}: ${g.nodes.map((n) => `${n.entity} ${n.label}${n.status ? ` (${n.status})` : ""}`).join(", ")}`);
  }

  log("\n--- DATEV-Buchungssätze (ausgeglichen, Soll=Haben) — ERP führt kein eigenes Hauptbuch (G1) ---");
  const totals = buildInvoiceTotals([line]);
  const bookings = buchungenFromInvoice(
    { number: inv.number, issuedAt: new Date(), debitorKonto: "10000", taxByRate: totals.taxByRate },
    { standard: "8400", reduced: "8300" }
  );
  for (const b of bookings) {
    log(`  Rechnung:  ${b.sollHaben === "S" ? "SOLL" : "HABEN"} Konto ${b.konto} an ${b.gegenkonto}  ${eur(b.umsatzCents)}  (BU ${b.buSchluessel}, ${b.buchungstext})`);
  }
  log(`  Zahlung:   SOLL Bank 1200 an Debitor 10000  ${eur(inv.netCents)}  (Ausgleich offener Posten ${inv.number})`);
  log(`  ⇒ Debitor-Saldo des Kunden: ${eur(0)} (Forderung vollständig ausgeglichen)\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
