// Prisma-Druckdaten: liest Lieferschein/Rechnung samt Positionen + Empfängeradresse.

import { prisma } from "@texma/db";
import { FIRMA_DEFAULT, lineNet, taxOnNet, VAT_STANDARD, type FirmenProfil, type GarmentType, type LineType, type PositionKind } from "@texma/shared";
import type { BelegMailKind, CompanyDataSheetData, DeliveryNotePrintData, InvoicePrintData, LaufzettelPrintData, LetterMeta, OrderConfirmationPrintData, PrintRepository, PricePrintLine, QuotePrintData, SupplierDataSheetData } from "../modules/print/print.service.js";

/** Schlüssel im AppSetting-Speicher (gespiegelt aus settings.service). */
const COMPANY_PROFILE_KEY = "company_profile";
const COMPANY_LOGO_KEY = "company_logo_b64";

/** Variantendetail (Art-Nr./Farbe/Größe/Material) für eine Beleg-Position. */
type VariantDetail = { sku: string; attributes: { name: string; value: string }[]; article: { materialComposition: string | null } };
type VariantDetailMap = Map<string, VariantDetail>;

/** Lädt die Variantendetails (sku/attributes/material) zu den genutzten variantIds als Lookup. */
async function loadVariantDetails(variantIds: (string | null)[]): Promise<VariantDetailMap> {
  const ids = [...new Set(variantIds.filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.variant.findMany({
    where: { id: { in: ids } },
    select: { id: true, sku: true, attributes: { select: { name: true, value: true } }, article: { select: { materialComposition: true } } },
  });
  return new Map(rows.map((r) => [r.id, { sku: r.sku, attributes: r.attributes, article: r.article }]));
}

/** Variantenattribute → Detailzeilen (Farbe/Größe) + Material aus dem Hauptartikel. */
function lineExtras(variantId: string | null, map: VariantDetailMap): { artNr?: string; detail?: string[] } {
  const variant = variantId ? map.get(variantId) : undefined;
  if (!variant) return {};
  const attr = (name: string) => variant.attributes.find((a) => a.name === name)?.value;
  const detail: string[] = [];
  const farbe = attr("Farbe");
  const groesse = attr("Größe");
  if (farbe) detail.push(`Farbe: ${farbe}`);
  if (variant.article.materialComposition) detail.push(`Material: ${variant.article.materialComposition}`);
  if (groesse) detail.push(`Größe: ${groesse}`);
  return { artNr: variant.sku, ...(detail.length ? { detail } : {}) };
}

// Positions-Strukturfelder (Positionsmaske) → Belegposition: Platzierung, Alt-Preistext, PDF-ausblenden.
function lineStruct(l: { placement?: string | null; altPreisText?: string | null; imPdfAusblenden?: boolean; lineType?: string | null }): { platzierung?: string; altPreisText?: string; imPdfAusblenden?: boolean; lineType?: LineType } {
  return {
    ...(l.placement ? { platzierung: l.placement } : {}),
    ...(l.altPreisText ? { altPreisText: l.altPreisText } : {}),
    ...(l.imPdfAusblenden ? { imPdfAusblenden: true } : {}),
    ...(l.lineType && l.lineType !== "ARTIKEL" ? { lineType: l.lineType as LineType } : {}),
  };
}
const LINE_STRUCT_SELECT = { placement: true, altPreisText: true, imPdfAusblenden: true, lineType: true } as const;

/** Netto/USt/Brutto aus Preis-Positionen (Standard-USt) — für Angebot/AB ohne gespeicherte Steuer. */
function totals(lines: PricePrintLine[]): { netCents: number; taxCents: number; grossCents: number } {
  const netCents = lines.reduce((sum, l) => sum + lineNet(l.menge, l.einzelpreisCents), 0);
  const taxCents = taxOnNet(netCents, VAT_STANDARD);
  return { netCents, taxCents, grossCents: netCents + taxCents };
}

const ROUTE_LABEL: Record<string, string> = {
  ROUTE1_KEINE: "Route 1 – keine Veredelung", ROUTE2_INTERN: "Route 2 – interne Veredelung",
  ROUTE3_EXTERN: "Route 3 – externe Veredler", ROUTE4_EXTERN_INTERN: "Route 4 – extern + intern",
};

function addressLines(companyName: string, addr: { street: string; zip: string; city: string } | null): string[] {
  return addr ? [companyName, addr.street, `${addr.zip} ${addr.city}`] : [companyName];
}

/** Empfängerblock aus der Kunden-Rechnungsadresse (Pflicht auf Rechnung, § 14 UStG);
 *  fällt auf eine ggf. übergebene Lieferadresse bzw. den Namen zurück. USt-IdNr. ergänzt. */
function recipientLines(
  company: { name: string; street: string | null; zip: string | null; city: string | null; country: string | null; vatId: string | null },
  fallbackAddr: { street: string; zip: string; city: string } | null
): string[] {
  const lines = [company.name];
  if (company.street && company.zip && company.city) {
    lines.push(company.street, `${company.zip} ${company.city}`);
    if (company.country && company.country !== "DE") lines.push(company.country);
  } else if (fallbackAddr) {
    lines.push(fallbackAddr.street, `${fallbackAddr.zip} ${fallbackAddr.city}`);
  }
  if (company.vatId) lines.push(`USt-IdNr.: ${company.vatId}`);
  return lines;
}

export class PrismaPrintRepository implements PrintRepository {
  /**
   * Empfänger-E-Mail je Belegtyp: Firmen-E-Mail bevorzugt, sonst Fallback auf den ersten
   * aktiven Kontakt der Firma (QA Finding 4 — Firmen ohne eigene Mail liefen beim Direkt-
   * versand sonst ins Leere, obwohl ein Ansprechpartner mit Mail hinterlegt war).
   */
  async recipientEmailForBeleg(kind: BelegMailKind, id: string): Promise<string | null> {
    const companyId = await this.companyIdForBeleg(kind, id);
    if (!companyId) return null;
    const c = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        email: true,
        contacts: {
          where: { email: { not: null }, gesperrtAm: null, anonymisiertAm: null },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { email: true },
        },
      },
    });
    return c?.email ?? c?.contacts[0]?.email ?? null;
  }

  /** Auflösung der Firma je Belegtyp (nur die companyId, FK-Kette). */
  private async companyIdForBeleg(kind: BelegMailKind, id: string): Promise<string | null> {
    switch (kind) {
      case "QUOTE":
        return (await prisma.quote.findUnique({ where: { id }, select: { companyId: true } }))?.companyId ?? null;
      case "INVOICE":
        return (await prisma.invoice.findUnique({ where: { id }, select: { companyId: true } }))?.companyId ?? null;
      case "AUFTRAGSBESTAETIGUNG":
        return (await prisma.order.findUnique({ where: { id }, select: { companyId: true } }))?.companyId ?? null;
      case "LIEFERSCHEIN":
        return (await prisma.deliveryNote.findUnique({ where: { id }, select: { order: { select: { companyId: true } } } }))?.order.companyId ?? null;
      case "GUTSCHRIFT":
        return (await prisma.creditNote.findUnique({ where: { id }, select: { invoice: { select: { companyId: true } } } }))?.invoice.companyId ?? null;
      case "MAHNUNG":
        return (await prisma.dunningNotice.findUnique({ where: { id }, select: { openItem: { select: { invoice: { select: { companyId: true } } } } } }))?.openItem.invoice.companyId ?? null;
      case "LEIHGUT":
        return (await prisma.sampleLoan.findUnique({ where: { id }, select: { companyId: true } }))?.companyId ?? null;
    }
  }

  async briefkopf(): Promise<string[]> {
    const row = await prisma.appSetting.findUnique({ where: { key: "briefkopf" } });
    return row ? row.value.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  }

  async companyProfile(): Promise<FirmenProfil> {
    const row = await prisma.appSetting.findUnique({ where: { key: COMPANY_PROFILE_KEY } });
    if (!row) return { ...FIRMA_DEFAULT };
    try { return { ...FIRMA_DEFAULT, ...(JSON.parse(row.value) as Partial<FirmenProfil>) }; }
    catch { return { ...FIRMA_DEFAULT }; }
  }

  async companyLogo(): Promise<string | null> {
    const row = await prisma.appSetting.findUnique({ where: { key: COMPANY_LOGO_KEY } });
    return row && row.value.trim() ? row.value.trim() : null;
  }

  /** Brief-Meta (Kunden-Nr. + Innendienst-Ansprechpartner) aus den Kundenstammdaten. */
  private async buildMeta(company: { customerNumber: string | null; betreuer: string | null }): Promise<LetterMeta | undefined> {
    const meta: LetterMeta = {};
    if (company.customerNumber) meta.kundenNr = company.customerNumber;
    if (company.betreuer) {
      const f = await this.companyProfile();
      meta.ansprechpartner = { name: company.betreuer, tel: f.tel, mail: f.mail };
    }
    return Object.keys(meta).length ? meta : undefined;
  }

  async companyForDataSheet(companyId: string): Promise<CompanyDataSheetData | null> {
    const c = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true, customerNumber: true, branche: true, priceGroup: { select: { kind: true } },
        street: true, zip: true, city: true, country: true, vatId: true, taxNumber: true, taxRule: true,
        iban: true, bic: true, bankName: true, sepaMandateRef: true, sepaMandateDate: true,
        zahlungszielTage: true, skontoPercent: true, skontoDays: true, paymentMethod: true, kreditlimitCents: true,
        liefersperre: true, liefersperreGrund: true, debitorenkonto: true, belegsprache: true, waehrung: true, betreuer: true,
      },
    });
    if (!c) return null;
    const { priceGroup, ...rest } = c;
    return { ...rest, priceGroupKind: priceGroup.kind };
  }

  async supplierForDataSheet(supplierId: string): Promise<SupplierDataSheetData | null> {
    const s = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: {
        name: true, kind: true, street: true, zip: true, city: true, country: true,
        vatId: true, iban: true, bic: true,
        zahlungszielTage: true, skontoPercent: true, skontoDays: true, lieferzeitTage: true, notiz: true,
        _count: { select: { supplierItems: true } },
      },
    });
    if (!s) return null;
    const { _count, ...rest } = s;
    return { ...rest, itemCount: _count.supplierItems };
  }
  async deliveryNoteForPrint(id: string): Promise<DeliveryNotePrintData | null> {
    const d = await prisma.deliveryNote.findUnique({
      where: { id },
      select: {
        number: true, createdAt: true,
        lines: { select: { qty: true, orderLine: { select: { description: true, variantId: true } } } },
        order: { select: { company: { select: { name: true, customerNumber: true, betreuer: true } }, deliveryAddress: { select: { street: true, zip: true, city: true } } } },
      },
    });
    if (!d) return null;
    const vmap = await loadVariantDetails(d.lines.map((l) => l.orderLine.variantId));
    return {
      number: d.number, createdAt: d.createdAt,
      empfaenger: addressLines(d.order.company.name, d.order.deliveryAddress),
      positionen: d.lines.map((l) => ({ menge: l.qty, bezeichnung: l.orderLine.description, ...lineExtras(l.orderLine.variantId, vmap) })),
      meta: await this.buildMeta(d.order.company),
    };
  }

  async creditNoteForPrint(id: string): Promise<import("../modules/print/print.service.js").CreditNotePrintData | null> {
    const c = await prisma.creditNote.findUnique({
      where: { id },
      select: {
        number: true, createdAt: true, amountCents: true, reason: true,
        invoice: { select: { number: true, company: { select: { name: true, street: true, zip: true, city: true, country: true, vatId: true } }, order: { select: { deliveryAddress: { select: { street: true, zip: true, city: true } } } } } },
      },
    });
    if (!c) return null;
    return {
      number: c.number, createdAt: c.createdAt, amountCents: c.amountCents, grund: c.reason,
      rechnungNummer: c.invoice.number,
      empfaenger: recipientLines(c.invoice.company, c.invoice.order?.deliveryAddress ?? null),
    };
  }

  async dunningStufeForNotice(id: string): Promise<number | null> {
    return (await prisma.dunningNotice.findUnique({ where: { id }, select: { stufe: true } }))?.stufe ?? null;
  }

  async invoiceIdForNotice(id: string): Promise<string | null> {
    const n = await prisma.dunningNotice.findUnique({
      where: { id },
      select: { openItem: { select: { invoice: { select: { id: true } } } } },
    });
    return n?.openItem.invoice?.id ?? null;
  }

  async mahnungForPrint(id: string): Promise<import("../modules/print/print.service.js").MahnungPrintData | null> {
    const n = await prisma.dunningNotice.findUnique({
      where: { id },
      select: {
        id: true, stufe: true, gebuehrCents: true, erzeugtAm: true,
        openItem: { select: { openCents: true, dueDate: true, invoice: { select: { number: true, company: { select: { name: true, street: true, zip: true, city: true, country: true, vatId: true } }, order: { select: { deliveryAddress: { select: { street: true, zip: true, city: true } } } } } } } },
      },
    });
    if (!n) return null;
    const inv = n.openItem.invoice;
    return {
      nummer: `MA-${n.stufe}-${n.id.slice(-6).toUpperCase()}`,
      erstelltAm: n.erzeugtAm,
      empfaenger: recipientLines(inv.company, inv.order?.deliveryAddress ?? null),
      rechnungNummer: inv.number,
      stufe: n.stufe,
      offenCents: n.openItem.openCents,
      mahngebuehrCents: n.gebuehrCents,
      faelligSeit: n.openItem.dueDate,
    };
  }

  async sampleLoanForPrint(loanId: string): Promise<DeliveryNotePrintData | null> {
    const l = await prisma.sampleLoan.findUnique({
      where: { id: loanId },
      select: {
        ausgegebenAm: true, menge: true,
        company: { select: { name: true, street: true, zip: true, city: true } },
        variant: { select: { sku: true, article: { select: { name: true } } } },
        lines: { select: { menge: true, description: true } },
      },
    });
    if (!l) return null;
    // Mehrartikel-Leihe → lines; Einzel-Leihe → Variante als eine Position.
    const positionen = l.lines.length > 0
      ? l.lines.map((p) => ({ menge: p.menge, bezeichnung: p.description }))
      : (l.variant ? [{ menge: l.menge ?? 1, bezeichnung: `${l.variant.article.name} (${l.variant.sku})` }] : []);
    return {
      number: `MUSTER-${loanId.slice(-6)}`,
      createdAt: l.ausgegebenAm,
      empfaenger: addressLines(l.company.name, l.company.street && l.company.zip && l.company.city ? { street: l.company.street, zip: l.company.zip, city: l.company.city } : null),
      positionen,
    };
  }

  async laufzettelForPrint(orderId: string): Promise<LaufzettelPrintData | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        number: true, createdAt: true, route: true,
        company: { select: { name: true } },
        lines: { orderBy: { position: "asc" }, select: { qty: true, description: true, kind: true } },
      },
    });
    if (!o) return null;
    return {
      number: o.number, createdAt: o.createdAt, kunde: o.company.name,
      routeLabel: o.route ? ROUTE_LABEL[o.route] ?? o.route : null,
      positionen: o.lines.map((l) => ({ menge: l.qty, bezeichnung: l.description, kind: l.kind as PositionKind })),
    };
  }

  async invoiceForPrint(id: string): Promise<InvoicePrintData | null> {
    const i = await prisma.invoice.findUnique({
      where: { id },
      select: {
        number: true, issuedAt: true, netCents: true, taxCents: true, grossCents: true,
        company: { select: { name: true, street: true, zip: true, city: true, country: true, vatId: true, customerNumber: true, betreuer: true } },
        order: { select: { deliveryAddress: { select: { street: true, zip: true, city: true } }, lines: { orderBy: { position: "asc" }, select: { qty: true, description: true, unitNetCents: true, listNetCents: true, rabattPct: true, variantId: true, ...LINE_STRUCT_SELECT } } } },
      },
    });
    if (!i) return null;
    const lines = i.order?.lines ?? [];
    const vmap = await loadVariantDetails(lines.map((l) => l.variantId));
    return {
      number: i.number, issuedAt: i.issuedAt,
      empfaenger: recipientLines(i.company, i.order?.deliveryAddress ?? null),
      positionen: lines.map((l) => ({ menge: l.qty, bezeichnung: l.description, einzelpreisCents: l.unitNetCents, listenpreisCents: l.listNetCents, rabattPct: l.rabattPct, ...lineExtras(l.variantId, vmap), ...lineStruct(l) })),
      netCents: i.netCents, taxCents: i.taxCents, grossCents: i.grossCents,
      meta: await this.buildMeta(i.company),
    };
  }

  async quoteForPrint(id: string): Promise<QuotePrintData | null> {
    const q = await prisma.quote.findUnique({
      where: { id },
      select: {
        number: true, createdAt: true, gueltigBisAm: true,
        company: { select: { name: true, street: true, zip: true, city: true, country: true, vatId: true, customerNumber: true, betreuer: true } },
        lines: { orderBy: { position: "asc" }, select: { qty: true, description: true, unitNetCents: true, listNetCents: true, rabattPct: true, variantId: true, ...LINE_STRUCT_SELECT } },
      },
    });
    if (!q) return null;
    const vmap = await loadVariantDetails(q.lines.map((l) => l.variantId));
    const positionen: PricePrintLine[] = q.lines.map((l) => ({ menge: l.qty, bezeichnung: l.description, einzelpreisCents: l.unitNetCents, listenpreisCents: l.listNetCents, rabattPct: l.rabattPct, ...lineExtras(l.variantId, vmap), ...lineStruct(l) }));
    return { number: q.number, datum: q.createdAt, empfaenger: recipientLines(q.company, null), positionen, ...totals(positionen), gueltigBis: q.gueltigBisAm, meta: await this.buildMeta(q.company) };
  }

  async inquiryForPrint(id: string): Promise<QuotePrintData | null> {
    const l = await prisma.crmLead.findUnique({
      where: { id },
      select: {
        name: true, text: true, createdAt: true, lines: true,
        company: { select: { name: true, street: true, zip: true, city: true, country: true, vatId: true, customerNumber: true, betreuer: true } },
      },
    });
    if (!l) return null;
    const raw = Array.isArray(l.lines) ? (l.lines as Array<{ description: string; qty: number; unitNetCents: number; variantId?: string | null }>) : [];
    const vmap = await loadVariantDetails(raw.map((x) => x.variantId ?? null));
    const positionen: PricePrintLine[] = raw.map((x) => ({ menge: x.qty, bezeichnung: x.description, einzelpreisCents: x.unitNetCents, ...lineExtras(x.variantId ?? null, vmap) }));
    const empfaenger = l.company ? recipientLines(l.company, null) : [l.name];
    return {
      number: `AF-${id.slice(-6).toUpperCase()}`, datum: l.createdAt, empfaenger, positionen,
      ...totals(positionen), gueltigBis: null, bedarf: l.text, meta: l.company ? await this.buildMeta(l.company) : undefined,
    };
  }

  async orderConfirmationForPrint(orderId: string): Promise<OrderConfirmationPrintData | null> {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        number: true, createdAt: true, zugesagterLiefertermin: true, externalNumber: true,
        company: { select: { name: true, street: true, zip: true, city: true, country: true, vatId: true, customerNumber: true, betreuer: true } },
        deliveryAddress: { select: { street: true, zip: true, city: true } },
        lines: { orderBy: { position: "asc" }, select: { qty: true, description: true, unitNetCents: true, listNetCents: true, rabattPct: true, variantId: true, ...LINE_STRUCT_SELECT } },
      },
    });
    if (!o) return null;
    const vmap = await loadVariantDetails(o.lines.map((l) => l.variantId));
    const positionen: PricePrintLine[] = o.lines.map((l) => ({ menge: l.qty, bezeichnung: l.description, einzelpreisCents: l.unitNetCents, listenpreisCents: l.listNetCents, rabattPct: l.rabattPct, ...lineExtras(l.variantId, vmap), ...lineStruct(l) }));
    return {
      number: o.number, datum: o.createdAt, empfaenger: recipientLines(o.company, o.deliveryAddress),
      positionen, ...totals(positionen), liefertermin: o.zugesagterLiefertermin, bestellreferenz: o.externalNumber,
      meta: await this.buildMeta(o.company),
    };
  }

  async veredelungsauftragForPrint(subProductionId: string): Promise<import("../modules/print/print.service.js").VeredelungsauftragPrintData | null> {
    const sub = await prisma.subProductionOrder.findUnique({
      where: { id: subProductionId },
      select: {
        number: true, beistellPositionen: true, beistellungVersandtAm: true, dueDate: true,
        supplier: { select: { name: true } },
        production: {
          select: {
            order: {
              select: {
                number: true, company: { select: { name: true } },
                lines: { orderBy: { position: "asc" }, select: { position: true, description: true, qty: true, kind: true, bezugPositionen: true, variantId: true, placement: true, positionType: true, positionSide: true, positionId: true, motiv: true, motivGroesse: true, farbton: true, platzierungsdetails: true, sonstiges: true } },
              },
            },
          },
        },
      },
    });
    if (!sub) return null;
    const order = sub.production.order;
    const scope = new Set(sub.beistellPositionen);
    const inScope = (pos: number | null): boolean => scope.size === 0 || (pos != null && scope.has(pos));

    // Textil-Beistellung (eine Größenzeile je Position) → Variantendetails (Art-Nr./Farbe/Größe/Bezeichnung).
    const textilLines = order.lines.filter((l) => l.kind === "TEXTIL" && inScope(l.position));
    const vrows = await prisma.variant.findMany({
      where: { id: { in: [...new Set(textilLines.map((l) => l.variantId).filter((v): v is string => !!v))] } },
      select: { id: true, sku: true, attributes: { select: { name: true, value: true } }, article: { select: { name: true } } },
    });
    const vmap = new Map(vrows.map((v) => [v.id, v]));
    const textilien = textilLines.map((l) => {
      const v = l.variantId ? vmap.get(l.variantId) : undefined;
      const attr = (n: string) => v?.attributes.find((a) => a.name === n)?.value ?? "";
      return {
        position: l.position,
        artNr: v?.sku ?? "",
        bezeichnung: v?.article.name ?? l.description,
        farbe: attr("Farbe"),
        groesse: attr("Größe"),
        menge: l.qty,
      };
    });

    // Veredelungspositionen (Motive) mit Bezug auf die beigestellten Textilpositionen.
    // Mehrere Bezüge möglich (B): die Veredelung gehört ins Werkstattblatt, wenn EINE der
    // referenzierten Textilpositionen beigestellt wird (oder gar keine Beistell-Scope-Einschränkung).
    const motive = order.lines
      .filter((l) => l.kind === "VEREDELUNG" && (scope.size === 0 || l.bezugPositionen.some((p) => scope.has(p))))
      .map((l) => ({
        description: l.description, bezugPositionen: l.bezugPositionen, menge: l.qty,
        ...(l.placement ? { platzierung: l.placement } : {}),
        ...(l.positionType ? { positionType: l.positionType as GarmentType } : {}),
        ...(l.positionSide ? { positionSide: l.positionSide } : {}),
        ...(l.positionId ? { positionId: l.positionId } : {}),
        ...(l.motiv ? { motiv: l.motiv } : {}),
        ...(l.motivGroesse ? { motivGroesse: l.motivGroesse } : {}),
        ...(l.farbton ? { farbton: l.farbton } : {}),
        ...(l.platzierungsdetails ? { platzierungsdetails: l.platzierungsdetails } : {}),
        ...(l.sonstiges ? { sonstiges: l.sonstiges } : {}),
      }));

    return {
      nummer: sub.number, datum: new Date(),
      veredler: sub.supplier?.name ?? null,
      kunde: order.company.name,
      kommission: order.number,
      textilien, motive,
      anlieferung: sub.beistellungVersandtAm ?? null,
      fertigstellung: sub.dueDate ?? null,
    };
  }
}
