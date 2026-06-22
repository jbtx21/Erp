import { describe, expect, it } from "vitest";
import { DataIoService } from "./dataio.service.js";
import { InMemoryDataIoRepository } from "../../repositories/in-memory-dataio.repository.js";

class MemAudit {
  entries: unknown[] = [];
  async append(e: unknown): Promise<void> { this.entries.push(e); }
}

function setup(): { svc: DataIoService; repo: InMemoryDataIoRepository; audit: MemAudit } {
  const repo = new InMemoryDataIoRepository();
  const audit = new MemAudit();
  return { svc: new DataIoService(repo, audit), repo, audit };
}

describe("DataIoService (Stammdaten-Im-/Export)", () => {
  it("importiert Artikel (create) und re-importiert idempotent (update)", async () => {
    const { svc, repo } = setup();
    const csv = "Artikelnummer;Bezeichnung;Marke\nA-1;Polo;TX\nA-2;Cap;TX";
    const r1 = await svc.importCsv("ARTICLE", csv);
    expect(r1).toMatchObject({ created: 2, updated: 0, skipped: 0 });
    expect(repo.articles).toHaveLength(2);
    const r2 = await svc.importCsv("ARTICLE", "Artikelnummer;Bezeichnung\nA-1;Polo Neu");
    expect(r2).toMatchObject({ created: 0, updated: 1 });
    expect(repo.articles.find((a) => a.sku === "A-1")?.name).toBe("Polo Neu");
  });

  it("Export → Import-Roundtrip erhält die Daten", async () => {
    const { svc } = setup();
    await svc.importCsv("SUPPLIER", "Lieferantenname;USt-IdNr.;IBAN\nStanley;DE123;DE89370400440532013000");
    const csv = await svc.exportCsv("SUPPLIER");
    const { svc: svc2, repo: repo2 } = setup();
    await svc2.importCsv("SUPPLIER", csv);
    expect(repo2.suppliers[0]).toMatchObject({ name: "Stanley", vatId: "DE123" });
  });

  it("überspringt Kunden mit unbekannter Preisgruppe (kein Phantom)", async () => {
    const { svc } = setup();
    const r = await svc.importCsv("COMPANY", "Firmenname;Preisgruppe\nGut GmbH;STANDARD\nBöse AG;UNBEKANNT");
    expect(r).toMatchObject({ created: 1, skipped: 1 });
  });

  it("meldet fehlerhafte Zeilen und schreibt Audit", async () => {
    const { svc, audit } = setup();
    const r = await svc.importCsv("ARTICLE", "Artikelnummer;Bezeichnung\n;Ohne SKU\nA-9;OK");
    expect(r.created).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(audit.entries).toHaveLength(1);
  });
});
