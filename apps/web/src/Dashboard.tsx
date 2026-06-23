// Start-Dashboard: ebenenübergreifende Termin-Ampel (Kap. 35.4) — ersetzt die
// Excel-Terminliste. Verdichtete Kennzahlen (ROT/GELB/GRÜN, überfällig, kritisch)
// plus die dringendsten Vorgänge zuerst. Reine Leseansicht über ampel.summary/overview.
// Status nie allein über Farbe (Symbol + Text doppeln, Web Interface Guidelines).
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Badge, Button, Card, Group, Loader, SimpleGrid, Table, Text, Title } from "@mantine/core";
import { trpc } from "./trpc.js";
import { downloadBase64Pdf, downloadCsv } from "./export.js";
import { statusColor } from "./theme.js";

type AmpelStatus = "GRUEN" | "GELB" | "ROT";
type ProcessLevel = "ANGEBOT" | "AUFTRAG" | "PRODUKTION" | "VEREDLER";
interface AmpelRow {
  id: string; level: ProcessLevel; label: string; dueDate: string; done: boolean;
  ampel: AmpelStatus; daysRemaining: number; overdueDays: number; escalation: 0 | 1 | 2;
}
interface AmpelSummary {
  total: number; rot: number; gelb: number; gruen: number; overdue: number; kritisch: number;
  mostUrgent: AmpelRow | null; byLevel: Record<ProcessLevel, { rot: number; gelb: number; gruen: number }>;
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const AMPEL_LABEL: Record<AmpelStatus, string> = { ROT: "Überfällig", GELB: "Knapp", GRUEN: "Im Plan" };
const LEVEL_LABEL: Record<ProcessLevel, string> = { ANGEBOT: "Angebote", AUFTRAG: "Aufträge", PRODUKTION: "Produktion", VEREDLER: "Veredler" };

/** Status-Chip mit Symbol + Text (Signal nie allein über Farbe). */
function AmpelBadge({ s }: { s: AmpelStatus }): JSX.Element {
  const sym = s === "ROT" ? "●" : s === "GELB" ? "▲" : "✓";
  return <Badge color={statusColor(s)} variant="light">{sym} {AMPEL_LABEL[s]}</Badge>;
}

/** Kennzahl-Karte (große Zahl + Label + optionaler Hinweis). */
function Kpi({ value, label, color, hint }: { value: number; label: string; color?: string; hint?: string }): JSX.Element {
  return (
    <Card padding="sm">
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.4 }}>{label}</Text>
      <Text fz={30} fw={700} lh={1.1} mt={4} c={color} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</Text>
      {hint && <Text size="xs" c="dimmed" mt={2}>{hint}</Text>}
    </Card>
  );
}

const fmtRemaining = (r: AmpelRow): string =>
  r.done ? "erledigt"
    : r.overdueDays > 0 ? `${r.overdueDays} T überfällig`
    : r.daysRemaining === 0 ? "heute fällig"
    : `in ${r.daysRemaining} T`;

export function Dashboard(): JSX.Element {
  const [summary, setSummary] = useState<AmpelSummary | null>(null);
  const [rows, setRows] = useState<AmpelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [s, o] = await Promise.all([
        trpc.ampel.summary.query() as Promise<AmpelSummary>,
        trpc.ampel.overview.query() as Promise<AmpelRow[]>,
      ]);
      setSummary(s); setRows(o);
    } catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <Group p="md" gap="xs"><Loader size="sm" /><Text size="sm">lädt…</Text></Group>;
  if (err) return <Alert color="red" title="Fehler">{err}</Alert>;
  if (!summary) return <Text c="dimmed">Keine Daten.</Text>;

  const exportCsv = async (): Promise<void> => {
    try {
      const wl = await trpc.ampel.worklist.query();
      downloadCsv(`termin-ampel-${new Date().toISOString().slice(0, 10)}.csv`, wl.columns, wl.rows);
    } catch (e) { setErr(errMsg(e)); }
  };
  const exportPdf = async (): Promise<void> => {
    try {
      const res = await trpc.ampel.worklistPdf.mutate();
      downloadBase64Pdf(res.fileName, res.pdfBase64);
    } catch (e) { setErr(errMsg(e)); }
  };

  const urgent = summary.mostUrgent;
  return (
    <>
      <Group justify="space-between" align="start" wrap="nowrap">
        <Title order={3}>Übersicht — Termin-Ampel</Title>
        <Group gap="xs">
          <Button size="xs" variant="default" onClick={() => void exportPdf()}>Arbeitsliste (PDF)</Button>
          <Button size="xs" variant="default" onClick={() => void exportCsv()}>CSV</Button>
        </Group>
      </Group>
      <Text size="sm" c="dimmed" mt={4}>Ebenenübergreifende Terminlage (Kap. 35.4): dringendste Vorgänge zuerst. Ersetzt die Excel-Terminliste. Für den Offline-Notbetrieb (K-17) als PDF/CSV exportierbar.</Text>

      {urgent && (
        <Alert mt="md" variant="light" color={statusColor(urgent.ampel)} title="Dringendster Vorgang">
          <Group gap="xs">
            <AmpelBadge s={urgent.ampel} />
            <Text size="sm" fw={600}>{LEVEL_LABEL[urgent.level]} · {urgent.label}</Text>
            <Text size="sm" c="dimmed">— {fmtRemaining(urgent)}</Text>
          </Group>
        </Alert>
      )}

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} mt="md" spacing="sm">
        <Kpi value={summary.total} label="Vorgänge" />
        <Kpi value={summary.rot} label="Überfällig" color={summary.rot ? "red.7" : undefined} hint="ROT" />
        <Kpi value={summary.gelb} label="Knapp" color={summary.gelb ? "amber.7" : undefined} hint="GELB" />
        <Kpi value={summary.gruen} label="Im Plan" color={summary.gruen ? "teal.7" : undefined} hint="GRÜN" />
        <Kpi value={summary.overdue} label="Überfällige" hint="echte Fristen" />
        <Kpi value={summary.kritisch} label="Kritisch" color={summary.kritisch ? "red.7" : undefined} hint="Eskalation 2" />
      </SimpleGrid>

      <Title order={4} mt="lg">Status je Ebene</Title>
      <Table mt="xs" withTableBorder verticalSpacing="xs" fz="sm" w="auto">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Ebene</Table.Th><Table.Th ta="right">Überfällig</Table.Th>
            <Table.Th ta="right">Knapp</Table.Th><Table.Th ta="right">Im Plan</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(Object.keys(summary.byLevel) as ProcessLevel[]).map((lvl) => {
            const b = summary.byLevel[lvl];
            const td = (n: number, c: string): ReactNode =>
              <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }} c={n ? c : "dimmed"}>{n}</Table.Td>;
            return (
              <Table.Tr key={lvl}>
                <Table.Td>{LEVEL_LABEL[lvl]}</Table.Td>
                {td(b.rot, "red.7")}{td(b.gelb, "amber.7")}{td(b.gruen, "teal.7")}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      <Title order={4} mt="lg">Dringlichkeitsliste</Title>
      {rows.length === 0 ? <Text c="dimmed" mt="sm">Keine terminierten Vorgänge.</Text> : (
        <Table striped highlightOnHover withTableBorder mt="xs" verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ampel</Table.Th><Table.Th>Ebene</Table.Th><Table.Th>Vorgang</Table.Th>
              <Table.Th>Fällig am</Table.Th><Table.Th ta="right">Frist</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={`${r.level}-${r.id}`}>
                <Table.Td><AmpelBadge s={r.ampel} /></Table.Td>
                <Table.Td>{LEVEL_LABEL[r.level]}</Table.Td>
                <Table.Td>{r.label}</Table.Td>
                <Table.Td>{new Date(r.dueDate).toLocaleDateString("de-DE")}</Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }}
                  c={r.overdueDays > 0 ? "red.7" : "dimmed"}>{fmtRemaining(r)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}
