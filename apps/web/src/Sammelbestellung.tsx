// Sammelbestellungen (Kap. 18.2): gebündelte Mitarbeiter-Shopbestellungen je Periode.
//  • Liste der Sammelbestellungen (Shop, Kunde, Periode, Status, #Aufträge).
//  • Detail: Artikel und Veredelung über alle Mitglieds-Aufträge zusammengefasst.
//  • Shop-Modus konfigurieren (SOFORT vs. SAMMEL + Intervall).
import { useCallback, useEffect, useState, type JSX } from "react";
import { Alert, Badge, Box, Button, Group, Loader, Select, Table, Tabs, Text, Title } from "@mantine/core";
import { trpc } from "./trpc.js";

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const STATUS_COLOR: Record<string, string> = { OFFEN: "blue", GEBUENDELT: "teal", UMGESETZT: "green" };
const INTERVAL_LABEL: Record<string, string> = { WOECHENTLICH: "Wöchentlich", MONATLICH: "Monatlich", QUARTALSWEISE: "Quartalsweise", HALBJAEHRLICH: "Halbjährlich" };
const fmtDate = (d: unknown): string => new Date(String(d)).toLocaleDateString("de-DE");

// ── Liste + Detail ───────────────────────────────────────────────────────────
function Liste(): JSX.Element {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof trpc.sammelbestellung.list.query>>>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { setRows(await trpc.sammelbestellung.list.query()); setErr(null); }
    catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const [bundleMsg, setBundleMsg] = useState<string | null>(null);
  const autoBundle = async (): Promise<void> => {
    setBundleMsg(null);
    try { const r = await trpc.sammelbestellung.autoBundleDue.mutate(); setBundleMsg(r.bundled === 0 ? "Keine abgelaufenen Perioden offen." : `${r.bundled} abgelaufene Sammelbestellung(en) gebündelt: ${r.numbers.join(", ")}.`); await load(); }
    catch (e) { setErr(errMsg(e)); }
  };

  if (loading) return <Loader mt="md" />;
  if (err) return <Alert color="red" mt="md">{err}</Alert>;

  return (
    <>
      <Group mt="md" mb="xs" justify="space-between">
        <Text size="xs" c="dimmed">Automatik: ein stündlicher Cron-Job bündelt abgelaufene Perioden selbst. Manuell auslösen:</Text>
        <Button size="compact-sm" variant="light" onClick={() => void autoBundle()}>Abgelaufene jetzt bündeln</Button>
      </Group>
      {bundleMsg && <Alert color="green" mb="xs" withCloseButton onClose={() => setBundleMsg(null)}>{bundleMsg}</Alert>}
      {rows.length === 0 ? <Text size="sm" c="dimmed">Noch keine Sammelbestellungen. Sobald ein SAMMEL-Shop Bestellungen liefert, erscheinen sie hier gebündelt.</Text> : (
      <Table striped withTableBorder verticalSpacing="xs" fz="sm">
        <Table.Thead><Table.Tr>
          <Table.Th>Nummer</Table.Th><Table.Th>Shop</Table.Th><Table.Th>Kunde</Table.Th>
          <Table.Th>Intervall</Table.Th><Table.Th>Periode</Table.Th><Table.Th ta="right">Aufträge</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td><Text size="sm" fw={600}>{r.number}</Text></Table.Td>
              <Table.Td>{r.shopName}</Table.Td>
              <Table.Td>{r.companyName}</Table.Td>
              <Table.Td>{INTERVAL_LABEL[r.interval] ?? r.interval}</Table.Td>
              <Table.Td><Text size="xs" c="dimmed">{fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}</Text></Table.Td>
              <Table.Td ta="right">{r.orderCount}</Table.Td>
              <Table.Td><Badge color={STATUS_COLOR[r.status] ?? "gray"} variant="light">{r.status}</Badge></Table.Td>
              <Table.Td><Button size="compact-xs" variant={openId === r.id ? "filled" : "subtle"} onClick={() => setOpenId((c) => c === r.id ? null : r.id)}>Bündelung</Button></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      )}
      {openId && <Detail id={openId} onChanged={load} />}
    </>
  );
}

function Detail({ id, onChanged }: { id: string; onChanged: () => Promise<void> }): JSX.Element {
  const [data, setData] = useState<Awaited<ReturnType<typeof trpc.sammelbestellung.detail.query>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setData(await trpc.sammelbestellung.detail.query({ id })); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (err) return <Alert color="red" mt="md">{err}</Alert>;
  if (!data) return <Loader mt="md" />;

  const setStatus = async (status: "GEBUENDELT" | "UMGESETZT"): Promise<void> => {
    try { await trpc.sammelbestellung.setStatus.mutate({ id, status }); await load(); await onChanged(); }
    catch (e) { setErr(errMsg(e)); }
  };

  return (
    <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
      <Group justify="space-between" mb="sm">
        <Box>
          <Title order={4}>{data.number} · {data.companyName}</Title>
          <Text size="xs" c="dimmed">{data.shopName} · {INTERVAL_LABEL[data.interval] ?? data.interval} · {fmtDate(data.periodStart)}–{fmtDate(data.periodEnd)} · {data.orderCount} Aufträge</Text>
        </Box>
        <Group gap="xs">
          {data.status === "OFFEN" && <Button size="compact-sm" variant="light" color="teal" onClick={() => void setStatus("GEBUENDELT")}>Bündeln (abschließen)</Button>}
          {data.status !== "UMGESETZT" && <Button size="compact-sm" color="green" onClick={() => void setStatus("UMGESETZT")}>In Produktion geben</Button>}
        </Group>
      </Group>

      <Group align="flex-start" gap="xl" wrap="wrap">
        <Box style={{ minWidth: 320 }}>
          <Text fw={600} mb={4}>Artikel zusammengefasst <Text span c="dimmed" size="sm">(Σ {data.bundle.gesamtArtikel})</Text></Text>
          {data.bundle.artikel.length === 0 ? <Text size="sm" c="dimmed">—</Text> : (
            <Table withTableBorder verticalSpacing={4} fz="sm">
              <Table.Thead><Table.Tr><Table.Th>Artikel</Table.Th><Table.Th ta="right">Menge</Table.Th><Table.Th ta="right">Pos.</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{data.bundle.artikel.map((a) => (
                <Table.Tr key={a.key}><Table.Td>{a.label}</Table.Td><Table.Td ta="right"><b>{a.qty}</b></Table.Td><Table.Td ta="right"><Text size="xs" c="dimmed">{a.positionen}</Text></Table.Td></Table.Tr>
              ))}</Table.Tbody>
            </Table>
          )}
        </Box>
        <Box style={{ minWidth: 320 }}>
          <Text fw={600} mb={4}>Veredelung zusammengefasst <Text span c="dimmed" size="sm">(Σ {data.bundle.gesamtVeredelung})</Text></Text>
          {data.bundle.veredelung.length === 0 ? <Text size="sm" c="dimmed">Keine Veredelungspositionen.</Text> : (
            <Table withTableBorder verticalSpacing={4} fz="sm">
              <Table.Thead><Table.Tr><Table.Th>Veredelung</Table.Th><Table.Th ta="right">Menge</Table.Th><Table.Th ta="right">Pos.</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{data.bundle.veredelung.map((a) => (
                <Table.Tr key={a.key}><Table.Td>{a.label}</Table.Td><Table.Td ta="right"><b>{a.qty}</b></Table.Td><Table.Td ta="right"><Text size="xs" c="dimmed">{a.positionen}</Text></Table.Td></Table.Tr>
              ))}</Table.Tbody>
            </Table>
          )}
        </Box>
      </Group>

      <Text fw={600} mt="md" mb={4}>Enthaltene Mitarbeiter-Bestellungen ({data.orders.length})</Text>
      {data.orders.map((o) => (
        <Text key={o.id} size="sm" py={2} style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}>
          {o.number} · {o.lineCount} Position(en){o.employeeNote ? ` · ${o.employeeNote}` : ""}
        </Text>
      ))}
    </Box>
  );
}

// ── Shop-Modus konfigurieren ─────────────────────────────────────────────────
const INTERVALS = [
  { value: "WOECHENTLICH", label: "Wöchentlich" }, { value: "MONATLICH", label: "Monatlich" },
  { value: "QUARTALSWEISE", label: "Quartalsweise" }, { value: "HALBJAEHRLICH", label: "Halbjährlich" },
];

function ShopKonfig(): JSX.Element {
  const [shops, setShops] = useState<Awaited<ReturnType<typeof trpc.sammelbestellung.shops.query>>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { setShops(await trpc.sammelbestellung.shops.query()); setErr(null); }
    catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (shopId: string, bestellmodus: string, sammelInterval: string | null): Promise<void> => {
    setErr(null); setMsg(null);
    try {
      await trpc.sammelbestellung.setShopMode.mutate({ shopId, bestellmodus: bestellmodus as "SOFORT", sammelInterval: (sammelInterval as "MONATLICH" | null) });
      setMsg("Gespeichert."); await load();
    } catch (e) { setErr(errMsg(e)); }
  };

  if (loading) return <Loader mt="md" />;
  return (
    <>
      <Text size="sm" c="dimmed" mt="md" mb="xs">Je Shop festlegen, ob Mitarbeiterbestellungen <b>sofort</b> als Einzelauftrag landen oder periodisch zu einer <b>Sammelbestellung</b> gebündelt werden. Beides läuft automatisch über die WooCommerce-Anbindung.</Text>
      {err && <Alert color="red" mb="xs">{err}</Alert>}
      {msg && <Alert color="green" mb="xs" withCloseButton onClose={() => setMsg(null)}>{msg}</Alert>}
      {shops.length === 0 ? <Text size="sm" c="dimmed">Keine Shops angebunden.</Text> : (
        <Table striped withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead><Table.Tr><Table.Th>Shop</Table.Th><Table.Th>Kunde</Table.Th><Table.Th>Modus</Table.Th><Table.Th>Intervall (bei Sammel)</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {shops.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>{s.name}</Table.Td>
                <Table.Td>{s.companyName}</Table.Td>
                <Table.Td>
                  <Select w={150} value={s.bestellmodus} data={[{ value: "SOFORT", label: "Sofort" }, { value: "SAMMEL", label: "Sammelbestellung" }]}
                    onChange={(v) => v && void save(s.id, v, v === "SAMMEL" ? (s.sammelInterval ?? "MONATLICH") : null)} />
                </Table.Td>
                <Table.Td>
                  <Select w={170} disabled={s.bestellmodus !== "SAMMEL"} placeholder="Intervall" value={s.sammelInterval} data={INTERVALS}
                    onChange={(v) => v && void save(s.id, "SAMMEL", v)} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}

export function SammelbestellungPage(): JSX.Element {
  return (
    <>
      <Title order={3}>Sammelbestellungen</Title>
      <Text size="sm" c="dimmed" mt={4}>Mitarbeiterbestellungen aus SAMMEL-Shops, periodisch gebündelt — Artikel und Veredelung über alle Bestellungen zusammengefasst (Kap. 18.2).</Text>
      <Tabs defaultValue="liste" mt="md" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="liste">Sammelbestellungen</Tabs.Tab>
          <Tabs.Tab value="shops">Shop-Modus</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="liste" pt="md"><Liste /></Tabs.Panel>
        <Tabs.Panel value="shops" pt="md"><ShopKonfig /></Tabs.Panel>
      </Tabs>
    </>
  );
}
