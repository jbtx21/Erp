// Auftrags-Workflow / Statusverwaltung (Kerngeschäft Veredelung). Bildet die
// Angebots-Phasen und die 4 Produktionsrouten (keine/intern/extern/extern+intern)
// als geordnete Schrittlisten ab. Rein/IO-frei — die Zustandsfortschreibung je
// Auftrag liegt im Service. Jeder Schritt referenziert ggf. ein bestehendes Modul
// (Warenbestellvorschlag=reorder, Laufzettel=production-sheet, AB/Druckfreigabe=mail,
// QK-Bild=Anhänge) — die Automatisierung wird dort angedockt.

// ── Angebots-Workflow ─────────────────────────────────────────────────────────
export type QuoteStage =
  | "ANFRAGE"
  | "ANGEBOT_ANGELEGT"
  | "VEREDLER_ANGEFRAGT"
  | "GEPRUEFT_FREIGEGEBEN"
  | "VERSENDET"
  | "GEWONNEN"
  | "VERLOREN";

export const QUOTE_STAGES: ReadonlyArray<{ value: QuoteStage; label: string }> = [
  { value: "ANFRAGE", label: "Anfrage" },
  { value: "ANGEBOT_ANGELEGT", label: "Angebot angelegt" },
  { value: "VEREDLER_ANGEFRAGT", label: "Externe Veredler angefragt" },
  { value: "GEPRUEFT_FREIGEGEBEN", label: "Geprüft & freigegeben" },
  { value: "VERSENDET", label: "Angebot versendet" },
  { value: "GEWONNEN", label: "Gewonnen" },
  { value: "VERLOREN", label: "Verloren" },
];

// ── Produktionsrouten ─────────────────────────────────────────────────────────
export type OrderRoute = "ROUTE1_KEINE" | "ROUTE2_INTERN" | "ROUTE3_EXTERN" | "ROUTE4_EXTERN_INTERN";

export interface RouteStep {
  key: string;
  label: string;
}

const S = {
  angelegt: { key: "angelegt", label: "Auftrag angelegt – automatische Laufzeit" },
  bestellvorschlag: { key: "bestellvorschlag", label: "Automatischer Warenbestellvorschlag" },
  zutaten: { key: "zutaten", label: "Zutatenbestellung (Transferdrucke)" },
  laufzettelIntern: { key: "laufzettel_intern", label: "Laufzettel interne Veredelung" },
  laufzettelExtern: { key: "laufzettel_extern", label: "Laufzettel externe Veredelung" },
  laufzettelBeide: { key: "laufzettel_beide", label: "Laufzettel externe + interne Veredelung" },
  freigabeGL: { key: "freigabe_gl", label: "Auftrag geprüft & freigegeben durch GL" },
  abVersendet: { key: "ab_versendet", label: "Auftragsbestätigung versendet (mit Druckfreigabe)" },
  wareneingang: { key: "wareneingang", label: "Wareneingang – Prüfung" },
  wareneingangKomm: { key: "wareneingang_komm", label: "Wareneingang – Prüfung / Kommissionierung" },
  uebergabeProduktion: { key: "uebergabe_produktion", label: "Übergabe an Produktion" },
  veredelungNachFreigabe: { key: "veredelung_freigabe", label: "Veredelung (sobald Druckfreigabe Kunde erfolgt)" },
  versandVeredler: { key: "versand_veredler", label: "Versand an externen Veredler" },
  produktionExtern: { key: "produktion_extern", label: "Produktion extern (1. Auftrag Muster zur Freigabe, Folge ohne)" },
  ruecklauf: { key: "ruecklauf", label: "Rücklauf vom Veredler" },
  qkBild: { key: "qk_bild", label: "Qualitätskontrolle mit Bilddokumentation" },
  uebergabeIntern: { key: "uebergabe_intern", label: "Übergabe an interne Produktion" },
  veredelungIntern: { key: "veredelung_intern", label: "Interne Veredelung" },
  qkBild2: { key: "qk_bild_2", label: "Qualitätskontrolle mit Bilddokumentation (final)" },
  kommissionierung: { key: "kommissionierung", label: "Kommissionierung" },
  abrechnungVersand: { key: "abrechnung_versand", label: "Abrechnung & Versand / Abholung vor Ort" },
} as const;

export const ORDER_ROUTES: Record<OrderRoute, { label: string; steps: RouteStep[] }> = {
  ROUTE1_KEINE: {
    label: "Route 1 – keine Veredelung",
    steps: [S.angelegt, S.bestellvorschlag, S.wareneingang, S.kommissionierung, S.abrechnungVersand],
  },
  ROUTE2_INTERN: {
    label: "Route 2 – interne Veredelung",
    steps: [
      S.angelegt, S.bestellvorschlag, S.zutaten, S.laufzettelIntern, S.freigabeGL, S.abVersendet,
      S.wareneingangKomm, S.uebergabeProduktion, S.veredelungNachFreigabe, S.qkBild, S.kommissionierung, S.abrechnungVersand,
    ],
  },
  ROUTE3_EXTERN: {
    label: "Route 3 – externe Veredler",
    steps: [
      S.angelegt, S.bestellvorschlag, S.laufzettelExtern, S.freigabeGL, S.abVersendet, S.wareneingangKomm,
      S.veredelungNachFreigabe, S.versandVeredler, S.produktionExtern, S.ruecklauf, S.qkBild, S.kommissionierung, S.abrechnungVersand,
    ],
  },
  ROUTE4_EXTERN_INTERN: {
    label: "Route 4 – externe + interne Veredelung",
    steps: [
      S.angelegt, S.bestellvorschlag, S.zutaten, S.laufzettelBeide, S.freigabeGL, S.abVersendet, S.wareneingangKomm,
      S.veredelungNachFreigabe, S.versandVeredler, S.produktionExtern, S.ruecklauf, S.qkBild,
      S.uebergabeIntern, S.veredelungIntern, S.qkBild2, S.kommissionierung, S.abrechnungVersand,
    ],
  },
};

/** Bestimmt die Produktionsroute aus den Veredelungs-Merkmalen des Auftrags. */
export function determineRoute(flags: { hasVeredelung: boolean; hasIntern: boolean; hasExtern: boolean }): OrderRoute {
  if (!flags.hasVeredelung) return "ROUTE1_KEINE";
  if (flags.hasIntern && flags.hasExtern) return "ROUTE4_EXTERN_INTERN";
  if (flags.hasExtern) return "ROUTE3_EXTERN";
  return "ROUTE2_INTERN";
}

export interface RouteProgress {
  route: OrderRoute;
  label: string;
  stepIndex: number;
  totalSteps: number;
  currentStep: RouteStep | null;
  nextStep: RouteStep | null;
  done: boolean;
  steps: Array<RouteStep & { done: boolean; current: boolean }>;
}

/** Liefert die Fortschrittssicht einer Route an Position `stepIndex` (0-basiert). */
export function routeProgress(route: OrderRoute, stepIndex: number): RouteProgress {
  const def = ORDER_ROUTES[route];
  const total = def.steps.length;
  const idx = Math.max(0, Math.min(stepIndex, total));
  const done = idx >= total;
  return {
    route,
    label: def.label,
    stepIndex: idx,
    totalSteps: total,
    currentStep: done ? null : def.steps[idx] ?? null,
    nextStep: def.steps[idx + 1] ?? null,
    done,
    steps: def.steps.map((s, i) => ({ ...s, done: i < idx, current: i === idx && !done })),
  };
}
