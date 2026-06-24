import { describe, expect, it } from "vitest";
import { buildTrackingUrl, buildTrackingEmail } from "./tracking.js";

describe("buildTrackingUrl", () => {
  it("baut den Carrier-spezifischen Link mit eingesetzter Nummer", () => {
    expect(buildTrackingUrl("DPD", "01234567890")).toContain("dpd.de");
    expect(buildTrackingUrl("DPD", "01234567890")).toContain("01234567890");
    expect(buildTrackingUrl("DHL", "TN1")).toContain("dhl.de");
    expect(buildTrackingUrl("GLS", "TN1")).toContain("gls-group.com");
  });
  it("encodet die Trackingnummer", () => {
    expect(buildTrackingUrl("UPS", "a b/c")).toContain("a%20b%2Fc");
  });
  it("gibt null ohne Vorlage (SONSTIGE) oder fehlende Angaben", () => {
    expect(buildTrackingUrl("SONSTIGE", "TN1")).toBeNull();
    expect(buildTrackingUrl("DPD", null)).toBeNull();
    expect(buildTrackingUrl(null, "TN1")).toBeNull();
  });
});

describe("buildTrackingEmail", () => {
  it("VERSENDET erzeugt Versandmail mit Nummer + Link", () => {
    const mail = buildTrackingEmail({ orderNumber: "AB-7", status: "VERSENDET", customerName: "Muster GmbH", trackingNumber: "TN1", trackingUrl: "https://x/TN1", carrier: "DPD" });
    expect(mail?.subject).toContain("AB-7");
    expect(mail?.body).toContain("TN1");
    expect(mail?.body).toContain("https://x/TN1");
    expect(mail?.body).toContain("Muster GmbH");
  });
  it("STORNIERT erzeugt Stornomail", () => {
    const mail = buildTrackingEmail({ orderNumber: "AB-7", status: "STORNIERT" });
    expect(mail?.subject).toContain("storniert");
  });
  it("liefert null für Status ohne Kunden-Mail", () => {
    expect(buildTrackingEmail({ orderNumber: "AB-7", status: "IN_PRODUKTION" })).toBeNull();
  });
});
