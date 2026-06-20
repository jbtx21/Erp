// Differenzierer-Durchstich (Moat, Leitplanke 1): macht die vier selbst gebauten
// TEXMA-Spezialmodule am echten Endpunkt sichtbar — Ampel-Terminübersicht (Kap. 35.4),
// Stickerei-Angebotsvergleich (Kap. 5.4), Fremdvergabe-Plan (T-04/Kap. 5.3) und
// Nachkalkulation Soll-Ist (T-10). Preis-sensible Module sind für PRODUKTION ausgeblendet
// (Kap. 12) — die Endpunkte erzwingen die Rolle zusätzlich serverseitig. UI: Mantine.
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Group, NumberInput, Table, Text, TextInput, Title } from "@mantine/core";
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
        <>
          <StickereiCompare />
          <Postcalc />
        </>
      ) : (
        <Card withBorder mt="md" padding="md">
          <Text size="sm" c="dimmed">
            Stickerei-Angebotsvergleich und Nachkalkulation sind preis-sensibel und für die
            Rolle PRODUKTION ausgeblendet (Kap. 12).
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

// ── Stickerei-Angebotsvergleich (Kap. 5.4) ──────────────────────────────────────
interface OfferInput {
  partnerId: string;
  name: string;
  setupEuro: number;
  per1000Euro: number;
  leadDays: number;
}
interface Quote {
  partnerId: string;
  name: string;
  totalCents: number;
  leadDays: number;
}

const DEFAULT_OFFERS: OfferInput[] = [
  { partnerId: "p1", name: "Stickerei A", setupEuro: 25, per1000Euro: 1.2, leadDays: 7 },
  { partnerId: "p2", name: "Stickerei B", setupEuro: 15, per1000Euro: 1.6, leadDays: 5 },
  { partnerId: "p3", name: "Stickerei C", setupEuro: 40, per1000Euro: 0.9, leadDays: 10 },
];

function StickereiCompare(): JSX.Element {
  const [stitches, setStitches] = useState(8000);
  const [offers, setOffers] = useState<OfferInput[]>(DEFAULT_OFFERS);
  const [result, setResult] = useState<{ quotes: Quote[]; chosen: Quote | null } | null>(null);
  const [err, setErr] = useState("");

  const setOffer = (i: number, patch: Partial<OfferInput>) =>
    setOffers((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  const compare = useCallback(async () => {
    setErr("");
    try {
      const res = await trpc.stickerei.compareOffers.query({
        stitches,
        offers: offers.map((o) => ({
          partnerId: o.partnerId,
          name: o.name,
          setupCents: Math.round(o.setupEuro * 100),
          pricePer1000Cents: Math.round(o.per1000Euro * 100),
          leadDays: o.leadDays,
        })),
      });
      setResult(res as { quotes: Quote[]; chosen: Quote | null });
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [stitches, offers]);

  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>Stickerei-Angebotsvergleich (Kap. 5.4)</Title>
      <Text size="sm" c="dimmed">
        Neukunde/neues Logo → Ausschreibung an die 3 Partner; günstigstes Angebot gewinnt
        (bei Gleichstand kürzere Durchlaufzeit).
      </Text>
      <NumberInput
        label="Stichzahl" w={140} mt="xs" min={0} hideControls
        value={stitches} onChange={(v) => setStitches(Math.max(0, Number(v) || 0))}
      />
      <Table withTableBorder mt="sm" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Partner</Table.Th>
            <Table.Th ta="right">Einrichtung (€)</Table.Th>
            <Table.Th ta="right">je 1.000 Stiche (€)</Table.Th>
            <Table.Th ta="right">Durchlauf (Tage)</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {offers.map((o, i) => (
            <Table.Tr key={o.partnerId}>
              <Table.Td>{o.name}</Table.Td>
              <Table.Td style={numTd}>
                <NumberInput w={90} size="xs" hideControls min={0} step={0.01} decimalScale={2}
                  value={o.setupEuro} onChange={(v) => setOffer(i, { setupEuro: Number(v) || 0 })} />
              </Table.Td>
              <Table.Td style={numTd}>
                <NumberInput w={90} size="xs" hideControls min={0} step={0.01} decimalScale={2}
                  value={o.per1000Euro} onChange={(v) => setOffer(i, { per1000Euro: Number(v) || 0 })} />
              </Table.Td>
              <Table.Td style={numTd}>
                <NumberInput w={90} size="xs" hideControls min={0}
                  value={o.leadDays} onChange={(v) => setOffer(i, { leadDays: Math.max(0, Number(v) || 0) })} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Button mt="sm" onClick={() => void compare()}>Vergleichen</Button>
      {err && <Text c="red" size="sm" mt="xs">Fehler: {err}</Text>}
      {result && (
        <Table striped highlightOnHover withTableBorder mt="sm" verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Rang</Table.Th>
              <Table.Th>Partner</Table.Th>
              <Table.Th ta="right">Gesamtkosten</Table.Th>
              <Table.Th ta="right">Durchlauf</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {result.quotes.map((q, i) => {
              const isChosen = result.chosen?.partnerId === q.partnerId;
              return (
                <Table.Tr key={q.partnerId}>
                  <Table.Td>{i + 1}{isChosen ? " ✓" : ""}</Table.Td>
                  <Table.Td>{isChosen ? <b>{q.name}</b> : q.name}</Table.Td>
                  <Table.Td style={numTd}>{euro(q.totalCents)}</Table.Td>
                  <Table.Td style={numTd}>{q.leadDays} Tage</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
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
