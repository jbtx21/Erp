// Kompletter klickbarer Durchlauf mit Screenshots + Fehler-Erfassung (kritischer QA-Sweep).
// Steuert jedes Hauptnav-Modul per Hash-Deeplink an, schießt einen Full-Page-Screenshot und
// protokolliert je Seite: Konsolenfehler, unbehandelte Page-Errors und fehlgeschlagene
// Netzwerk-Antworten (>= 400). Ergebnis-JSON: e2e-artifacts/walkthrough-report.json.
//
// Nicht Teil von `pnpm test` (braucht den echten Stack :5173/:3000). Aufruf: pnpm test:e2e.

import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "e2e-artifacts";
const SHOTS = `${OUT}/shots`;

// Alle Hauptnav-Module (key = Hash-Route) in Belegketten-Reihenfolge.
const MODULES: ReadonlyArray<{ key: string; label: string }> = [
  { key: "home", label: "Start" },
  { key: "dashboard", label: "Termin-Ampel" },
  { key: "statusampel", label: "Status-Ampel" },
  { key: "dashboards", label: "Meine Dashboards" },
  { key: "calendar", label: "Kalender" },
  { key: "tasks", label: "Meine Aufgaben" },
  { key: "messages", label: "Nachrichten" },
  { key: "pipeline", label: "Vertriebs-Pipeline" },
  { key: "calllogs", label: "Anrufliste" },
  { key: "newsletter", label: "Newsletter" },
  { key: "companies", label: "Kunden" },
  { key: "quotes", label: "Angebote" },
  { key: "orders", label: "Aufträge" },
  { key: "sammelbestellungen", label: "Sammelbestellungen" },
  { key: "preiscenter", label: "Preis-Center" },
  { key: "pricing", label: "Preise/Staffel" },
  { key: "reklamation", label: "Reklamation" },
  { key: "suppliers", label: "Lieferanten" },
  { key: "procurement", label: "Beschaffung" },
  { key: "reorder", label: "Nachbestellung" },
  { key: "incoming", label: "Eingangsrechnungen" },
  { key: "products", label: "Artikel/Varianten" },
  { key: "matrixstamm", label: "Matrix-Stamm" },
  { key: "lager", label: "Lager & Inventur" },
  { key: "stockmoves", label: "Bestandsbewegungen" },
  { key: "wareneingang", label: "Wareneingang" },
  { key: "samples", label: "Muster-Leihgut" },
  { key: "shipments", label: "Versand" },
  { key: "importmapper", label: "Import-Mapper" },
  { key: "eanimport", label: "EAN-Listen-Import" },
  { key: "logos", label: "Logos & Stickerei" },
  { key: "ausschreibungen", label: "Stickerei-Ausschreibungen" },
  { key: "subproduction", label: "Fremdvergabe" },
  { key: "prodreport", label: "Produktions-Auswertung" },
  { key: "aufschlag", label: "Aufschlagsfaktoren" },
  { key: "guv", label: "Gewinn- und Verlustrechnung" },
  { key: "invoices", label: "Rechnungen" },
  { key: "zahlungsabgleich", label: "Zahlungsabgleich" },
  { key: "dunning", label: "Mahnwesen" },
  { key: "costcenters", label: "Kostenstellen" },
  { key: "nachkalkfin", label: "Nachkalkulation" },
  { key: "gutscheine", label: "Gutscheine" },
  { key: "reporting", label: "Auswertungen" },
  { key: "hr", label: "Personalwesen" },
  { key: "admin", label: "Einstellungen" },
  { key: "automation", label: "Automationen" },
  { key: "mailaccounts", label: "E-Mail-Konten" },
  { key: "emailtemplates", label: "E-Mail-Vorlagen" },
  { key: "dataio", label: "Import/Export" },
  { key: "archive", label: "GoBD-Archiv" },
  { key: "auditlog", label: "Audit-Protokoll" },
  { key: "integrations", label: "Schnittstellen" },
  { key: "security", label: "Mein Konto (2FA)" },
];

// Konsolen-Rauschen ausblenden (Vite HMR, Mantine-Devwarnungen), das keine echten Defekte sind.
const IGNORE = [/\[vite\]/i, /Download the React DevTools/i, /React Router Future Flag/i];

interface PageReport {
  key: string;
  label: string;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  emptyStateText: boolean;
  crashed: boolean;
}

test("Kompletter Modul-Durchlauf mit Screenshots + Fehler-Erfassung", async ({ page }) => {
  test.setTimeout(600_000);
  mkdirSync(SHOTS, { recursive: true });
  const reports: PageReport[] = [];

  for (const [i, mod] of MODULES.entries()) {
    const rep: PageReport = { key: mod.key, label: mod.label, consoleErrors: [], pageErrors: [], failedRequests: [], emptyStateText: false, crashed: false };
    const onConsole = (msg: import("@playwright/test").ConsoleMessage): void => {
      if (msg.type() !== "error") return;
      const t = msg.text();
      if (IGNORE.some((re) => re.test(t))) return;
      rep.consoleErrors.push(t.slice(0, 300));
    };
    const onPageError = (err: Error): void => { rep.pageErrors.push(String(err.message).slice(0, 300)); };
    const onResponse = (res: import("@playwright/test").Response): void => {
      if (res.status() >= 400) rep.failedRequests.push(`${res.status()} ${res.request().method()} ${res.url().replace(/^https?:\/\/[^/]+/, "")}`.slice(0, 200));
    };
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("response", onResponse);

    const num = String(i + 1).padStart(2, "0");
    try {
      await page.goto(`/#${mod.key}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1600); // tRPC-Daten laden lassen
      // „Weißer-Screen"-Heuristik: sichtbarer Text vorhanden?
      const bodyText = (await page.locator("body").innerText().catch(() => "")).trim();
      rep.crashed = bodyText.length < 20;
      rep.emptyStateText = /Keine Daten\.|Keine Einträge/.test(bodyText);
      await page.screenshot({ path: `${SHOTS}/${num}-${mod.key}.png`, fullPage: true });
    } catch (e) {
      rep.crashed = true;
      rep.pageErrors.push(`NAV-FEHLER: ${String((e as Error).message).slice(0, 200)}`);
    }

    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
    reports.push(rep);
  }

  writeFileSync(`${OUT}/walkthrough-report.json`, JSON.stringify(reports, null, 2));

  // Kurz-Zusammenfassung in die Test-Ausgabe.
  const withErrors = reports.filter((r) => r.consoleErrors.length || r.pageErrors.length || r.failedRequests.length || r.crashed);
  console.log(`\n===== WALKTHROUGH-REPORT (${reports.length} Module) =====`);
  for (const r of withErrors) {
    console.log(`\n[${r.key}] ${r.label}${r.crashed ? "  ⚠️ CRASH/leer" : ""}`);
    for (const e of r.pageErrors) console.log(`  pageerror: ${e}`);
    for (const e of r.consoleErrors) console.log(`  console:   ${e}`);
    for (const e of [...new Set(r.failedRequests)]) console.log(`  http:      ${e}`);
  }
  console.log(`\n${withErrors.length}/${reports.length} Module mit Auffälligkeiten. Screenshots: ${SHOTS}/`);
  expect(reports.length).toBe(MODULES.length);
});
