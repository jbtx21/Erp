import { describe, expect, it } from "vitest";
import {
  type ArchivedDocMeta,
  assertWormConsistent,
  buildGobdIndexXml,
  buildGobdManifestCsv,
  earliestDeletionDate,
  retentionClassFor,
  sha256Hex,
  WormViolationError,
} from "./archive.js";

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("archive — Aufbewahrungsfristen", () => {
  it("Rechnung/Eingangsrechnung/Buchungsbeleg = 10 Jahre", () => {
    expect(retentionClassFor("RECHNUNG")).toBe("BOOKING_10Y");
    expect(retentionClassFor("EINGANGSRECHNUNG")).toBe("BOOKING_10Y");
    expect(retentionClassFor("GUTSCHRIFT")).toBe("BOOKING_10Y");
  });
  it("Angebot/Lieferschein/Logo = 6 Jahre", () => {
    expect(retentionClassFor("ANGEBOT")).toBe("BUSINESS_6Y");
    expect(retentionClassFor("LIEFERSCHEIN")).toBe("BUSINESS_6Y");
    expect(retentionClassFor("LOGO")).toBe("BUSINESS_6Y");
  });
  it("frühestes Löschdatum = Archivdatum + Frist", () => {
    const at = new Date("2026-06-23T10:00:00.000Z");
    expect(earliestDeletionDate(at, "RECHNUNG").getUTCFullYear()).toBe(2036);
    expect(earliestDeletionDate(at, "ANGEBOT").getUTCFullYear()).toBe(2032);
  });
});

describe("archive — Inhalts-Adressierung & WORM", () => {
  it("gleicher Inhalt ⇒ gleicher SHA-256 (deterministisch)", () => {
    expect(sha256Hex(bytes("hallo"))).toBe(sha256Hex(bytes("hallo")));
    expect(sha256Hex(bytes("hallo"))).not.toBe(sha256Hex(bytes("welt")));
  });
  it("WORM: identischer Inhalt ist ok (idempotent)", () => {
    const sha = sha256Hex(bytes("x"));
    expect(() => assertWormConsistent(sha, sha, sha)).not.toThrow();
    expect(() => assertWormConsistent(sha, null, sha)).not.toThrow();
  });
  it("WORM: abweichender Inhalt unter belegtem Schlüssel wirft", () => {
    expect(() => assertWormConsistent("k", "aaa", "bbb")).toThrow(WormViolationError);
  });
});

const doc = (over: Partial<ArchivedDocMeta> = {}): ArchivedDocMeta => ({
  id: "doc1",
  belegart: "RECHNUNG",
  sourceEntity: "Invoice",
  sourceId: "RE-2026-0001",
  fileName: "rechnung.pdf",
  contentType: "application/pdf",
  sha256: "abc123",
  size: 1024,
  version: 1,
  retentionClass: "BOOKING_10Y",
  archivedAt: new Date("2026-06-23T10:00:00.000Z"),
  earliestDeletion: new Date("2036-06-23T10:00:00.000Z"),
  legalHold: false,
  ...over,
});

describe("archive — GoBD/GDPdU-Export (Z3)", () => {
  it("Manifest-CSV hat Kopfzeile + eine Zeile je Beleg, Semikolon-getrennt", () => {
    const csv = buildGobdManifestCsv([doc(), doc({ id: "doc2", sourceId: "RE-2026-0002" })]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("belegart;quelle");
    expect(lines[1]).toContain("RECHNUNG");
    expect(lines[2]).toContain("RE-2026-0002");
  });
  it("Felder mit Sonderzeichen werden gequotet", () => {
    const csv = buildGobdManifestCsv([doc({ fileName: 'a;b"c.pdf' })]);
    expect(csv).toContain('"a;b""c.pdf"');
  });
  it("index.xml referenziert die Manifestdatei und ist GDPdU-typisiert", () => {
    const xml = buildGobdIndexXml({ manifestFile: "manifest.csv", rowCount: 2, createdAt: new Date("2026-06-23T00:00:00Z") });
    expect(xml).toContain("gdpdu-01-09-2004.dtd");
    expect(xml).toContain("<URL>manifest.csv</URL>");
    expect(xml).toContain("<ColumnDelimiter>;</ColumnDelimiter>");
    expect(xml).toContain("2 Datensatz");
  });
});
