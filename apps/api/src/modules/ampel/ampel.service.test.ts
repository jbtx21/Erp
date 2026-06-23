// Terminübersicht/Ampel (Kap. 35.4): Sortierung ROT→GELB→GRÜN, dann Restlaufzeit.
// In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { InMemoryAmpelRepository } from "../../repositories/in-memory-ampel.repository.js";
import { AmpelService } from "./ampel.service.js";

describe("AmpelService.overview (Kap. 35.4)", () => {
  it("sortiert nach Dringlichkeit (überfällig zuerst) und setzt die Ampel", async () => {
    const repo = new InMemoryAmpelRepository([
      { id: "ok", level: "AUFTRAG", label: "AB-1", dueDate: new Date(Date.UTC(2026, 11, 1)), done: false },
      { id: "late", level: "PRODUKTION", label: "PA-1", dueDate: new Date(Date.UTC(2026, 4, 1)), done: false },
      { id: "soon", level: "VEREDLER", label: "PA-1-a", dueDate: new Date(Date.UTC(2026, 5, 16)), done: false },
    ]);
    const rows = await new AmpelService(repo).overview(new Date(Date.UTC(2026, 5, 15)));
    expect(rows.map((r) => r.id)).toEqual(["late", "soon", "ok"]);
    expect(rows.map((r) => r.ampel)).toEqual(["ROT", "GELB", "GRUEN"]);
  });

  it("zeigt erledigte Vorgänge als GRÜN (kein Terminrisiko)", async () => {
    const repo = new InMemoryAmpelRepository([
      { id: "done", level: "PRODUKTION", label: "PA-2", dueDate: new Date(Date.UTC(2026, 0, 1)), done: true },
    ]);
    expect((await new AmpelService(repo).overview(new Date(Date.UTC(2026, 5, 15))))[0]?.ampel).toBe("GRUEN");
  });

  it("Arbeitsliste (K-17): Tabellenmodell mit einer Zeile je Vorgang", async () => {
    const repo = new InMemoryAmpelRepository([
      { id: "late", level: "PRODUKTION", label: "PA-1", dueDate: new Date(Date.UTC(2026, 4, 1)), done: false },
      { id: "ok", level: "AUFTRAG", label: "AB-1", dueDate: new Date(Date.UTC(2026, 11, 1)), done: false },
    ]);
    const wl = await new AmpelService(repo).worklist(new Date(Date.UTC(2026, 5, 15)));
    expect(wl.columns[0]).toBe("Ebene");
    expect(wl.rows).toHaveLength(2);
    expect(wl.rows[0]?.[3]).toBe("Überfällig");
  });

  it("Arbeitsliste als PDF: liefert Dateiname + base64-PDF (%PDF-Header)", async () => {
    const repo = new InMemoryAmpelRepository([
      { id: "ok", level: "AUFTRAG", label: "AB-1", dueDate: new Date(Date.UTC(2026, 11, 1)), done: false },
    ]);
    const res = await new AmpelService(repo).worklistPdf(new Date(Date.UTC(2026, 5, 15)));
    expect(res.fileName).toBe("termin-ampel-2026-06-15.pdf");
    expect(Buffer.from(res.pdfBase64, "base64").subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});
