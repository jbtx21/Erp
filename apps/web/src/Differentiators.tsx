// Differenzierer-Durchstich (Moat, Leitplanke 1): macht die vier selbst gebauten
// TEXMA-Spezialmodule am echten Endpunkt sichtbar — Ampel-Terminübersicht (Kap. 35.4),
// Stickerei-Mengenstaffeln je Logo (Kap. 4.4/5.4), Fremdvergabe-Plan (T-04/Kap. 5.3) und
// Nachkalkulation Soll-Ist (T-10). Preis-sensible Module sind für PRODUKTION ausgeblendet
// (Kap. 12) — die Endpunkte erzwingen die Rolle zusätzlich serverseitig. UI: Mantine.
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Group, NumberInput, Select, Table, Text, TextInput, Title } from "@mantine/core";
import {
  computeStickereiStaffelVks,
  stickereiPriceForMenge,
  type StaffelMarkup,
  type StickereiStaffel,
} from "@texma/shared/stickerei";
import {
  DEFAULT_MARKUP_CONFIG,
  resolveMarkupFactor,
  type FinishingType,
  type MarkupConfig,
  type MarkupRule,
} from "@texma/shared/markup";
import { trpc } from "./trpc.js";
import { euro, numTd, statusMantineColor, statusOf } from "./theme.js";

const countColor: Record<string, string> = { ROT: "red", GELB: "amber.7", GRUEN: "green" };

/** Ampel-Status als Badge: Farbe + Text (Skill erp-ui-design: Signal nie allein über Farbe). */
function StatusBadge({ s }: { s: string }): JSX.Element {
  return <Badge color={statusMantineColor[s] ?? "gray"} variant="light" radius="sm">{statusOf(s).label}</Badge>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function Differentiators({ role }: { role: string }): JSX.Element {
  const priceAllowed = role !== "PRODUKTION";
  return (
    <>
      <Title order={2}>Differenzierer (TEXMA-Moat)</Title>
      <Text size="sm" c="dimmed">
        Die vier selbst gebauten Spezialmodule — kein Standard-ERP kann das von der Stange.
      </Text>
      <AmpelDashboard />
      {priceAllowed ? (
        <PricingTools />
      ) : (
        <Card withBorder mt="md" padding="md">
          <Text size="sm" c="dimmed">
            Aufschlagsfaktoren, Stickerei-Mengenstaffeln und Nachkalkulation sind preis-sensibel
            und für die Rolle PRODUKTION ausgeblendet (Kap. 12).
          </Text>
        </Card>
      )}
      <SubproductionPlan role={role} />
    </>
  );
}

// ── Ampel-Terminübersicht (Kap. 35.4) ───────────────────────────────────────────
interface AmpelSummary {
  total: number;
  rot: number;
  gelb: number;
  gruen: number;
  overdue: number;
  kritisch: number;
  mostUrgent: { label: string; level: string; ampel: string; daysRemaining: number; overdueDays: number } | null;
  byLevel: Record<string, { rot: number; gelb: number; gruen: number }>;
}

function AmpelDashboard(): JSX.Element {
  const [data, setData] = useState<AmpelSummary | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      setData((await trpc.ampel.summary.query({})) as AmpelSummary);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card withBorder mt="md" padding="md">
      <Group justify="space-between">
        <Title order={4}>Termin-Ampel — ebenenübergreifend (Kap. 35.4)</Title>
        <Button variant="default" size="xs" onClick={() => void load()}>Aktualisieren</Button>
      </Group>
      {err && <Text c="red" size="sm" mt="xs">Fehler: {err}</Text>}
      {data && (
        <>
          <Group gap="md" mt="sm">
            <Text size="sm">Vorgänge: <b>{data.total}</b></Text>
            <Badge color="red" variant="light">ROT {data.rot}</Badge>
            <Badge color="amber" variant="light">GELB {data.gelb}</Badge>
            <Badge color="green" variant="light">GRÜN {data.gruen}</Badge>
            <Text size="sm">überfällig: <b>{data.overdue}</b></Text>
            <Text size="sm">kritisch: <b>{data.kritisch}</b></Text>
          </Group>
          {data.mostUrgent && (
            <Group gap="xs" mt="xs">
              <Text size="sm">Dringendster Vorgang: <b>{data.mostUrgent.label}</b> ({data.mostUrgent.level})</Text>
              <StatusBadge s={data.mostUrgent.ampel} />
              <Text size="sm" c="dimmed">
                {data.mostUrgent.overdueDays > 0
                  ? `${data.mostUrgent.overdueDays} Tage überfällig`
                  : `${data.mostUrgent.daysRemaining} Tage Restlauf`}
              </Text>
            </Group>
          )}
          <Table striped withTableBorder mt="sm" verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Ebene</Table.Th>
                <Table.Th ta="right">ROT</Table.Th>
                <Table.Th ta="right">GELB</Table.Th>
                <Table.Th ta="right">GRÜN</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {Object.entries(data.byLevel).map(([level, c]) => (
                <Table.Tr key={level}>
                  <Table.Td>{level}</Table.Td>
                  <Table.Td style={numTd}><Text span c={countColor.ROT} fw={700}>{c.rot}</Text></Table.Td>
                  <Table.Td style={numTd}><Text span c={countColor.GELB} fw={700}>{c.gelb}</Text></Table.Td>
                  <Table.Td style={numTd}><Text span c={countColor.GRUEN} fw={700}>{c.gruen}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Card>
  );
}

// ── Preis-Werkzeuge (preis-sensibel): Aufschlagsfaktoren + Stickerei-Staffeln ────
// Die globale Aufschlags-Konfiguration wird einmal geladen und an beide Karten gegeben,
// damit die Staffel-Live-Berechnung dieselben Faktoren/Regeln nutzt wie der Server.
function PricingTools(): JSX.Element {
  const [config, setConfig] = useState<MarkupConfig | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        setConfig((await trpc.stickerei.markup.getConfig.query()) as MarkupConfig);
      } catch {
        setConfig(DEFAULT_MARKUP_CONFIG);
      }
    })();
  }, []);
  return (
    <>
      <MarkupConfigCard config={config} onSaved={setConfig} />
      <StickereiStaffeln config={config} />
      <Postcalc />
    </>
  );
}

const fmtFactor = (f: number): string =>
  `×${f.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FINISHING_OPTIONS = ["STICKEREI", "DRUCK", "TRANSFER"];

// ── Konfigurierbarer Aufschlagsfaktor (Kap. 4.4) ────────────────────────────────
// Globaler Standardfaktor, jederzeit änderbar; dazu Regeln je Parameter (Kundengruppe,
// Veredelungsart, Mengen- und EK-Wertbereich). Die spezifischste passende Regel gewinnt.
function MarkupConfigCard({ config, onSaved }: { config: MarkupConfig | null; onSaved: (c: MarkupConfig) => void }): JSX.Element {
  const [defaultFactor, setDefaultFactor] = useState(DEFAULT_MARKUP_CONFIG.defaultFactor);
  const [rules, setRules] = useState<MarkupRule[]>([]);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (config) {
      setDefaultFactor(config.defaultFactor);
      setRules(config.rules);
    }
  }, [config]);

  const setRule = (i: number, patch: Partial<MarkupRule>) =>
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRule = () => setRules((prev) => [...prev, { factor: defaultFactor }]);
  const removeRule = (i: number) => setRules((prev) => prev.filter((_, idx) => idx !== i));
  // Priorität = Reihenfolge: nach oben/unten verschieben (erste passende Regel gewinnt).
  const moveRule = (i: number, dir: -1 | 1) =>
    setRules((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const save = useCallback(async () => {
    setErr("");
    setStatus("");
    try {
      const res = (await trpc.stickerei.markup.saveConfig.mutate({ defaultFactor, rules })) as MarkupConfig;
      onSaved(res);
      setStatus(`Aufschlags-Konfiguration gespeichert (${res.rules.length} Regeln).`);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [defaultFactor, rules, onSaved]);

  // Optionale Felder: leeres Eingabefeld ⇒ Bedingung entfällt (undefined).
  const optInt = (v: number | string): number | undefined => (v === "" ? undefined : Math.max(1, Math.round(Number(v) || 1)));
  const euroToCents = (v: number | string): number | undefined => (v === "" ? undefined : Math.round((Number(v) || 0) * 100));

  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>Aufschlagsfaktoren (Kap. 4.4)</Title>
      <Text size="sm" c="dimmed">
        Standardfaktor jederzeit änderbar; Regeln überschreiben ihn je Parameter
        (Kundengruppe · Veredelungsart · Mengen- und EK-Wertbereich). Geordnete Prioritätsliste:
        die erste passende Regel gewinnt (▲▼ zum Sortieren); ein Logo-Override (in der
        Staffel-Karte) schlägt alle Regeln.
      </Text>
      <Group align="end" gap="sm" mt="xs">
        <NumberInput label="Standardfaktor" w={140} hideControls min={0.01} step={0.01} decimalScale={2}
          value={defaultFactor} onChange={(v) => setDefaultFactor(Number(v) || 0)} />
        <Button onClick={() => void save()}>Speichern</Button>
      </Group>
      {status && <Text size="sm" c="dimmed" mt="xs">{status}</Text>}
      {err && <Text c="red" size="sm" mt="xs">Fehler: {err}</Text>}

      <Table withTableBorder mt="sm" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th ta="center">Prio</Table.Th>
            <Table.Th ta="right">Faktor</Table.Th>
            <Table.Th>Kundengruppe</Table.Th>
            <Table.Th>Veredelung</Table.Th>
            <Table.Th ta="right">ab Menge</Table.Th>
            <Table.Th ta="right">bis Menge</Table.Th>
            <Table.Th ta="right">EK ab (€)</Table.Th>
            <Table.Th ta="right">EK bis (€)</Table.Th>
            <Table.Th>Bezeichnung</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rules.map((r, i) => (
            <Table.Tr key={i}>
              <Table.Td>
                <Group gap={2} wrap="nowrap" justify="center">
                  <Text size="xs" c="dimmed" w={14} ta="right">{i + 1}</Text>
                  <Button size="compact-xs" px={4} variant="subtle" disabled={i === 0} onClick={() => moveRule(i, -1)}>▲</Button>
                  <Button size="compact-xs" px={4} variant="subtle" disabled={i === rules.length - 1} onClick={() => moveRule(i, 1)}>▼</Button>
                </Group>
              </Table.Td>
              <Table.Td style={numTd}>
                <NumberInput w={70} size="xs" hideControls min={0.01} step={0.01} decimalScale={2}
                  value={r.factor} onChange={(v) => setRule(i, { factor: Number(v) || 0 })} />
              </Table.Td>
              <Table.Td>
                <TextInput w={120} size="xs" placeholder="alle" value={r.priceGroupId ?? ""}
                  onChange={(e) => setRule(i, { priceGroupId: e.currentTarget.value || undefined })} />
              </Table.Td>
              <Table.Td>
                <Select w={120} size="xs" clearable placeholder="alle" data={FINISHING_OPTIONS}
                  value={r.finishingType ?? null}
                  onChange={(v) => setRule(i, { finishingType: (v as FinishingType) || undefined })} />
              </Table.Td>
              <Table.Td style={numTd}>
                <NumberInput w={70} size="xs" hideControls min={1} value={r.minMenge ?? ""}
                  onChange={(v) => setRule(i, { minMenge: optInt(v) })} />
              </Table.Td>
              <Table.Td style={numTd}>
                <NumberInput w={70} size="xs" hideControls min={1} value={r.maxMenge ?? ""}
                  onChange={(v) => setRule(i, { maxMenge: optInt(v) })} />
              </Table.Td>
              <Table.Td style={numTd}>
                <NumberInput w={80} size="xs" hideControls min={0} step={0.01} decimalScale={2}
                  value={r.minEkCents != null ? r.minEkCents / 100 : ""} onChange={(v) => setRule(i, { minEkCents: euroToCents(v) })} />
              </Table.Td>
              <Table.Td style={numTd}>
                <NumberInput w={80} size="xs" hideControls min={0} step={0.01} decimalScale={2}
                  value={r.maxEkCents != null ? r.maxEkCents / 100 : ""} onChange={(v) => setRule(i, { maxEkCents: euroToCents(v) })} />
              </Table.Td>
              <Table.Td>
                <TextInput w={140} size="xs" placeholder="optional" value={r.label ?? ""}
                  onChange={(e) => setRule(i, { label: e.currentTarget.value || undefined })} />
              </Table.Td>
              <Table.Td ta="right">
                <Button size="xs" variant="subtle" color="red" onClick={() => removeRule(i)}>✕</Button>
              </Table.Td>
            </Table.Tr>
          ))}
          {rules.length === 0 && (
            <Table.Tr><Table.Td colSpan={10}><Text size="sm" c="dimmed">Keine Regeln — überall gilt der Standardfaktor.</Text></Table.Td></Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <Button size="xs" variant="default" mt="sm" onClick={addRule}>+ Regel</Button>
    </Card>
  );
}

// ── Stickerei-Mengenstaffeln je Logo (Kap. 4.4 / T-15) ──────────────────────────
// Die Stickerei gibt uns nur ihren VK (= unseren Stick-EK) je Stück gestaffelt nach
// Menge; Staffelgrenzen frei wählbar und je Logo abweichend. EK wird manuell erfasst,
// unser VK = EK × Aufschlag (Standard/Regeln/Logo-Override) live berechnet — gleiche reine
// Logik wie der Server (@texma/shared).
interface StaffelRow {
  minMenge: number;
  ekEuro: number;
}
const DEFAULT_STAFFEL_ROWS: StaffelRow[] = [
  { minMenge: 1, ekEuro: 12.0 },
  { minMenge: 10, ekEuro: 9.5 },
  { minMenge: 25, ekEuro: 7.8 },
  { minMenge: 50, ekEuro: 6.4 },
  { minMenge: 100, ekEuro: 5.2 },
  { minMenge: 250, ekEuro: 4.3 },
];
const toStaffeln = (rows: ReadonlyArray<StaffelRow>): StickereiStaffel[] =>
  rows.map((r) => ({ minMenge: Math.round(r.minMenge), ekCents: Math.round(r.ekEuro * 100) }));

function StickereiStaffeln({ config }: { config: MarkupConfig | null }): JSX.Element {
  const [logoVersionId, setLogoVersionId] = useState("LOGO-DEMO");
  const [logoOptions, setLogoOptions] = useState<{ value: string; label: string }[]>([]);
  const [rows, setRows] = useState<StaffelRow[]>(DEFAULT_STAFFEL_ROWS);
  const [logoOverride, setLogoOverride] = useState<number | null>(null);
  const [priceGroupId, setPriceGroupId] = useState<string | undefined>(undefined);
  const [menge, setMenge] = useState(75);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");

  // Aufschlags-Auflösung wie auf dem Server: Konfig + Kontext (Kundengruppe/Veredelung) +
  // Logo-Override. Je Stufe greifen Mengen-/EK-Regeln über den Stufen-Kontext.
  const cfg = config ?? DEFAULT_MARKUP_CONFIG;
  const markup: StaffelMarkup = { config: cfg, context: { priceGroupId, finishingType: "STICKEREI" }, logoOverride };
  let byMin = new Map<number, { vkCents: number; dbCents: number }>();
  let computeError = "";
  let price: ReturnType<typeof stickereiPriceForMenge> = null;
  try {
    const staffeln = toStaffeln(rows);
    byMin = new Map(computeStickereiStaffelVks(staffeln, markup).map((s) => [s.minMenge, s]));
    price = stickereiPriceForMenge(staffeln, menge, markup);
  } catch (e) {
    computeError = errMsg(e);
  }

  const setRow = (i: number, patch: Partial<StaffelRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((prev) => [...prev, { minMenge: (prev[prev.length - 1]?.minMenge ?? 0) + 50 || 1, ekEuro: 0 }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const load = useCallback(async (id: string) => {
    setErr("");
    setStatus("");
    try {
      const res = await trpc.stickerei.staffeln.list.query({ logoVersionId: id });
      setRows(res.staffeln.map((s) => ({ minMenge: s.minMenge, ekEuro: s.ekCents / 100 })));
      setLogoOverride(res.logoOverride);
      setPriceGroupId(res.priceGroupId);
      setStatus(`${res.staffeln.length} Staffeln geladen${res.priceGroupId ? ` (Kundengruppe ${res.priceGroupId})` : ""}.`);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);

  // Logo-Picker füllen + initiale Auswahl laden (gleiche reine Logik wie der Server).
  useEffect(() => {
    void (async () => {
      try {
        const opts = await trpc.stickerei.logos.query();
        setLogoOptions(opts.map((o) => ({ value: o.id, label: o.label })));
        const initial = opts.find((o) => o.id === logoVersionId)?.id ?? opts[0]?.id;
        if (initial) {
          setLogoVersionId(initial);
          await load(initial);
        }
      } catch (e) {
        setErr(errMsg(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const save = useCallback(async () => {
    setErr("");
    setStatus("");
    try {
      const res = await trpc.stickerei.staffeln.save.mutate({ logoVersionId, staffeln: toStaffeln(rows), logoOverride });
      setStatus(`Gespeichert: ${res.staffeln.length} Staffeln für ${logoVersionId}.`);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [logoVersionId, rows, logoOverride]);

  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>Stickerei-Mengenstaffeln je Logo (Kap. 4.4 / T-15)</Title>
      <Text size="sm" c="dimmed">
        Die Stickerei gibt nur ihren VK (= unser Stick-EK) je Stück gestaffelt nach Menge —
        Staffeln frei wählbar je Logo. Stick-EK manuell eintragen; unser VK je Stück (und DB) wird
        mit dem aufgelösten Aufschlagsfaktor automatisch berechnet.
      </Text>
      <Group align="end" gap="sm" mt="xs">
        <Select label="Logo" w={240} searchable nothingFoundMessage="kein Logo" placeholder="Logo wählen…"
          data={logoOptions} value={logoVersionId}
          onChange={(v) => { if (v) { setLogoVersionId(v); void load(v); } }} />
        <NumberInput label="Logo-Override (×)" w={140} hideControls min={0} step={0.01} decimalScale={2}
          placeholder="aus" value={logoOverride ?? ""}
          onChange={(v) => setLogoOverride(v === "" ? null : Number(v) || 0)} />
        <Button variant="default" onClick={() => void load(logoVersionId)} disabled={!logoVersionId}>Neu laden</Button>
        <Button onClick={() => void save()} disabled={!logoVersionId || !!computeError}>Speichern</Button>
      </Group>
      {status && <Text size="sm" c="dimmed" mt="xs">{status}</Text>}
      {err && <Text c="red" size="sm" mt="xs">Fehler: {err}</Text>}

      <Table withTableBorder mt="sm" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th ta="right">ab Menge</Table.Th>
            <Table.Th ta="right">Stick-EK je Stück (€)</Table.Th>
            <Table.Th ta="right">Faktor</Table.Th>
            <Table.Th ta="right">unser VK je Stück (€)</Table.Th>
            <Table.Th ta="right">DB je Stück</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, i) => {
            const vk = byMin.get(Math.round(r.minMenge));
            let resolved: ReturnType<typeof resolveMarkupFactor> | null = null;
            try {
              resolved = resolveMarkupFactor(
                cfg,
                { priceGroupId, finishingType: "STICKEREI", menge: Math.round(r.minMenge), ekCents: Math.round(r.ekEuro * 100) },
                logoOverride
              );
            } catch {
              resolved = null;
            }
            return (
              <Table.Tr key={i}>
                <Table.Td style={numTd}>
                  <NumberInput w={90} size="xs" hideControls min={1} value={r.minMenge}
                    onChange={(v) => setRow(i, { minMenge: Math.max(1, Number(v) || 1) })} />
                </Table.Td>
                <Table.Td style={numTd}>
                  <NumberInput w={100} size="xs" hideControls min={0} step={0.01} decimalScale={2}
                    value={r.ekEuro} onChange={(v) => setRow(i, { ekEuro: Number(v) || 0 })} />
                </Table.Td>
                <Table.Td style={numTd}>
                  {resolved ? (
                    <Text span size="sm" c={resolved.source === "default" ? "dimmed" : "navy.9"}
                      title={resolved.source === "rule" ? `Regel${resolved.ruleLabel ? `: ${resolved.ruleLabel}` : ""}` : resolved.source}>
                      {fmtFactor(resolved.factor)}
                    </Text>
                  ) : "—"}
                </Table.Td>
                <Table.Td style={numTd}>{vk ? <b>{euro(vk.vkCents)}</b> : "—"}</Table.Td>
                <Table.Td style={numTd}>{vk ? euro(vk.dbCents) : "—"}</Table.Td>
                <Table.Td ta="right">
                  <Button size="xs" variant="subtle" color="red" onClick={() => removeRow(i)}>✕</Button>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Group mt="sm" justify="space-between">
        <Button size="xs" variant="default" onClick={addRow}>+ Staffel</Button>
        {computeError && <Text c="red" size="sm">Eingabe ungültig: {computeError}</Text>}
      </Group>

      <Group align="end" gap="sm" mt="md">
        <NumberInput label="Bestellmenge" w={130} hideControls min={0} value={menge}
          onChange={(v) => setMenge(Math.max(0, Number(v) || 0))} />
        <Text size="sm">
          {computeError ? "—" : price
            ? <>gültige Staffel: <b>ab {price.minMenge} Stk.</b> · EK {euro(price.ekCents)} · VK <b>{euro(price.vkCents)}</b> je Stück</>
            : "keine Staffel für diese Menge (unter der kleinsten Grenze)"}
        </Text>
      </Group>
    </Card>
  );
}

// ── Nachkalkulation Soll-Ist (T-10) ─────────────────────────────────────────────
interface PostcalcResult {
  plan: { revenueCents: number; materialCents: number; laborCents: number; dbCents: number };
  ist: { revenueCents: number; materialCents: number; laborCents: number; dbCents: number };
  dbVarianceCents: number;
  planMarginPct: number;
  istMarginPct: number;
  status: string;
  variance: {
    revenueVarianceCents: number;
    materialVarianceCents: number;
    laborQtyVarianceCents: number;
    laborRateVarianceCents: number;
  };
}

function Postcalc(): JSX.Element {
  const [productionId, setProductionId] = useState("");
  const [revenueEuro, setRevenueEuro] = useState(1000);
  const [materialEuro, setMaterialEuro] = useState(400);
  const [laborMinutes, setLaborMinutes] = useState(120);
  const [planRate, setPlanRate] = useState(60); // Cent je Minute
  const [istRate, setIstRate] = useState(70);
  const [res, setRes] = useState<PostcalcResult | null>(null);
  const [err, setErr] = useState("");

  const compute = useCallback(async () => {
    setErr("");
    try {
      const out = await trpc.postcalc.compute.query({
        productionId,
        plan: {
          revenueCents: Math.round(revenueEuro * 100),
          materialCents: Math.round(materialEuro * 100),
          laborMinutes,
          laborRateCentsPerMinute: planRate,
        },
        istLaborRateCentsPerMinute: istRate,
      });
      setRes(out as PostcalcResult);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [productionId, revenueEuro, materialEuro, laborMinutes, planRate, istRate]);

  const statusC = statusMantineColor[res?.status ?? ""] ?? "gray";

  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>Nachkalkulation Soll-Ist (T-10)</Title>
      <Text size="sm" c="dimmed">
        Plan-DB gegen Ist-DB, inkl. Abweichungszerlegung (Material · Lohn-Menge · Lohn-Satz).
      </Text>
      <Group align="end" gap="sm" mt="xs">
        <TextInput label="PA-ID" placeholder="z. B. cuid…" w={180}
          value={productionId} onChange={(e) => setProductionId(e.currentTarget.value)} />
        <NumberInput label="Umsatz (€)" w={110} hideControls value={revenueEuro} onChange={(v) => setRevenueEuro(Number(v) || 0)} />
        <NumberInput label="Material (€)" w={110} hideControls value={materialEuro} onChange={(v) => setMaterialEuro(Number(v) || 0)} />
        <NumberInput label="Lohn (Min)" w={100} hideControls value={laborMinutes} onChange={(v) => setLaborMinutes(Number(v) || 0)} />
        <NumberInput label="Plan-Satz (ct/Min)" w={130} hideControls value={planRate} onChange={(v) => setPlanRate(Number(v) || 0)} />
        <NumberInput label="Ist-Satz (ct/Min)" w={130} hideControls value={istRate} onChange={(v) => setIstRate(Number(v) || 0)} />
      </Group>
      <Button mt="sm" onClick={() => void compute()} disabled={!productionId}>Berechnen</Button>
      {err && <Text c="red" size="sm" mt="xs">Fehler: {err}</Text>}
      {res && (
        <>
          <Group gap="lg" mt="sm">
            <Text size="sm">Plan-DB: <b>{euro(res.plan.dbCents)}</b> ({res.planMarginPct} %)</Text>
            <Text size="sm">Ist-DB: <b>{euro(res.ist.dbCents)}</b> ({res.istMarginPct} %)</Text>
            <Text size="sm">Abweichung: <Text span fw={700} c={statusC}>{res.dbVarianceCents >= 0 ? "+" : ""}{euro(res.dbVarianceCents)}</Text></Text>
            <Group gap={6}><Text size="sm">Status:</Text><StatusBadge s={res.status} /></Group>
          </Group>
          <Table withTableBorder mt="sm" verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr><Table.Th>Abweichungskomponente</Table.Th><Table.Th ta="right">Wirkung auf DB</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr><Table.Td>Umsatz (Ist − Plan)</Table.Td><Table.Td style={numTd}>{euro(res.variance.revenueVarianceCents)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Material (Plan − Ist)</Table.Td><Table.Td style={numTd}>{euro(res.variance.materialVarianceCents)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Lohn-Menge (Zeit)</Table.Td><Table.Td style={numTd}>{euro(res.variance.laborQtyVarianceCents)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Lohn-Satz</Table.Td><Table.Td style={numTd}>{euro(res.variance.laborRateVarianceCents)}</Table.Td></Table.Tr>
            </Table.Tbody>
          </Table>
        </>
      )}
    </Card>
  );
}

// ── Mehrstufige Fremdvergabe — Plan + Klickpfad (T-04 / Kap. 5.3) ────────────────
type SubStatus = "OFFEN" | "BEISTELLUNG_VERSANDT" | "RUECKLAUF_ERHALTEN" | "ABGESCHLOSSEN";
interface Stage {
  id: string;
  sequence: number;
  supplierId: string;
  status: SubStatus;
  beistellMenge?: number | null;
  ruecklaufMenge?: number | null;
  dueDate?: string | null;
}
interface SubPlan {
  totalScrap: number;
  totalLohnCents: number;
  progressPercent: number;
  yieldPercent: number | null;
  allReturned: boolean;
}

const RETURNED = new Set<SubStatus>(["RUECKLAUF_ERHALTEN", "ABGESCHLOSSEN"]);
const STATUS_LABEL: Record<SubStatus, string> = {
  OFFEN: "offen",
  BEISTELLUNG_VERSANDT: "beigestellt",
  RUECKLAUF_ERHALTEN: "Rücklauf erhalten",
  ABGESCHLOSSEN: "abgeschlossen",
};
const isOverdue = (s: Stage): boolean =>
  !!s.dueDate && !RETURNED.has(s.status) && new Date(s.dueDate).getTime() < Date.now();

function SubproductionPlan({ role }: { role: string }): JSX.Element {
  const [productionId, setProductionId] = useState("");
  const [plan, setPlan] = useState<SubPlan | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [menge, setMenge] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const canAct = role === "ADMIN" || role === "BUERO";

  const load = useCallback(async () => {
    setErr("");
    try {
      const [p, s] = await Promise.all([
        trpc.subproduction.plan.query({ productionId }),
        trpc.subproduction.list.query({ productionId }),
      ]);
      setPlan(p as unknown as SubPlan);
      setStages((s as unknown as { stages: Stage[] }).stages);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [productionId]);

  const advance = useCallback(
    async (stage: Stage, to: SubStatus, withMenge: boolean) => {
      setErr("");
      setBusy(true);
      try {
        const raw = menge[stage.id];
        const m = withMenge && raw != null && raw !== "" ? Number(raw) : undefined;
        await trpc.subproduction.advance.mutate({
          subProductionId: stage.id,
          to: to as "BEISTELLUNG_VERSANDT" | "RUECKLAUF_ERHALTEN" | "ABGESCHLOSSEN",
          ...(m != null ? { menge: m } : {}),
        });
        await load();
      } catch (e) {
        setErr(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [menge, load]
  );

  // Client-Gate (zusätzlich zur Server-Prüfung, T-04): eine OFFENE Stufe ist erst startbar,
  // wenn alle vorherigen Stufen zurück sind.
  const canStart = (i: number): boolean => stages.slice(0, i).every((s) => RETURNED.has(s.status));

  const mengeBox = (s: Stage, ph: string): JSX.Element => (
    <NumberInput w={72} size="xs" hideControls min={0} placeholder={ph}
      value={menge[s.id] ?? ""} onChange={(v) => setMenge((m) => ({ ...m, [s.id]: v === "" ? "" : String(v) }))} />
  );

  const action = (s: Stage, i: number): JSX.Element => {
    if (s.status === "ABGESCHLOSSEN") return <Badge color="green" variant="light">✓ abgeschlossen</Badge>;
    if (!canAct) return <Text c="dimmed">—</Text>;
    if (s.status === "OFFEN") {
      return canStart(i) ? (
        <Group gap="xs" wrap="nowrap">
          {mengeBox(s, "Menge")}
          <Button size="xs" disabled={busy} onClick={() => void advance(s, "BEISTELLUNG_VERSANDT", true)}>Beistellung versenden</Button>
        </Group>
      ) : <Text c="dimmed">blockiert</Text>;
    }
    if (s.status === "BEISTELLUNG_VERSANDT") {
      return (
        <Group gap="xs" wrap="nowrap">
          {mengeBox(s, "Rückl.")}
          <Button size="xs" disabled={busy} onClick={() => void advance(s, "RUECKLAUF_ERHALTEN", true)}>Rücklauf erfassen</Button>
        </Group>
      );
    }
    return <Button size="xs" variant="default" disabled={busy} onClick={() => void advance(s, "ABGESCHLOSSEN", false)}>Abschließen</Button>;
  };

  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>Mehrstufige Fremdvergabe — Plan + Aktionen (T-04, Kap. 5.3)</Title>
      <Text size="sm" c="dimmed">
        Stufen sequenziell weiterschalten: Beistellung → Rücklauf → Abschluss (mit Mengenfluss/Schwund).
      </Text>
      <Group align="end" gap="sm" mt="xs">
        <TextInput label="PA-ID" placeholder="Produktions-Auftrag-ID" w={220}
          value={productionId} onChange={(e) => setProductionId(e.currentTarget.value)} />
        <Button onClick={() => void load()} disabled={!productionId}>Plan laden</Button>
      </Group>
      {err && <Text c="red" size="sm" mt="xs">Fehler: {err}</Text>}
      {plan && (
        <Group gap="lg" mt="sm">
          <Text size="sm">Fortschritt: <b>{plan.progressPercent} %</b></Text>
          <Text size="sm">Ausbeute: <b>{plan.yieldPercent == null ? "—" : `${plan.yieldPercent} %`}</b></Text>
          <Text size="sm">Schwund: <b>{plan.totalScrap}</b></Text>
          <Text size="sm">Lohn gesamt: <b>{euro(plan.totalLohnCents)}</b></Text>
          <Text size="sm" c={plan.allReturned ? "green" : "dimmed"}>{plan.allReturned ? "✓ alle zurück" : "offen"}</Text>
        </Group>
      )}
      {stages.length > 0 && (
        <Table withTableBorder mt="sm" verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Stufe</Table.Th>
              <Table.Th>Veredler</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th ta="right">Menge B/R</Table.Th>
              <Table.Th>Aktion</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {stages.map((s, i) => (
              <Table.Tr key={s.id}>
                <Table.Td>#{s.sequence}</Table.Td>
                <Table.Td>{s.supplierId}</Table.Td>
                <Table.Td>
                  <Group gap={6}>
                    <Text size="sm">{STATUS_LABEL[s.status]}</Text>
                    {isOverdue(s) && <Badge color="red" variant="light" size="sm">überfällig</Badge>}
                  </Group>
                </Table.Td>
                <Table.Td style={numTd}>{s.beistellMenge ?? "—"}{s.ruecklaufMenge != null ? ` / ${s.ruecklaufMenge}` : ""}</Table.Td>
                <Table.Td>{action(s, i)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {!canAct && stages.length > 0 && (
        <Text size="sm" c="dimmed" mt="xs">Aktionen erfordern Rolle ADMIN/BÜRO (Kap. 12).</Text>
      )}
    </Card>
  );
}
