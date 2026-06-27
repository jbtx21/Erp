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
});
