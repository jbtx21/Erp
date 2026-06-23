import { describe, expect, it } from "vitest";
import { PrintError, PrintService } from "./print.service.js";
import { InMemoryPrintRepository } from "../../repositories/in-memory-print.repository.js";

function isPdf(base64: string): boolean {
  return Buffer.from(base64, "base64").subarray(0, 5).toString("latin1") === "%PDF-";
}

describe("PrintService (Druckerzeugnisse)", () => {
  it("erzeugt ein Lieferschein-PDF", async () => {
    const repo = new InMemoryPrintRepository();
    repo.deliveryNotes["ls-1"] = {
      number: "LS-2026-0001", createdAt: new Date("2026-06-22"),
      empfaenger: ["Muster GmbH", "Musterweg 2", "12345 Musterstadt"],
      positionen: [{ menge: 5, bezeichnung: "Poloshirt blau M" }],
    };
    const res = await new PrintService(repo).deliveryNotePdf("ls-1");
    expect(res.filename).toBe("Lieferschein-LS-2026-0001.pdf");
    expect(isPdf(res.base64)).toBe(true);
    expect(res.base64.length).toBeGreaterThan(100);
  });

  it("erzeugt ein Rechnungs-PDF mit Summen", async () => {
    const repo = new InMemoryPrintRepository();
    repo.invoices["re-1"] = {
      number: "RE-2026-0001", issuedAt: new Date("2026-06-22"), empfaenger: ["Muster GmbH"],
      positionen: [{ menge: 3, bezeichnung: "Cap", einzelpreisCents: 1000 }],
      netCents: 3000, taxCents: 570, grossCents: 3570,
    };
    const res = await new PrintService(repo).invoicePdf("re-1");
    expect(res.filename).toBe("Rechnung-RE-2026-0001.pdf");
    expect(isPdf(res.base64)).toBe(true);
  });

  it("wirft bei unbekanntem Beleg", async () => {
    await expect(new PrintService(new InMemoryPrintRepository()).deliveryNotePdf("nope")).rejects.toBeInstanceOf(PrintError);
  });
});

describe("PrintService.laufzettelPdf", () => {
  it("erzeugt ein Laufzettel-PDF aus den Auftragspositionen", async () => {
    const { InMemoryPrintRepository } = await import("../../repositories/in-memory-print.repository.js");
    const repo = new InMemoryPrintRepository();
    repo.laufzettel["ord-1"] = {
      number: "AB-2026-0001", createdAt: new Date("2026-06-22"), kunde: "Muster GmbH", routeLabel: "Route 2 – interne Veredelung",
      positionen: [{ menge: 100, bezeichnung: "Polo", kind: "TEXTIL" }, { menge: 100, bezeichnung: "Stick", kind: "VEREDELUNG" }],
    };
    const res = await new PrintService(repo).laufzettelPdf("ord-1");
    expect(res.filename).toBe("Laufzettel-AB-2026-0001.pdf");
    expect(Buffer.from(res.base64, "base64").subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
