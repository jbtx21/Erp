import { describe, expect, it } from "vitest";
import { buildEml } from "./outlook-draft.js";

describe("buildEml (Outlook-Entwurf .eml)", () => {
  const draft = {
    to: "kunde@example.de",
    subject: "Angebot AN-0001",
    body: "Sehr geehrte Damen und Herren,\n\nanbei Ihr Angebot.",
    pdf: { filename: "Angebot-AN-0001.pdf", base64: btoa("%PDF-1.4 demo") },
  };

  it("setzt Empfänger, Betreff und den Outlook-Entwurf-Header", () => {
    const eml = buildEml(draft);
    expect(eml).toContain("To: kunde@example.de");
    expect(eml).toContain("Subject: Angebot AN-0001");
    expect(eml).toContain("X-Unsent: 1"); // öffnet in Outlook als bearbeitbarer Entwurf
    expect(eml).toContain("Content-Type: multipart/mixed");
  });

  it("hängt das PDF als base64-Attachment mit Dateinamen an", () => {
    const eml = buildEml(draft);
    expect(eml).toContain('Content-Type: application/pdf; name="Angebot-AN-0001.pdf"');
    expect(eml).toContain('Content-Disposition: attachment; filename="Angebot-AN-0001.pdf"');
    expect(eml).toContain(draft.pdf.base64);
  });

  it("kodiert Umlaute im Betreff RFC-2047 (Outlook zeigt sie korrekt)", () => {
    const eml = buildEml({ ...draft, subject: "Auftragsbestätigung AB-0002" });
    expect(eml).toMatch(/Subject: =\?UTF-8\?B\?.+\?=/);
  });

  it("hängt zusätzliche PDFs an (Mahnung + Original-Rechnung mitversenden)", () => {
    const eml = buildEml({
      to: "kunde@example.de",
      subject: "Zahlungserinnerung MA-1-ABC123",
      body: "Bitte den offenen Betrag begleichen.",
      pdf: { filename: "Mahnung-MA-1-ABC123.pdf", base64: btoa("%PDF mahnung") },
      extraPdfs: [{ filename: "Rechnung-RE-2026-0001.pdf", base64: btoa("%PDF rechnung") }],
    });
    // Beide Belege als eigene Anhänge — der Kunde sieht Mahnung UND die gemahnte Rechnung.
    expect(eml).toContain('filename="Mahnung-MA-1-ABC123.pdf"');
    expect(eml).toContain('filename="Rechnung-RE-2026-0001.pdf"');
    expect(eml).toContain(btoa("%PDF rechnung"));
    // Genau zwei application/pdf-Parts.
    expect((eml.match(/Content-Type: application\/pdf/g) ?? []).length).toBe(2);
  });
});
