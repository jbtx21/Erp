// Reporting-Ansicht (Kap. 29/35): Umsatz-/Auftragsübersicht (Tabelle + Liniendiagramm),
// Umsatz nach Shop/Kundengruppe (Tabelle + Balkendiagramm), Periodenvergleich,
// KI-Zusammenfassung sowie operative Produktions-KPIs (Durchlaufzeit, Fehlerquote,
// Termintreue). Granularität Tag/Woche/Monat/Jahr umschaltbar. CSV-Export je Abschnitt
// (clientseitig) + PDF-Export der Umsatz-Auswertung (serverseitig gerendert).
// Finanzkennzahlen nur für nicht-PRODUKTION (serverseitig per RBAC erzwungen). UI: Mantine.
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Group, Paper, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { BarChart, LineChart } from "./charts.js";
import { downloadBase64Pdf, downloadCsv } from "./export.js";
import { trpc } from "./trpc.js";
import { euro, numTd } from "./theme.js";

type Granularity = "DAY" | "WEEK" | "MONTH" | "YEAR";

interface Bucket {
  key: string;
  count: number;
  netCents: number;
}
interface RevenueOverview {
  buckets: Bucket[];
  totalNetCents: number;
}
interface OrderOverview {
  buckets: Bucket[];
  totalNetCents: number;
  totalCount: number;
}
interface BreakdownItem {
  label: string;
  name: string;
  count: number;
  netCents: number;
  sharePercent: number | null;
}
interface PeriodComparison {
  current: { key: string; netCents: number };
  previous: { netCents: number } | null;
  deltaCents: number;
  deltaPercent: number | null;
}
interface LeadTimeOverview {
  buckets: { key: string; count: number; avgHours: number }[];
  stats: { count: number; avgHours: number; medianHours: number; minHours: number; maxHours: number };
}
interface DefectOverview {
  buckets: { key: string; total: number; defects: number; ratePercent: number | null }[];
  overall: { total: number; defects: number; ratePercent: number | null };
  byCause: { LIEFERANT: number; INTERN: number; EXTERN_VEREDLER: number };
}
interface OnTimeOverview {
  buckets: { key: string; total: number; onTime: number; ratePercent: number | null }[];
  overall: { total: number; onTime: number; ratePercent: number | null };
}
interface AiSummary {
  aiGenerated: boolean;
  narrative: string;
}
interface QuoteConversion {
  total: number;
  won: number;
  lost: number;
  open: number;
  winRatePercent: number;
  quotedNetCents: number;
  wonNetCents: number;
  lossReasons: Array<{ reason: string; count: number }>;
}

const pct = (p: number | null) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p} %`);
const ratePct = (p: number | null) => (p == null ? "—" : `${p} %`);

/** Wandelt die <input type="date">-Werte (YYYY-MM-DD) in einen ISO-Range (UTC). */
function buildRange(from: string, to: string): { from?: string; to?: string } {
  return {
    ...(from ? { from: `${from}T00:00:00.000Z` } : {}),
    ...(to ? { to: `${to}T23:59:59.999Z` } : {}),
  };
}

/** Karten-Kopf mit Titel + rechtsbündigem CSV-Export (einheitliches Muster, Kap. 38.1). */
function CardHead({ title, onCsv }: { title: string; onCsv: () => void }): JSX.Element {
  return (
    <Group justify="space-between" mb="xs" wrap="nowrap">
      <Title order={4}>{title}</Title>
      <Button size="xs" variant="default" onClick={onCsv}>CSV</Button>
    </Group>
  );
}

export function Reporting({ role }: { role: string }): JSX.Element {
  const isProduction = role === "PRODUKTION";
  const [granularity, setGranularity] = useState<Granularity>("MONTH");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");

  const [revenue, setRevenue] = useState<RevenueOverview | null>(null);
  const [orders, setOrders] = useState<OrderOverview | null>(null);
  const [compare, setCompare] = useState<PeriodComparison | null>(null);
  const [byShop, setByShop] = useState<BreakdownItem[]>([]);
  const [byPriceGroup, setByPriceGroup] = useState<BreakdownItem[]>([]);
  const [byArticle, setByArticle] = useState<BreakdownItem[]>([]);
  const [leadTime, setLeadTime] = useState<LeadTimeOverview | null>(null);
  const [defects, setDefects] = useState<DefectOverview | null>(null);
  const [onTime, setOnTime] = useState<OnTimeOverview | null>(null);
  const [quoteConv, setQuoteConv] = useState<QuoteConversion | null>(null);
  const [ai, setAi] = useState<AiSummary | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus("");
    setAi(null);
    const range = buildRange(from, to);
    try {
      const [lt, df, ot] = await Promise.all([
        trpc.productionReporting.leadTime.query({ granularity, ...range }),
        trpc.productionReporting.defects.query({ granularity, ...range }),
        trpc.productionReporting.onTime.query({ granularity, ...range }),
      ]);
      setLeadTime(lt as LeadTimeOverview);
      setDefects(df as DefectOverview);
      setOnTime(ot as OnTimeOverview);

      if (!isProduction) {
        const [rev, ord, cmp, shop, pg, art, qc] = await Promise.all([
          trpc.reporting.revenueOverview.query({ granularity, ...range }),
          trpc.reporting.orderOverview.query({ granularity, ...range }),
          trpc.reporting.compareRevenue.query({ granularity }),
          trpc.reporting.revenueByShop.query(range),
          trpc.reporting.revenueByPriceGroup.query(range),
          trpc.reporting.revenueByArticle.query(range),
          trpc.reporting.quoteConversion.query(range),
        ]);
        setRevenue(rev as RevenueOverview);
        setOrders(ord as OrderOverview);
        setCompare(cmp as PeriodComparison);
        setByShop(shop as BreakdownItem[]);
        setByPriceGroup(pg as BreakdownItem[]);
        setByArticle(art as BreakdownItem[]);
        setQuoteConv(qc as QuoteConversion);
      }
    } catch (err) {
      setStatus(`Fehler: ${(err as Error).message}`);
    }
  }, [granularity, from, to, isProduction]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAi = useCallback(async () => {
    setAiBusy(true);
    try {
      setAi((await trpc.reporting.aiSummary.mutate({ granularity, ...buildRange(from, to) })) as AiSummary);
    } catch (err) {
      setStatus(`KI-Fehler: ${(err as Error).message}`);
    } finally {
      setAiBusy(false);
    }
  }, [granularity, from, to]);

  const exportPdf = useCallback(
    async (full: boolean) => {
      setPdfBusy(true);
      try {
        const input = { granularity, ...buildRange(from, to) };
        const res = (await (full
          ? trpc.reporting.exportFullPdf.mutate(input)
          : trpc.reporting.exportPdf.mutate(input))) as { fileName: string; pdfBase64: string };
        downloadBase64Pdf(res.fileName, res.pdfBase64);
      } catch (err) {
        setStatus(`PDF-Fehler: ${(err as Error).message}`);
      } finally {
        setPdfBusy(false);
      }
    },
    [granularity, from, to]
  );

  return (
    <Stack gap="md">
      <Title order={3}>Auswertungen</Title>
      <Group align="end" gap="sm">
        <Select
          label="Zeitraum" w={120} allowDeselect={false}
          data={[{ value: "DAY", label: "Tag" }, { value: "WEEK", label: "Woche" }, { value: "MONTH", label: "Monat" }, { value: "YEAR", label: "Jahr" }]}
          value={granularity} onChange={(v) => v && setGranularity(v as Granularity)}
        />
        <TextInput label="von" type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
        <TextInput label="bis" type="date" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
        {(from || to) && (
          <Button variant="subtle" onClick={() => { setFrom(""); setTo(""); }}>Zeitraum zurücksetzen</Button>
        )}
        <Button variant="default" onClick={() => void load()}>Aktualisieren</Button>
        {!isProduction && (
          <>
            <Button variant="default" onClick={() => void exportPdf(false)} disabled={pdfBusy}>{pdfBusy ? "PDF…" : "Umsatz-PDF"}</Button>
            <Button variant="default" onClick={() => void exportPdf(true)} disabled={pdfBusy}>{pdfBusy ? "PDF…" : "Gesamtbericht (PDF)"}</Button>
          </>
        )}
      </Group>
      {status && <Text size="sm"><em>{status}</em></Text>}

      {!isProduction && revenue && orders && compare && (
        <Card withBorder padding="md">
          <CardHead
            title="Umsatz & Aufträge"
            onCsv={() =>
              downloadCsv(
                `umsatz-${granularity}.csv`,
                ["Periode", "Umsatz Netto (Cent)", "Rechnungen", "Aufträge", "Auftragswert (Cent)"],
                revenue.buckets.map((b) => {
                  const o = orders.buckets.find((x) => x.key === b.key);
                  return [b.key, String(b.netCents), String(b.count), String(o?.count ?? 0), String(o?.netCents ?? 0)];
                })
              )
            }
          />
          <Group gap="lg">
            <Text size="sm">Umsatz gesamt: <b>{euro(revenue.totalNetCents)}</b></Text>
            <Text size="sm">Aufträge gesamt: <b>{orders.totalCount}</b></Text>
            <Text size="sm">Vergleich {compare.current.key}: <b>{euro(compare.deltaCents)}</b> ({pct(compare.deltaPercent)})</Text>
          </Group>
          <LineChart data={revenue.buckets.map((b) => ({ label: b.key, value: b.netCents }))} format={euro} />
          <Table striped withTableBorder mt="sm" verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Periode</Table.Th>
                <Table.Th ta="right">Umsatz (Netto)</Table.Th>
                <Table.Th ta="right">Rechnungen</Table.Th>
                <Table.Th ta="right">Aufträge</Table.Th>
                <Table.Th ta="right">Auftragswert</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {revenue.buckets.map((b) => {
                const o = orders.buckets.find((x) => x.key === b.key);
                return (
                  <Table.Tr key={b.key}>
                    <Table.Td>{b.key}</Table.Td>
                    <Table.Td style={numTd}>{euro(b.netCents)}</Table.Td>
                    <Table.Td style={numTd}>{b.count}</Table.Td>
                    <Table.Td style={numTd}>{o?.count ?? 0}</Table.Td>
                    <Table.Td style={numTd}>{euro(o?.netCents ?? 0)}</Table.Td>
                  </Table.Tr>
                );
              })}
              {revenue.buckets.length === 0 && <Table.Tr><Table.Td colSpan={5}>Keine Daten.</Table.Td></Table.Tr>}
            </Table.Tbody>
          </Table>

          <Group mt="md">
            <Button variant="default" onClick={() => void runAi()} disabled={aiBusy}>
              {aiBusy ? "KI erstellt Bericht…" : "KI-Zusammenfassung erstellen"}
            </Button>
          </Group>
          {ai && (
            <Paper bg="var(--mantine-color-gray-0)" p="sm" radius="sm" mt="xs">
              <Text size="sm">{ai.narrative}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {ai.aiGenerated ? "KI-generiert (Claude)" : "Automatische Heuristik (keine KI verfügbar)"}
              </Text>
            </Paper>
          )}
        </Card>
      )}

      {!isProduction && quoteConv && (
        <Card withBorder padding="md">
          <CardHead
            title="Angebots-Erfolgsquote (Conversion)"
            onCsv={() => downloadCsv("angebots-erfolgsquote.csv",
              ["Kennzahl", "Wert"],
              [["Win-Rate %", String(quoteConv.winRatePercent)], ["Gewonnen", String(quoteConv.won)], ["Verloren", String(quoteConv.lost)], ["Offen", String(quoteConv.open)],
               ["Angebotswert gesamt (Cent)", String(quoteConv.quotedNetCents)], ["Gewonnener Wert (Cent)", String(quoteConv.wonNetCents)],
               ...quoteConv.lossReasons.map((r) => [`Verlustgrund: ${r.reason}`, String(r.count)] as [string, string])])}
          />
          <Group gap="lg">
            <Text size="sm">Win-Rate: <b>{quoteConv.winRatePercent} %</b></Text>
            <Text size="sm">Gewonnen: <b>{quoteConv.won}</b></Text>
            <Text size="sm">Verloren: <b>{quoteConv.lost}</b></Text>
            <Text size="sm">Offen: <b>{quoteConv.open}</b></Text>
            <Text size="sm">Gewonnener Wert: <b>{euro(quoteConv.wonNetCents)}</b> / {euro(quoteConv.quotedNetCents)}</Text>
          </Group>
          {quoteConv.lossReasons.length > 0 && (
            <>
              <Text size="sm" fw={600} mt="sm" mb={4}>Verlustgründe</Text>
              <Table striped withTableBorder verticalSpacing="xs" w="auto">
                <Table.Thead><Table.Tr><Table.Th>Grund</Table.Th><Table.Th ta="right">Anzahl</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {quoteConv.lossReasons.map((r) => (
                    <Table.Tr key={r.reason}><Table.Td>{r.reason}</Table.Td><Table.Td style={numTd}>{r.count}</Table.Td></Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </>
          )}
        </Card>
      )}

      {!isProduction && <Breakdown title="Umsatz nach Shop" items={byShop} fileName={`umsatz-shop-${granularity}.csv`} />}
      {!isProduction && <Breakdown title="Umsatz nach Kundengruppe" items={byPriceGroup} fileName={`umsatz-kundengruppe-${granularity}.csv`} />}
      {!isProduction && <Breakdown title="Umsatz nach Artikel/Veredelung (Auftragswert)" items={byArticle} fileName={`umsatz-artikel-${granularity}.csv`} />}

      {leadTime && (
        <Card withBorder padding="md">
          <CardHead
            title="Durchlaufzeit"
            onCsv={() => downloadCsv(`durchlaufzeit-${granularity}.csv`, ["Periode", "Aufträge", "Ø Durchlaufzeit (h)"], leadTime.buckets.map((b) => [b.key, String(b.count), String(b.avgHours)]))}
          />
          <Group gap="lg">
            <Text size="sm">Ø: <b>{leadTime.stats.avgHours} h</b></Text>
            <Text size="sm">Median: <b>{leadTime.stats.medianHours} h</b></Text>
            <Text size="sm">Min/Max: <b>{leadTime.stats.minHours} / {leadTime.stats.maxHours} h</b></Text>
            <Text size="sm">Aufträge: <b>{leadTime.stats.count}</b></Text>
          </Group>
          <LineChart data={leadTime.buckets.map((b) => ({ label: b.key, value: b.avgHours }))} format={(v) => `${v} h`} />
          <Table striped withTableBorder mt="sm" verticalSpacing="xs">
            <Table.Thead><Table.Tr><Table.Th>Periode</Table.Th><Table.Th ta="right">Aufträge</Table.Th><Table.Th ta="right">Ø Durchlaufzeit</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {leadTime.buckets.map((b) => (
                <Table.Tr key={b.key}><Table.Td>{b.key}</Table.Td><Table.Td style={numTd}>{b.count}</Table.Td><Table.Td style={numTd}>{b.avgHours} h</Table.Td></Table.Tr>
              ))}
              {leadTime.buckets.length === 0 && <Table.Tr><Table.Td colSpan={3}>Keine Daten.</Table.Td></Table.Tr>}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {defects && (
        <Card withBorder padding="md">
          <CardHead
            title="Fehlerquote (Reklamationen)"
            onCsv={() => downloadCsv(`fehlerquote-${granularity}.csv`, ["Periode", "Aufträge", "Reklamationen", "Quote (%)"], defects.buckets.map((b) => [b.key, String(b.total), String(b.defects), b.ratePercent == null ? "" : String(b.ratePercent)]))}
          />
          <Group gap="lg">
            <Text size="sm">Gesamt: <b>{ratePct(defects.overall.ratePercent)}</b> ({defects.overall.defects}/{defects.overall.total})</Text>
            <Text size="sm">Lieferant: <b>{defects.byCause.LIEFERANT}</b></Text>
            <Text size="sm">Intern: <b>{defects.byCause.INTERN}</b></Text>
            <Text size="sm">Veredler: <b>{defects.byCause.EXTERN_VEREDLER}</b></Text>
          </Group>
          <BarChart
            data={[
              { label: "Lieferant", value: defects.byCause.LIEFERANT },
              { label: "Intern", value: defects.byCause.INTERN },
              { label: "Veredler", value: defects.byCause.EXTERN_VEREDLER },
            ]}
            format={(v) => String(v)}
            height={160}
          />
          <Table striped withTableBorder mt="sm" verticalSpacing="xs">
            <Table.Thead><Table.Tr><Table.Th>Periode</Table.Th><Table.Th ta="right">Aufträge</Table.Th><Table.Th ta="right">Reklamationen</Table.Th><Table.Th ta="right">Quote</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {defects.buckets.map((b) => (
                <Table.Tr key={b.key}><Table.Td>{b.key}</Table.Td><Table.Td style={numTd}>{b.total}</Table.Td><Table.Td style={numTd}>{b.defects}</Table.Td><Table.Td style={numTd}>{ratePct(b.ratePercent)}</Table.Td></Table.Tr>
              ))}
              {defects.buckets.length === 0 && <Table.Tr><Table.Td colSpan={4}>Keine Daten.</Table.Td></Table.Tr>}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {onTime && (
        <Card withBorder padding="md">
          <CardHead
            title="Termintreue"
            onCsv={() => downloadCsv(`termintreue-${granularity}.csv`, ["Periode", "Aufträge", "Pünktlich", "Quote (%)"], onTime.buckets.map((b) => [b.key, String(b.total), String(b.onTime), b.ratePercent == null ? "" : String(b.ratePercent)]))}
          />
          <Group gap="lg">
            <Text size="sm">Gesamt: <b>{ratePct(onTime.overall.ratePercent)}</b> ({onTime.overall.onTime}/{onTime.overall.total})</Text>
          </Group>
          <LineChart data={onTime.buckets.map((b) => ({ label: b.key, value: b.ratePercent ?? 0 }))} format={(v) => `${v} %`} />
          <Table striped withTableBorder mt="sm" verticalSpacing="xs">
            <Table.Thead><Table.Tr><Table.Th>Periode</Table.Th><Table.Th ta="right">Aufträge</Table.Th><Table.Th ta="right">Pünktlich</Table.Th><Table.Th ta="right">Quote</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {onTime.buckets.map((b) => (
                <Table.Tr key={b.key}><Table.Td>{b.key}</Table.Td><Table.Td style={numTd}>{b.total}</Table.Td><Table.Td style={numTd}>{b.onTime}</Table.Td><Table.Td style={numTd}>{ratePct(b.ratePercent)}</Table.Td></Table.Tr>
              ))}
              {onTime.buckets.length === 0 && <Table.Tr><Table.Td colSpan={4}>Keine Daten.</Table.Td></Table.Tr>}
            </Table.Tbody>
          </Table>
        </Card>
      )}
    </Stack>
  );
}

function Breakdown({ title, items, fileName }: { title: string; items: BreakdownItem[]; fileName: string }): JSX.Element {
  return (
    <Card withBorder padding="md">
      <CardHead
        title={title}
        onCsv={() => downloadCsv(fileName, ["Bezeichnung", "Umsatz Netto (Cent)", "Rechnungen", "Anteil (%)"], items.map((i) => [i.name, String(i.netCents), String(i.count), i.sharePercent == null ? "" : String(i.sharePercent)]))}
      />
      <BarChart data={items.map((i) => ({ label: i.name, value: i.netCents }))} format={euro} />
      <Table striped withTableBorder mt="sm" verticalSpacing="xs">
        <Table.Thead><Table.Tr><Table.Th>Bezeichnung</Table.Th><Table.Th ta="right">Umsatz (Netto)</Table.Th><Table.Th ta="right">Rechnungen</Table.Th><Table.Th ta="right">Anteil</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {items.map((i) => (
            <Table.Tr key={i.label}>
              <Table.Td>{i.name}</Table.Td>
              <Table.Td style={numTd}>{euro(i.netCents)}</Table.Td>
              <Table.Td style={numTd}>{i.count}</Table.Td>
              <Table.Td style={numTd}>{ratePct(i.sharePercent)}</Table.Td>
            </Table.Tr>
          ))}
          {items.length === 0 && <Table.Tr><Table.Td colSpan={4}>Keine Daten.</Table.Td></Table.Tr>}
        </Table.Tbody>
      </Table>
    </Card>
  );
}
