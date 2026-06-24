import { describe, expect, it } from "vitest";
import { SettingsError, SettingsService } from "./settings.service.js";
import { InMemorySettingsRepository } from "../../repositories/in-memory-settings.repository.js";

class MemAudit { entries: unknown[] = []; async append(e: unknown): Promise<void> { this.entries.push(e); } }
const svc = () => new SettingsService(new InMemorySettingsRepository(), new MemAudit());

describe("SettingsService (Admin-Portal)", () => {
  it("liefert Defaults und speichert Briefkopf + Schwellen + Faktor", async () => {
    const s = svc();
    const def = await s.get();
    expect(def.briefkopf).toEqual([]);
    expect(def.markupFactor).toBe(1.88);

    await s.update({ briefkopf: ["TEXMA GmbH", "Musterstr. 1", "info@texma.de"], maxDiscountPct: 15, maxOrderValueEuro: 5000, markupFactor: 2.0 });
    const after = await s.get();
    expect(after.briefkopf).toHaveLength(3);
    expect(after.maxDiscountPct).toBe(15);
    expect(after.maxOrderValueEuro).toBe(5000);
    expect(after.markupFactor).toBe(2.0);
  });

  it("Briefkopf als Zeilen abrufbar (für PDF)", async () => {
    const s = svc();
    await s.update({ briefkopf: ["A", "B"] });
    expect(await s.briefkopf()).toEqual(["A", "B"]);
  });

  it("lehnt ungültigen Aufschlagsfaktor ab", async () => {
    await expect(svc().update({ markupFactor: 0 })).rejects.toBeInstanceOf(SettingsError);
  });

  it("speichert den Standard-Siebdruck-Veredler und liest ihn operativ", async () => {
    const s = svc();
    expect((await s.get()).siebdruckVeredlerId).toBeNull();
    await s.update({ siebdruckVeredlerId: "sup_siebdruck" });
    expect((await s.get()).siebdruckVeredlerId).toBe("sup_siebdruck");
    expect(await s.siebdruckVeredlerId()).toBe("sup_siebdruck");
    await s.update({ siebdruckVeredlerId: null }); // zurücksetzen
    expect(await s.siebdruckVeredlerId()).toBeNull();
  });
});
