// Statusverwaltung — Ampel (Xentral-Vorbild). Drei Sichten:
//  • Auftragsampel: je aktivem Auftrag eine Prüf-Matrix (Bestand, USt-IdNr., Liefertermin,
//    Lieferung, Faktura, Zahlung, Produktion, Freigabe, Liefersperre) + Gesamtampel.
//  • Angebotsampel / Produktionsampel: Termin-Ampel der jeweiligen Ebene (ROT zuerst).
import { useEffect, useState, type JSX } from "react";
import { Alert, Badge, Box, Group, Loader, Table, Tabs, Text, Title, Tooltip } from "@mantine/core";
import { trpc } from "./trpc.js";
import { prettyStatus } from "./theme.js";

type Lamp = "GRUEN" | "GELB" | "ROT" | "GRAU";
const LAMP_COLOR: Record<Lamp, string> = { GRUEN: "green", GELB: "yellow", ROT: "red", GRAU: "gray" };
const LAMP_LABEL: Record<Lamp, string> = { GRUEN: "OK", GELB: "Achtung", ROT: "Problem", GRAU: "—" };
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function Dot({ lamp, title }: { lamp: Lamp; title?: string }): JSX.Element {
  const dot = <Box style={{ width: 12, height: 12, borderRadius: "50%", background: `var(--mantine-color-${LAMP_COLOR[lamp]}-6)`, display: "inline-block" }} />;
  return title ? <Tooltip label={title} withArrow><span style={{ display: "inline-flex" }}>{dot}</span></Tooltip> : dot;
}

// ── Auftragsampel ────────────────────────────────────────────────────────────
// Prüfungsbasierte Matrix (wiederverwendbar: Status-Ampel-Seite UND #orders-Tab).
// onOpenOrder (optional): Zeilenklick öffnet den Auftrag.
export function Auftragsampel({ onOpenOrder }: { onOpenOrder?: (id: string) => void } = {}): JSX.Element {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof trpc.ampel.auftragsampel.query>>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void (async () => {
    try { setRows(await trpc.ampel.auftragsampel.query()); setErr(null); }
    catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  })(); }, []);

  if (loading) return <Loader mt="md" />;
  if (err) return <Alert color="red" mt="md">{err}</Alert>;
  const counts = { ROT: 0, GELB: 0, GRUEN: 0, GRAU: 0 } as Record<Lamp, number>;
  for (const r of rows) counts[r.overall as Lamp] += 1;
  // Spaltenüberschriften aus den Lampen der ersten Zeile (alle Aufträge prüfen dieselben Checks).
  const checkCols = rows[0]?.checks.map((c) => ({ key: c.key, label: c.label })) ?? [];

  return (
    <>
      <Group gap="xs" mt="sm" mb="xs">
        <Badge color="red" variant="light" size="lg">{counts.ROT} Problem</Badge>
        <Badge color="yellow" variant="light" size="lg">{counts.GELB} Achtung</Badge>
        <Badge color="green" variant="light" size="lg">{counts.GRUEN} OK</Badge>
        <Text size="sm" c="dimmed">· {rows.length} aktive Aufträge</Text>
      </Group>
      {rows.length === 0 ? <Text size="sm" c="dimmed">Keine aktiven Aufträge.</Text> : (
        <Table.ScrollContainer minWidth={900}>
          <Table striped withTableBorder verticalSpacing="xs" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Gesamt</Table.Th><Table.Th>Auftrag</Table.Th><Table.Th>Kunde</Table.Th>
                <Table.Th>Status</Table.Th><Table.Th>Liefertermin</Table.Th>
                {checkCols.map((c) => <Table.Th key={c.key} style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", padding: "4px 2px" }}>{c.label}</Table.Th>)}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.id} style={onOpenOrder ? { cursor: "pointer" } : undefined}
                  onClick={onOpenOrder ? () => onOpenOrder(r.id) : undefined}>
                  <Table.Td><Tooltip label={LAMP_LABEL[r.overall as Lamp]} withArrow><Badge color={LAMP_COLOR[r.overall as Lamp]} variant="filled" radius="sm">{r.overall === "ROT" ? "!" : r.overall === "GELB" ? "•" : "✓"}</Badge></Tooltip></Table.Td>
                  <Table.Td><Text size="sm" fw={600}>{r.number}</Text></Table.Td>
                  <Table.Td>{r.companyName}</Table.Td>
                  <Table.Td><Text size="xs">{prettyStatus(r.status)}</Text></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{r.liefertermin ? new Date(r.liefertermin).toLocaleDateString("de-DE") : "—"}</Text></Table.Td>
                  {r.checks.map((c) => <Table.Td key={c.key} ta="center"><Dot lamp={c.lamp as Lamp} title={`${c.label}: ${c.hint}`} /></Table.Td>)}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Text size="xs" c="dimmed" mt="xs">Spalten = Prüfungen (Maus über einen Punkt zeigt das Detail). Gesamt: ROT = Versand blockiert, GELB = Hinweis, GRÜN = bereit.</Text>
    </>
  );
}

// ── Auftragsebene: Ampel-Matrix + Prozesskette EINES Auftrags (Auftragsdetail-Tab) ──
type StageState = "DONE" | "AKTIV" | "OFFEN" | "NA";
const STAGE_COLOR: Record<StageState, string> = { DONE: "green", AKTIV: "blue", OFFEN: "gray", NA: "gray" };
const STAGE_ICON: Record<StageState, string> = { DONE: "✓", AKTIV: "→", OFFEN: "○", NA: "–" };

export function OrderAmpelDetail({ orderId }: { orderId: string }): JSX.Element {
  const [data, setData] = useState<Awaited<ReturnType<typeof trpc.ampel.auftragDetail.query>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void (async () => {
    setLoading(true);
    try { setData(await trpc.ampel.auftragDetail.query({ orderId })); setErr(null); }
    catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  })(); }, [orderId]);

  if (loading) return <Loader mt="md" />;
  if (err) return <Alert color="red" mt="md">{err}</Alert>;
  if (!data) return <Text c="dimmed" mt="md">Keine Daten.</Text>;

  return (
    <Group align="flex-start" gap="xl" mt="xs" wrap="wrap">
      <Box style={{ minWidth: 260 }}>
        <Group gap="xs" mb="xs">
          <Text fw={600}>Auftragsampel</Text>
          <Badge color={LAMP_COLOR[data.overall as Lamp]} variant="filled">{LAMP_LABEL[data.overall as Lamp]}</Badge>
        </Group>
        {data.checks.map((c) => (
          <Group key={c.key} gap="sm" py={4} wrap="nowrap" style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}>
            <Dot lamp={c.lamp as Lamp} />
            <Text size="sm" style={{ width: 140 }}>{c.label}</Text>
            <Text size="xs" c="dimmed" style={{ flex: 1 }}>{c.hint}</Text>
          </Group>
        ))}
      </Box>
      <Box style={{ minWidth: 280 }}>
        <Text fw={600} mb="xs">Prozesskette</Text>
        {data.prozess.map((s) => (
          <Group key={s.key} gap="sm" py={4} wrap="nowrap" style={{ opacity: s.state === "NA" ? 0.5 : 1 }}>
            <Badge w={24} h={24} circle color={STAGE_COLOR[s.state as StageState]} variant={s.state === "AKTIV" ? "filled" : "light"} p={0}>{STAGE_ICON[s.state as StageState]}</Badge>
            <Box>
              <Text size="sm" fw={s.state === "AKTIV" ? 700 : 500}>{s.label}</Text>
              <Text size="xs" c="dimmed">{s.hint}</Text>
            </Box>
          </Group>
        ))}
      </Box>
    </Group>
  );
}

export function StatusAmpelPage({ onOpen }: { onOpen?: (navKey: string, id: string) => void }): JSX.Element {
  return (
    <>
      <Title order={3}>Status-Ampel — Auftragsprüfungen</Title>
      <Text size="sm" c="dimmed" mt={4}>
        Prüfungsbasierte Matrix je Auftrag (Bestand, USt-IdNr., Zahlung, Produktion, Freigabe, Liefersperre …) —
        was ist versandbereit, was blockiert. Die <b>fristbasierte</b> Sicht (Angebote/Produktion nach Liefertermin)
        liegt in der <b>Termin-Ampel</b> (Start). Zeilenklick öffnet den Auftrag.
      </Text>
      <Auftragsampel onOpenOrder={onOpen ? (id) => onOpen("orders", id) : undefined} />
    </>
  );
}
