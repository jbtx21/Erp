// Outlook-Entwurf statt SMTP-Direktversand: baut aus { to, subject, body, pdf } eine
// RFC-822-Nachricht (message/rfc822) und lädt sie als .eml herunter. Doppelklick öffnet sie
// in Outlook als vorbereiteten Entwurf — Empfänger, Betreff, Text und PDF-Anhang gesetzt,
// nichts wird automatisch versendet (der Sachbearbeiter prüft und sendet selbst).
//
// Warum .eml statt mailto:? mailto: kann keine Anhänge transportieren; eine MIME-Nachricht
// mit `X-Unsent: 1` öffnet in Outlook als editierbarer Entwurf samt PDF-Anhang — plattform-
// und kontounabhängig, ohne Postausgangsserver.

export interface MailPdf {
  filename: string;
  base64: string;
}

export interface MailDraft {
  to: string;
  subject: string;
  body: string;
  pdf: MailPdf;
  /** Weitere PDF-Anhänge (z. B. Original-Rechnung bei einer Mahnung). */
  extraPdfs?: MailPdf[];
}

/** UTF-8-sicheres Base64 (btoa kann nur Latin-1) — für Betreff/Text mit Umlauten. */
function utf8ToBase64(input: string): string {
  return btoa(unescape(encodeURIComponent(input)));
}

/** RFC-2047-Header-Encoding: reines ASCII bleibt lesbar, sonst =?UTF-8?B?…?= (Umlaute im Betreff). */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${utf8ToBase64(value)}?=`;
}

/** Base64 in 76-Zeichen-Zeilen brechen (RFC 2045). */
function chunk76(b64: string): string {
  return (b64.match(/.{1,76}/g) ?? []).join("\r\n");
}

/** Ein PDF-Anhangsteil (multipart/mixed-Part). */
function pdfPart(boundary: string, pdf: MailPdf): string[] {
  return [
    `--${boundary}`,
    `Content-Type: application/pdf; name="${pdf.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${pdf.filename}"`,
    "",
    chunk76(pdf.base64),
    "",
  ];
}

/** RFC-822-Quelltext (multipart/mixed: text/plain + ein oder mehrere application/pdf). Exportiert für Tests. */
export function buildEml(draft: MailDraft): string {
  const boundary = `texma_${draft.pdf.filename.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}_part`;
  const bodyB64 = chunk76(utf8ToBase64(draft.body));
  const pdfs = [draft.pdf, ...(draft.extraPdfs ?? [])];
  return [
    `To: ${draft.to}`,
    `Subject: ${encodeHeader(draft.subject)}`,
    "X-Unsent: 1", // Outlook: als bearbeitbaren Entwurf öffnen (nicht als empfangene Mail)
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    bodyB64,
    "",
    ...pdfs.flatMap((p) => pdfPart(boundary, p)),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** .eml herunterladen → öffnet in Outlook als vorbereiteter Entwurf mit PDF-Anhang. */
export function openOutlookDraft(draft: MailDraft): void {
  const eml = buildEml(draft);
  const filename = `${draft.pdf.filename.replace(/\.pdf$/i, "")}.eml`;
  const url = URL.createObjectURL(new Blob([eml], { type: "message/rfc822" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
