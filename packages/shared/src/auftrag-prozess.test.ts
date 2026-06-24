import { describe, expect, it } from "vitest";
import { computeAuftragProzess, type AuftragProzessFacts } from "./auftrag-prozess.js";

const base: AuftragProzessFacts = {
  status: "ANGELEGT",
  route: "ROUTE3_EXTERN",
  terminSet: false,
  hasPurchaseOrder: false,
  hasGoodsReceipt: false,
  subCount: 0,
  subBeigestellt: 0,
  subZurueck: 0,
  fakturastatus: "NICHT",
  lieferstatus: "NICHT",
};

const state = (rows: ReturnType<typeof computeAuftragProzess>, key: string): string =>
  rows.find((s) => s.key === key)!.state;

describe("computeAuftragProzess", () => {
  it("frischer Auftrag: angelegt DONE, Ware bestellt ist der aktive Schritt", () => {
    const r = computeAuftragProzess(base);
    expect(state(r, "angelegt")).toBe("DONE");
    expect(state(r, "bestellt")).toBe("AKTIV");
    expect(state(r, "versendet")).toBe("OFFEN");
  });

  it("Bestellung + Termin gesetzt → nächster aktiver Schritt = Veredlerauftrag", () => {
    const r = computeAuftragProzess({ ...base, hasPurchaseOrder: true, terminSet: true });
    expect(state(r, "bestellt")).toBe("DONE");
    expect(state(r, "termin")).toBe("DONE");
    expect(state(r, "veredler_auftrag")).toBe("AKTIV");
  });

  it("Route 1 (keine Veredelung): Veredler-Stufen sind NA", () => {
    const r = computeAuftragProzess({ ...base, route: "ROUTE1_KEINE" });
    expect(state(r, "veredler_auftrag")).toBe("NA");
    expect(state(r, "veredelung")).toBe("NA");
    expect(state(r, "ruecklauf")).toBe("NA");
  });

  it("inhouse (Route 2): Veredelung an Produktionsstatus, kein externer Veredlerauftrag", () => {
    const r = computeAuftragProzess({ ...base, route: "ROUTE2_INTERN", status: "IN_PRODUKTION" });
    expect(state(r, "veredler_auftrag")).toBe("NA");
    expect(state(r, "veredelung")).toBe("DONE");
  });

  it("externer Rücklauf vollständig → Rücklauf DONE", () => {
    const r = computeAuftragProzess({ ...base, subCount: 2, subBeigestellt: 2, subZurueck: 2 });
    expect(state(r, "veredelung")).toBe("DONE");
    expect(state(r, "ruecklauf")).toBe("DONE");
  });

  it("versandbereit → QK & versandfertig DONE", () => {
    const r = computeAuftragProzess({ ...base, status: "VERSANDBEREIT" });
    expect(state(r, "qk")).toBe("DONE");
    expect(state(r, "versandfertig")).toBe("DONE");
  });

  it("fakturiert/versendet aus Status abgeleitet", () => {
    const r = computeAuftragProzess({ ...base, status: "VERSENDET", fakturastatus: "VOLL", lieferstatus: "VOLL" });
    expect(state(r, "fakturiert")).toBe("DONE");
    expect(state(r, "versendet")).toBe("DONE");
  });

  it("storniert: nur 'angelegt' bleibt, Rest offen", () => {
    const r = computeAuftragProzess({ ...base, status: "STORNIERT", hasPurchaseOrder: true });
    expect(state(r, "angelegt")).toBe("DONE");
    expect(state(r, "bestellt")).toBe("OFFEN");
  });
});
