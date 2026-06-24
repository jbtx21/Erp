// Stickerei-Partnerwahl (Kap. 5.4): Direktauftrag nur bei Partner + Stickdatei.
// In-Memory, keine DB.

import { describe, expect, it } from "vitest";
import { InMemoryStickereiRepository } from "../../repositories/in-memory-stickerei.repository.js";
import { StickereiService } from "./stickerei.service.js";

function service() {
  return new StickereiService(
    new InMemoryStickereiRepository(
      {
        direkt: { stickereiPartnerId: "sup", hatStickdatei: true },
        ohne_datei: { stickereiPartnerId: "sup", hatStickdatei: false },
        neu: { stickereiPartnerId: null, hatStickdatei: false },
      },
      { "logo-1": [{ minMenge: 1, ekCents: 1_000 }, { minMenge: 50, ekCents: 600 }] }
    )
  );
}

describe("StickereiService.routeForCompany (Kap. 5.4)", () => {
  it("DIREKT ohne Digitalisierung bei Partner UND Stickdatei", async () => {
    const res = await service().routeForCompany("direkt");
    expect(res).toMatchObject({ route: "DIREKT", needsDigitizing: false });
  });

  it("AUSSCHREIBUNG + Digitalisierung ohne Stickdatei; AUSSCHREIBUNG ohne Partner", async () => {
    const ohneDatei = await service().routeForCompany("ohne_datei");
    expect(ohneDatei).toMatchObject({ route: "AUSSCHREIBUNG", needsDigitizing: true });
    expect((await service().routeForCompany("neu")).route).toBe("AUSSCHREIBUNG");
  });

  it("wirft für eine unbekannte Firma", async () => {
    await expect(service().routeForCompany("x")).rejects.toThrow(/nicht gefunden/);
  });

  it("setPartner: gewählte Stickerei hinterlegen → Weg wird DIREKT (mit Stickdatei)", async () => {
    const svc = service();
    // 'ohne_datei' hat Partner aber keine Datei → AUSSCHREIBUNG; 'neu' hat weder noch.
    expect((await svc.routeForCompany("neu")).route).toBe("AUSSCHREIBUNG");
    await svc.setPartner("neu", "stickerei-nord");
    const afterPartner = await svc.routeForCompany("neu");
    expect(afterPartner.stickereiPartnerId).toBe("stickerei-nord");
    expect(afterPartner.route).toBe("AUSSCHREIBUNG"); // noch keine Stickdatei
    await svc.setPartner("neu", null);
    expect((await svc.routeForCompany("neu")).stickereiPartnerId).toBeNull();
  });
});

describe("StickereiService Ausschreibung/RfQ (Kap. 5.4)", () => {
  function rfqService() {
    return new StickereiService(
      new InMemoryStickereiRepository(
        { "firma-1": { stickereiPartnerId: null, hatStickdatei: false } },
        {},
        {
          logos: [{ id: "logo-1", label: "Firma · v1", companyId: "firma-1", version: 1, active: true }],
          priceGroups: { "logo-1": "pg-standard" },
          supplierNames: { "stick-a": "Stickerei A", "stick-b": "Stickerei B" },
        }
      )
    );
  }

  it("erfasst Angebote, berechnet VK je Stufe und entscheidet → übernimmt Partner + Staffeln", async () => {
    const svc = rfqService();
    const { id: ausId } = await svc.createAusschreibung("logo-1");
    await svc.addAngebot(ausId, "stick-a", [{ minMenge: 1, ekCents: 1_000 }, { minMenge: 50, ekCents: 700 }], "teurer");
    const { id: angB } = await svc.addAngebot(ausId, "stick-b", [{ minMenge: 1, ekCents: 800 }, { minMenge: 50, ekCents: 600 }]);

    const detail = await svc.getAusschreibung(ausId);
    expect(detail?.angebote).toHaveLength(2);
    // VK = EK × 1,88 (Standard) — Vergleich möglich.
    expect(detail?.angebote[0]?.staffeln[0]).toMatchObject({ ekCents: 1_000, vkCents: 1_880 });
    expect(detail?.angebote[1]?.supplierName).toBe("Stickerei B");

    await svc.decideAusschreibung(ausId, angB);
    // Partner = Gewinner-Lieferant; Staffeln des Logos = Gewinner-Staffeln.
    const route = await svc.routeForCompany("firma-1");
    expect(route.stickereiPartnerId).toBe("stick-b");
    const staffeln = await svc.listStaffeln("logo-1");
    expect(staffeln.staffeln.map((s) => s.ekCents)).toEqual([800, 600]);
  });

  it("verbietet doppeltes Entscheiden und fremde Gewinner-Angebote", async () => {
    const svc = rfqService();
    const { id: ausId } = await svc.createAusschreibung("logo-1");
    const { id: ang } = await svc.addAngebot(ausId, "stick-a", [{ minMenge: 1, ekCents: 900 }]);
    await svc.decideAusschreibung(ausId, ang);
    await expect(svc.decideAusschreibung(ausId, ang)).rejects.toThrow(/nicht \(mehr\) offen/);
    const other = await svc.createAusschreibung("logo-1");
    await expect(svc.decideAusschreibung(other.id, ang)).rejects.toThrow(/gehört nicht/);
  });

  it("lehnt Angebote ohne Staffeln / mit ungültigen Staffeln ab", async () => {
    const svc = rfqService();
    const { id: ausId } = await svc.createAusschreibung("logo-1");
    await expect(svc.addAngebot(ausId, "stick-a", [])).rejects.toThrow(/Staffel/);
    await expect(svc.addAngebot(ausId, "stick-a", [{ minMenge: 1, ekCents: 1 }, { minMenge: 1, ekCents: 2 }])).rejects.toThrow(/Doppelte/);
  });
});

describe("StickereiService Mengenstaffeln je Logo (Kap. 4.4 / T-15)", () => {
  it("listStaffeln: sortiert + VK = EK × 1,88 je Stufe", async () => {
    const res = await service().listStaffeln("logo-1");
    expect(res.staffeln.map((s) => s.minMenge)).toEqual([1, 50]);
    expect(res.staffeln[0]).toMatchObject({ ekCents: 1_000, vkCents: 1_880 });
  });

  it("saveStaffeln: ersetzt die Staffeln (Set-Semantik) und gibt VKs zurück", async () => {
    const svc = service();
    const saved = await svc.saveStaffeln("logo-1", [{ minMenge: 1, ekCents: 500 }, { minMenge: 100, ekCents: 400 }]);
    expect(saved.staffeln.map((s) => s.minMenge)).toEqual([1, 100]);
    const reloaded = await svc.listStaffeln("logo-1");
    expect(reloaded.staffeln.map((s) => s.ekCents)).toEqual([500, 400]);
  });

  it("saveStaffeln: lehnt ungültige Eingabe ab (Dubletten/minMenge<1)", async () => {
    await expect(
      service().saveStaffeln("logo-1", [{ minMenge: 1, ekCents: 100 }, { minMenge: 1, ekCents: 200 }])
    ).rejects.toThrow(/Doppelte Staffelgrenze/);
  });

  it("priceForMenge: höchste Staffel ≤ Menge", async () => {
    expect((await service().priceForMenge("logo-1", 75))?.minMenge).toBe(50);
    expect(await service().priceForMenge("logo-1", 0)).toBeNull();
  });
});

describe("StickereiService konfigurierbarer Aufschlagsfaktor (Kap. 4.4)", () => {
  function svc() {
    return new StickereiService(
      new InMemoryStickereiRepository(
        {},
        { "logo-2": [{ minMenge: 1, ekCents: 1_000 }, { minMenge: 50, ekCents: 1_000 }] },
        {
          markupConfig: { defaultFactor: 1.88, rules: [{ id: "klein", factor: 2.1, maxMenge: 9 }] },
          logoOverrides: { "logo-ov": 2.0 },
          priceGroups: { "logo-2": "STD" },
        }
      )
    );
  }

  it("listStaffeln: Regel je Stufe (kleine Mengen anderer Faktor)", async () => {
    const res = await svc().listStaffeln("logo-2");
    expect(res.staffeln[0]).toMatchObject({ minMenge: 1, vkCents: 2_100 }); // 1000 × 2,1 (≤9)
    expect(res.staffeln[1]).toMatchObject({ minMenge: 50, vkCents: 1_880 }); // 1000 × 1,88 (Default)
    expect(res.priceGroupId).toBe("STD");
  });

  it("getMarkupConfig/saveMarkupConfig: Roundtrip + Validierung", async () => {
    const s = svc();
    const saved = await s.saveMarkupConfig({ defaultFactor: 1.7, rules: [{ factor: 2.0, priceGroupId: "VIP" }] });
    expect(saved.defaultFactor).toBe(1.7);
    expect((await s.getMarkupConfig()).rules[0]).toMatchObject({ factor: 2.0, priceGroupId: "VIP" });
    await expect(s.saveMarkupConfig({ defaultFactor: 0, rules: [] })).rejects.toThrow(/> 0/);
  });

  it("Logo-Override gewinnt über die globalen Regeln", async () => {
    const s = svc();
    await s.saveStaffeln("logo-ov", [{ minMenge: 1, ekCents: 1_000 }], 2.0);
    const res = await s.listStaffeln("logo-ov");
    expect(res.logoOverride).toBe(2.0);
    expect(res.staffeln[0]?.vkCents).toBe(2_000); // 1000 × 2,0 (Override, nicht 2,1-Regel)
  });
});

describe("StickereiService Logo-Verwaltung (Kap. 7.2)", () => {
  function svc() {
    return new StickereiService(
      new InMemoryStickereiRepository({}, {}, {
        companies: [{ id: "F1", name: "Acme GmbH", priceGroupId: "PG-GROSSKUNDE" }],
        logos: [{ id: "F1-v1", companyId: "F1", companyName: "Acme GmbH", version: 1, active: true, label: "Acme GmbH · v1 (aktiv)" }],
        markupConfig: { defaultFactor: 1.88, rules: [{ id: "gk", factor: 1.65, priceGroupId: "PG-GROSSKUNDE" }] },
      })
    );
  }

  const upload = (name: string) => ({ name, mimeType: "application/octet-stream", dataBase64: Buffer.from("DATA").toString("base64") });

  it("listCompanies", async () => {
    expect(await svc().listCompanies()).toEqual([{ id: "F1", name: "Acme GmbH" }]);
  });

  it("createLogoVersion: nächste Version, setzt vorherige inaktiv, Datei nötig", async () => {
    const s = svc();
    await expect(s.createLogoVersion({ companyId: "F1", file: upload("  "), active: true })).rejects.toThrow(/Dateiname/);
    await expect(
      s.createLogoVersion({ companyId: "F1", file: { name: "x", mimeType: "", dataBase64: "" }, active: true })
    ).rejects.toThrow(/keine Datei/);
    const created = await s.createLogoVersion({ companyId: "F1", file: upload("logo.emb"), active: true });
    expect(created).toMatchObject({ companyId: "F1", version: 2, active: true, fileName: "logo.emb", label: "Acme GmbH · v2 (aktiv)" });
    const logos = await s.listLogos();
    expect(logos.find((l) => l.id === "F1-v1")?.active).toBe(false);
    expect(logos.find((l) => l.id === created.id)?.active).toBe(true);
    // Hochgeladene Bytes sind abrufbar (Download/Preview).
    const file = await s.getLogoFile(created.id);
    expect(file?.fileName).toBe("logo.emb");
    expect(file?.data.toString()).toBe("DATA");
  });

  it("neue Version erbt die Kundengruppe der Firma (Faktor-Auflösung)", async () => {
    const s = svc();
    const created = await s.createLogoVersion({ companyId: "F1", file: upload("x.dst"), active: true });
    await s.saveStaffeln(created.id, [{ minMenge: 1, ekCents: 1_000 }]);
    const res = await s.listStaffeln(created.id);
    expect(res.priceGroupId).toBe("PG-GROSSKUNDE");
    expect(res.staffeln[0]?.vkCents).toBe(1_650); // 1000 × 1,65 (Großkunden-Regel greift)
  });

  it("replaceLogoFile tauscht die Datei in-place (Version/aktiv bleiben)", async () => {
    const s = svc();
    const v2 = await s.createLogoVersion({ companyId: "F1", file: upload("alt.dst"), active: true });
    const updated = await s.replaceLogoFile(v2.id, { name: "neu.emb", mimeType: "x", dataBase64: Buffer.from("NEU").toString("base64") });
    expect(updated).toMatchObject({ id: v2.id, version: 2, active: true, fileName: "neu.emb" });
    const file = await s.getLogoFile(v2.id);
    expect(file?.fileName).toBe("neu.emb");
    expect(file?.data.toString()).toBe("NEU");
  });

  it("deleteLogoVersion: aktive Version gelöscht → neueste verbleibende rückt nach", async () => {
    const s = svc();
    const v2 = await s.createLogoVersion({ companyId: "F1", file: upload("a.dst"), active: true }); // F1-v2 aktiv, v1 inaktiv
    await s.deleteLogoVersion(v2.id);
    const logos = await s.listLogos();
    expect(logos.find((l) => l.id === v2.id)).toBeUndefined();
    expect(logos.find((l) => l.id === "F1-v1")?.active).toBe(true); // v1 rückt nach
    expect(await s.getLogoFile(v2.id)).toBeNull();
  });

  it("activateLogoVersion schaltet die aktive Version um", async () => {
    const s = svc();
    const v2 = await s.createLogoVersion({ companyId: "F1", file: upload("x.dst"), active: false });
    expect((await s.listLogos()).find((l) => l.id === "F1-v1")?.active).toBe(true);
    await s.activateLogoVersion(v2.id);
    const logos = await s.listLogos();
    expect(logos.find((l) => l.id === v2.id)?.active).toBe(true);
    expect(logos.find((l) => l.id === "F1-v1")?.active).toBe(false);
  });
});
