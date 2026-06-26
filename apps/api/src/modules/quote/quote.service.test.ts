// Vollständige Bearbeitung eines Angebots (Kopf + Positionen) vor der Wandlung in einen
// Auftrag. In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { QuoteError, QuoteService } from "./quote.service.js";
import { InMemoryQuoteRepository } from "../../repositories/in-memory-quote.repository.js";
import { NumberingService } from "../numbering/numbering.service.js";
import { InMemoryNumberingRepository } from "../../repositories/in-memory-numbering.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }
const setup = () => {
  const repo = new InMemoryQuoteRepository();
  return { repo, svc: new QuoteService(repo, new NumberingService(new InMemoryNumberingRepository()), new MemAudit()) };
};

describe("QuoteService.update (vollständige Bearbeitung)", () => {
  it("ersetzt Positionen und Kopfdaten und liest sie wieder", async () => {
    const { svc } = setup();
    const { id } = await svc.create({ companyId: "co-1", lines: [{ description: "Polo", qty: 10, unitNetCents: 1200 }] });
    await svc.update(id, {
      companyId: "co-2", terms: "AGB v2",
      lines: [
        { description: "Polo bestickt", qty: 20, unitNetCents: 1350, listNetCents: 1500, rabattPct: 10, kind: "TEXTIL", dbCents: 600 },
        { description: "Versand", qty: 1, unitNetCents: 590, kind: "SONSTIGE" },
      ],
    });
    const edit = await svc.getForEdit(id);
    expect(edit.companyId).toBe("co-2");
    expect(edit.terms).toBe("AGB v2");
    expect(edit.lines).toHaveLength(2);
    expect(edit.lines[0]).toMatchObject({ qty: 20, unitNetCents: 1350, listNetCents: 1500, rabattPct: 10, dbCents: 600 });
  });

  it("blockt die Bearbeitung, sobald das Angebot in einen Auftrag gewandelt wurde (ANGENOMMEN)", async () => {
    const { repo, svc } = setup();
    const { id } = await svc.create({ companyId: "co-1", lines: [{ description: "Polo", qty: 10, unitNetCents: 1200 }] });
    await repo.setStatus(id, "ANGENOMMEN");
    await expect(svc.update(id, { companyId: "co-1", lines: [{ description: "X", qty: 1, unitNetCents: 100 }] }))
      .rejects.toBeInstanceOf(QuoteError);
  });

  it("verlangt mindestens eine Position", async () => {
    const { svc } = setup();
    const { id } = await svc.create({ companyId: "co-1", lines: [{ description: "Polo", qty: 10, unitNetCents: 1200 }] });
    await expect(svc.update(id, { companyId: "co-1", lines: [] })).rejects.toBeInstanceOf(QuoteError);
  });

  it("wirft für ein unbekanntes Angebot", async () => {
    const { svc } = setup();
    await expect(svc.getForEdit("nope")).rejects.toBeInstanceOf(QuoteError);
  });
});

describe("QuoteService.transition — 0-€-/Leer-Schutz (P0-2)", () => {
  it("blockt VERSENDET bei Netto 0 €", async () => {
    const { svc } = setup();
    const { id } = await svc.create({ companyId: "co-1", lines: [{ description: "Gratis", qty: 1, unitNetCents: 0 }] });
    await expect(svc.transition(id, "VERSENDET")).rejects.toBeInstanceOf(QuoteError);
  });

  it("blockt auch ANGENOMMEN bei Netto 0 € (defensiv, falls VERSENDET umgangen wurde)", async () => {
    const { repo, svc } = setup();
    const { id } = await svc.create({ companyId: "co-1", lines: [{ description: "Gratis", qty: 1, unitNetCents: 0 }] });
    await repo.setStatus(id, "VERSENDET");
    await expect(svc.transition(id, "ANGENOMMEN")).rejects.toBeInstanceOf(QuoteError);
  });

  it("lässt werthaltige Angebote normal versenden", async () => {
    const { svc } = setup();
    const { id } = await svc.create({ companyId: "co-1", lines: [{ description: "Polo", qty: 10, unitNetCents: 1290 }] });
    await expect(svc.transition(id, "VERSENDET")).resolves.toBeUndefined();
  });
});
