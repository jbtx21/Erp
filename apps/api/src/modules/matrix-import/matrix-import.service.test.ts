import { describe, expect, it } from "vitest";
import { MatrixImportService, MatrixImportError } from "./matrix-import.service.js";
import { InMemoryMatrixImportRepository } from "../../repositories/in-memory-matrix-import.repository.js";
import { MemoryAuditSink } from "../../audit/memory-audit-sink.js";

const HEADER = "Artikelnummer;Bezeichnung;Farbe;Größe;Lieferantennummer;EK netto";

function make() {
  const repo = new InMemoryMatrixImportRepository();
  const audit = new MemoryAuditSink();
  return { repo, audit, svc: new MatrixImportService(repo, audit) };
}

describe("MatrixImportService.preview", () => {
  it("klassifiziert gegen den Bestand (Artikel/Variante vorhanden vs. neu)", async () => {
    const { repo, svc } = make();
    const artId = repo.seedArticle("POLO-01", "Polo");
    repo.seedVariant(artId, "Navy", "M");
    const csv = [HEADER, "POLO-01;Polo;Navy;M;;", "POLO-01;Polo;Navy;L;;"].join("\n");
    const plan = await svc.preview(csv);
    expect(plan.rows[0]).toMatchObject({ articleStatus: "vorhanden", variantStatus: "vorhanden" });
    expect(plan.rows[1]!.variantStatus).toBe("neu");
    expect(plan.newVariants).toBe(1);
  });
});

describe("MatrixImportService.apply", () => {
  it("legt neuen Hauptartikel + Matrix-Varianten an und ist idempotent", async () => {
    const { repo, svc } = make();
    const csv = [HEADER,
      "POLO-01;Premium Polo;Navy;M;;",
      "POLO-01;Premium Polo;Navy;L;;",
      "POLO-01;Premium Polo;Weiß;M;;",
    ].join("\n");
    const first = await svc.apply(csv);
    expect(first).toMatchObject({ articlesCreated: 1, variantsCreated: 3, variantsSkipped: 0 });
    // Zweiter Lauf: nichts Neues (Idempotenz über generateMatrixVariants).
    const second = await svc.apply(csv);
    expect(second).toMatchObject({ articlesCreated: 0, variantsCreated: 0, variantsSkipped: 3 });
  });

  it("verknüpft EK + Lieferanten-SKU je Zeile mit dem gewählten Lieferanten", async () => {
    const { repo, svc } = make();
    repo.addSupplier("sup-1");
    const csv = [HEADER,
      "POLO-01;Polo;Navy;M;SS-100;9,90",
      "POLO-01;Polo;Navy;L;SS-101;9,90",
    ].join("\n");
    const res = await svc.apply(csv, { ek: { supplierId: "sup-1" } });
    expect(res.variantsCreated).toBe(2);
    expect(res.ekLinked).toBe(2);
    const items = repo.supplierItemsFor("sup-1");
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.ekCents).sort()).toEqual([990, 990]);
    expect(items.map((i) => i.supplierSku).sort()).toEqual(["SS-100", "SS-101"]);
  });

  it("schreibt eine GoBD-Audit-Zusammenfassung", async () => {
    const { audit, svc } = make();
    await svc.apply([HEADER, "POLO-01;Polo;Navy;M;;"].join("\n"));
    expect(audit.entries.at(-1)).toMatchObject({ entity: "MatrixImport", action: "CREATE" });
  });

  it("lehnt einen unbekannten EK-Lieferanten ab", async () => {
    const { svc } = make();
    await expect(svc.apply([HEADER, "POLO-01;Polo;Navy;M;;9,90"].join("\n"), { ek: { supplierId: "ghost" } }))
      .rejects.toBeInstanceOf(MatrixImportError);
  });
});
