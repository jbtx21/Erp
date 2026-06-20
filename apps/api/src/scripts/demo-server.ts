// Durchstich-Demoserver (kein Prod, keine DB): startet den echten Fastify+tRPC-Server,
// ersetzt aber die vier Differenzierer-Services durch In-Memory-Repos mit Seed-Daten
// (die Repos sind laut Kommentar genau dafür gedacht — „für lokale Durchstiche").
// Ein fester Demo-Nutzer (BUERO) ersetzt den Login, damit die rollengeschützten
// Endpunkte (Stickerei/Nachkalkulation) zugänglich sind.
//
// Start: `node dist/scripts/demo-server.js` (nach `pnpm --filter @texma/api build`).
import type { TrackedProcess } from "@texma/shared";
import { MemoryAuditSink } from "../audit/memory-audit-sink.js";
import { AmpelService } from "../modules/ampel/ampel.service.js";
import { SubProductionService } from "../modules/subproduction/subproduction.service.js";
import { PostCalcService } from "../modules/postcalc/postcalc.service.js";
import { StickereiService } from "../modules/stickerei/stickerei.service.js";
import { InMemoryAmpelRepository } from "../repositories/in-memory-ampel.repository.js";
import { InMemorySubProductionRepository } from "../repositories/in-memory-subproduction.repository.js";
import { InMemoryPostCalcRepository } from "../repositories/in-memory-postcalc.repository.js";
import { InMemoryStickereiRepository } from "../repositories/in-memory-stickerei.repository.js";
import type { StoredStage } from "../modules/subproduction/subproduction.service.js";
import { buildServer } from "../server.js";

const DEMO_PA = "PA-DEMO";
const DEMO_LOGO = "LOGO-DEMO";
const DEMO_LOGO_GROSS = "LOGO-GROSS";
const day = 24 * 60 * 60 * 1000;
const now = Date.now();
const at = (offsetDays: number): Date => new Date(now + offsetDays * day);

// ── Ampel: ebenenübergreifende Termin-Vorgänge (Kap. 35.4) ──────────────────────
const ampelProcesses: TrackedProcess[] = [
  { id: "AN-1042", level: "ANGEBOT", label: "Angebot AN-1042 nachfassen", dueDate: at(-3), done: false },
  { id: "AN-1051", level: "ANGEBOT", label: "Angebot AN-1051 nachfassen", dueDate: at(4), done: false },
  { id: "AB-2118", level: "AUFTRAG", label: "Auftrag AB-2025-118 Liefertermin", dueDate: at(2), done: false },
  { id: "AB-2099", level: "AUFTRAG", label: "Auftrag AB-2025-099 Liefertermin", dueDate: at(9), done: true },
  { id: DEMO_PA, level: "PRODUKTION", label: "PA-DEMO Fertigstellung", dueDate: at(6), done: false },
  { id: "STK-B", level: "VEREDLER", label: "Stick-Rücklauf Partner B", dueDate: at(-1), done: false },
  { id: "SIE-A", level: "VEREDLER", label: "Siebdruck-Rücklauf Partner A", dueDate: at(3), done: true },
];

// ── Fremdvergabe (T-04): zweistufige Kette auf PA-DEMO ──────────────────────────
const subStages: StoredStage[] = [
  {
    id: "SP-1", productionId: DEMO_PA, sequence: 1, supplierId: "Siebdruck-Partner",
    status: "RUECKLAUF_ERHALTEN", beistellMenge: 100, ruecklaufMenge: 98,
    beistellungVersandtAm: at(-8), ruecklaufErhaltenAm: at(-2), dueDate: at(-3), lohnCents: 4500,
  },
  {
    id: "SP-2", productionId: DEMO_PA, sequence: 2, supplierId: "Stickerei B",
    status: "BEISTELLUNG_VERSANDT", beistellMenge: 98, beistellungVersandtAm: at(-2),
    dueDate: at(-1), lohnCents: 6000, // überfällig
  },
  {
    id: "SP-3", productionId: DEMO_PA, sequence: 3, supplierId: "Endkontrolle/Konfektion",
    status: "OFFEN", dueDate: at(4), lohnCents: 1500, // blockiert durch Stufe 2
  },
];

// ── Nachkalkulation (T-10): Ist-Werte zu PA-DEMO (Plan kommt aus der UI) ─────────
const postcalcActuals = {
  [DEMO_PA]: { revenueCents: 100_000, materialCents: 42_000, laborMinutes: 130 },
};

// ── Stickerei: Mengenstaffeln je Logo + konfigurierbarer Aufschlagsfaktor ────────
// Standard 1,88; Kleinmengen (≤ 9 Stück) mit 2,10; Großkunden mit 1,65 (greift hier
// nicht, da das Demo-Logo der Kundengruppe PG-STANDARD zugeordnet ist).
const stickereiRepo = new InMemoryStickereiRepository(
  { "FIRMA-DEMO": { stickereiPartnerId: "Stickerei-Nord", hatStickdatei: true } },
  {
    [DEMO_LOGO]: [
      { minMenge: 1, ekCents: 1_200 },
      { minMenge: 10, ekCents: 950 },
      { minMenge: 25, ekCents: 780 },
      { minMenge: 50, ekCents: 640 },
      { minMenge: 100, ekCents: 520 },
      { minMenge: 250, ekCents: 430 },
    ],
    [DEMO_LOGO_GROSS]: [
      { minMenge: 1, ekCents: 1_100 },
      { minMenge: 25, ekCents: 720 },
      { minMenge: 100, ekCents: 480 },
    ],
  },
  {
    markupConfig: {
      defaultFactor: 1.88,
      rules: [
        { id: "klein", factor: 2.1, finishingType: "STICKEREI", maxMenge: 9, label: "Kleinmenge ≤ 9 Stück" },
        { id: "grosskunde", factor: 1.65, priceGroupId: "PG-GROSSKUNDE", label: "Großkunde" },
      ],
    },
    priceGroups: { [DEMO_LOGO]: "PG-STANDARD", [DEMO_LOGO_GROSS]: "PG-GROSSKUNDE" },
    logos: [
      { id: DEMO_LOGO, label: "Muster GmbH · v3 (aktiv)", companyName: "Muster GmbH", version: 3, active: true },
      { id: DEMO_LOGO_GROSS, label: "Großkunde AG · v1 (aktiv)", companyName: "Großkunde AG", version: 1, active: true },
    ],
  }
);

const server = buildServer({
  identityVerifier: null,
  demoUser: { id: "demo-user", email: "demo@texma.de", name: "Demo Büro", role: "BUERO", totpEnabled: true },
  contextOverrides: {
    ampel: new AmpelService(new InMemoryAmpelRepository(ampelProcesses)),
    subproduction: new SubProductionService(new InMemorySubProductionRepository(subStages), new MemoryAuditSink()),
    postcalc: new PostCalcService(new InMemoryPostCalcRepository(postcalcActuals)),
    stickerei: new StickereiService(stickereiRepo),
  },
});

const port = Number(process.env.PORT ?? 3000);
server
  .listen({ port, host: "0.0.0.0" })
  .then((addr) => {
    console.log(`TEXMA Demo-API (In-Memory) läuft auf ${addr}`);
    console.log(`Demo-Daten: PA-ID="${DEMO_PA}" (Fremdvergabe + Nachkalkulation), Logo-ID="${DEMO_LOGO}" (Stickerei-Staffeln), Ampel vorbefüllt.`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
