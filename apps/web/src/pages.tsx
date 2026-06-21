// Generische, datengetriebene Modul-Seiten für das "alles durchklickbar"-Gerüst.
// AutoTable rendert jede Liste robust (Cent→€, Datum, Status-Badge), sodass neue
// Bereiche mit wenig Code anbindbar sind. Interaktive Aktionen (Versand bestätigen,
// Mahnlauf, Reorder→Bestellungen) sind je Seite ergänzt.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Badge, Button, Group, Loader, Select, Table, Text, TextInput, Title } from "@mantine/core";
import { trpc } from "./trpc.js";
import { euro, numTd, statusMantineColor } from "./theme.js";

type Row = Record<string, unknown>;
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function fmtCell(key: string, v: unknown): ReactNode {
  if (v === null || v === undefined) return "—";
  if (/cents$/i.test(key) && typeof v === "number") return <span style={numTd}>{euro(v)}</span>;
  if (typeof v === "boolean") return v ? "ja" : "nein";
  if (/(status|kind|ampel|level)$/i.test(key) && typeof v === "string")
    return <Badge color={statusMantineColor[v] ?? "gray"} variant="light">{v}</Badge>;
  if (/(at|date|termin|am)$/i.test(key) && typeof v === "string" && !Number.isNaN(Date.parse(v)))
    return new Date(v).toLocaleDateString("de-DE");
  if (typeof v === "object") return <code style={{ fontSize: 11 }}>{JSON.stringify(v)}</code>;
  if (/cents$/i.test(key) && typeof v === "number") return euro(v);
  return String(v);
}

export function AutoTable({ rows, hide = [], action }: { rows: Row[]; hide?: string[]; action?: (r: Row) => ReactNode }): JSX.Element {
  if (!rows || rows.length === 0) return <Text c="dimmed" mt="sm">Keine Daten.</Text>;
  const cols = Object.keys(rows[0] as object).filter((k) => !hide.includes(k));
  return (
    <Table striped highlightOnHover withTableBorder mt="sm" verticalSpacing="xs" fz="sm">
      <Table.Thead>
        <Table.Tr>
          {cols.map((c) => <Table.Th key={c}>{c}</Table.Th>)}
          {action && <Table.Th />}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r, i) => (
          <Table.Tr key={i}>
            {cols.map((c) => <Table.Td key={c}>{fmtCell(c, r[c])}</Table.Td>)}
            {action && <Table.Td>{action(r)}</Table.Td>}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** Standard-Seitenrahmen: Titel, Hinweis, Aktualisieren, Lade-/Fehlerzustand. */
export function ListPage({
  title, hint, load, hide, action, toolbar,
}: {
  title: string; hint?: string; load: () => Promise<Row[]>; hide?: string[];
  action?: (r: Row, reload: () => Promise<void>) => ReactNode; toolbar?: (reload: () => Promise<void>) => ReactNode;
}): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await load()); } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }, [load]);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <>
      <Group justify="space-between" align="center">
        <Title order={3}>{title}</Title>
        <Group gap="xs">
          {toolbar?.(reload)}
          <Button variant="default" size="xs" onClick={() => void reload()}>Aktualisieren</Button>
        </Group>
      </Group>
      {hint && <Text size="sm" c="dimmed" mt={4}>{hint}</Text>}
      {error && <Alert color="red" mt="sm" title="Fehler">{error}</Alert>}
      {loading ? <Group mt="sm" gap="xs"><Loader size="sm" /><Text size="sm">lädt…</Text></Group>
        : <AutoTable rows={rows} action={action ? (r) => action(r, reload) : undefined} />}
    </>
  );
}

// ── Beschaffung ─────────────────────────────────────────────────────────────
export const SuppliersPage = (): JSX.Element => {
  const [sid, setSid] = useState("sup-fhb");
  const [applied, setApplied] = useState("sup-fhb");
  return (
    <>
      <Title order={3}>Lieferanten-Katalog</Title>
      <Text size="sm" c="dimmed" mt={4}>Katalogpositionen je Lieferant (EK nur ADMIN/BÜRO/BUCHHALTUNG, Kap. 12). Seed-IDs: sup-fhb, sup-stanley.</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Lieferanten-ID" value={sid} onChange={(e) => setSid(e.currentTarget.value)} />
        <Button size="sm" onClick={() => setApplied(sid)}>Anzeigen</Button>
      </Group>
      <ListPage key={applied} title={`Katalog · ${applied}`}
        load={() => trpc.suppliers.list.query({ supplierId: applied, limit: 100 }) as Promise<Row[]>} />
    </>
  );
};

export const IncomingInvoicesPage = (): JSX.Element => (
  <ListPage title="Eingangsrechnungen" hint="Erfasste Kreditorenrechnungen (3-Wege-Match, Kap. 9)."
    load={() => trpc.incomingInvoices.list.query({ limit: 100 }) as Promise<Row[]>} />
);

export const ReorderPage = (): JSX.Element => (
  <ListPage title="Nachbestellvorschläge (Reorder)" hint="Transferdruck-Mindestlager unterschritten → automatische Vorschläge (T-12)."
    load={() => trpc.reorder.proposals.query() as Promise<Row[]>}
    toolbar={(reload) => <CreatePOButton reload={reload} />} />
);

function CreatePOButton({ reload }: { reload: () => Promise<void> }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <Button size="xs" loading={busy} onClick={async () => {
        setBusy(true); setMsg(null);
        try { const r = await trpc.reorder.createPurchaseOrders.mutate(); setMsg(`erzeugt: ${JSON.stringify(r)}`); await reload(); }
        catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
      }}>Bestellungen erzeugen</Button>
      {msg && <Text size="xs" c="dimmed">{msg}</Text>}
    </>
  );
}

export const ProcurementPage = (): JSX.Element => {
  const [pid, setPid] = useState("PA-2026-0001");
  const [data, setData] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Title order={3}>Beschaffung — Produktionsstart-Status</Title>
      <Text size="sm" c="dimmed" mt={4}>Multi-Lieferant: Start erst, wenn alle Wareneingänge da sind (T-05).</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Produktions-ID" value={pid} onChange={(e) => setPid(e.currentTarget.value)} />
        <Button size="sm" onClick={async () => {
          setErr(null);
          try { setData(await trpc.procurement.productionStartStatus.query({ productionId: pid })); }
          catch (e) { setErr(errMsg(e)); }
        }}>Prüfen</Button>
      </Group>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      {data != null && <AutoTable rows={Array.isArray(data) ? (data as Row[]) : [data as Row]} />}
    </>
  );
};

// ── Logistik / Finanzen ─────────────────────────────────────────────────────
export const ShipmentsPage = (): JSX.Element => (
  <ListPage title="Versand" hint="Versandbereite Aufträge → als versendet bestätigen (DPD-Label/Tracking, T-06)."
    load={() => trpc.shipments.listShippable.query({ limit: 100 }) as Promise<Row[]>}
    action={(r, reload) => <ConfirmShipBtn orderId={String((r as Row).id ?? (r as Row).orderId ?? "")} reload={reload} />} />
);

function ConfirmShipBtn({ orderId, reload }: { orderId: string; reload: () => Promise<void> }): JSX.Element {
  const [busy, setBusy] = useState(false);
  return (
    <Button size="xs" variant="light" loading={busy} disabled={!orderId} onClick={async () => {
      setBusy(true);
      try {
        // Demo: Tracking-Nummer (DPD) automatisch vergeben, Pflichtfeld der API.
        await trpc.shipments.confirmShipped.mutate({ orderId, trackingNumber: `DPD-${Date.now().toString().slice(-9)}` });
        await reload();
      } finally { setBusy(false); }
    }}>Versendet</Button>
  );
}

export const DunningPage = (): JSX.Element => (
  <ListPage title="Mahnwesen" hint="Offene Posten / Mahnstufen (Gebühr + Historie, Kap. 9.5)."
    load={() => trpc.dunning.list.query({ limit: 100 }) as Promise<Row[]>}
    toolbar={(reload) => <RunDunningBtn reload={reload} />} />
);

function RunDunningBtn({ reload }: { reload: () => Promise<void> }): JSX.Element {
  const [busy, setBusy] = useState(false);
  return (
    <Button size="xs" loading={busy} onClick={async () => {
      setBusy(true);
      try { await trpc.dunning.run.mutate({ today: new Date().toISOString() }); await reload(); }
      finally { setBusy(false); }
    }}>Mahnlauf starten</Button>
  );
}

// ── Produktion / Auswertung ─────────────────────────────────────────────────
export const ProductionReportingPage = (): JSX.Element => {
  const [gran, setGran] = useState("MONTH");
  const [tab, setTab] = useState<"leadTime" | "defects" | "onTime">("leadTime");
  const [data, setData] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const run = useCallback(async () => {
    setErr(null);
    try {
      const q = { granularity: gran as "DAY" | "WEEK" | "MONTH" | "YEAR" };
      const d = tab === "leadTime" ? await trpc.productionReporting.leadTime.query(q)
        : tab === "defects" ? await trpc.productionReporting.defects.query(q)
        : await trpc.productionReporting.onTime.query(q);
      setData((Array.isArray(d) ? d : [d]) as Row[]);
    } catch (e) { setErr(errMsg(e)); }
  }, [gran, tab]);
  useEffect(() => { void run(); }, [run]);
  return (
    <>
      <Title order={3}>Produktions-Reporting</Title>
      <Text size="sm" c="dimmed" mt={4}>Durchlaufzeit, Fehlerquote, Termintreue (Kap. 29).</Text>
      <Group mt="sm" gap="xs">
        <Select size="xs" value={tab} onChange={(v) => v && setTab(v as typeof tab)} data={[
          { value: "leadTime", label: "Durchlaufzeit" }, { value: "defects", label: "Fehlerquote" }, { value: "onTime", label: "Termintreue" },
        ]} />
        <Select size="xs" value={gran} onChange={(v) => v && setGran(v)} data={["DAY", "WEEK", "MONTH", "YEAR"]} />
      </Group>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      <AutoTable rows={data} />
    </>
  );
};

export const ReklamationPage = (): JSX.Element => {
  const [orderId, setOrderId] = useState("");
  return (
    <>
      <Title order={3}>Reklamation</Title>
      <Text size="sm" c="dimmed" mt={4}>Reklamationen je Auftrag → Folgevorgang (Gutschrift/Nachproduktion, Kap. 20).</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Auftrags-ID" value={orderId} onChange={(e) => setOrderId(e.currentTarget.value)} placeholder="ord-1" />
      </Group>
      {orderId && <ListPage title={`Reklamationen zu ${orderId}`}
        load={() => trpc.reklamation.listByOrder.query({ orderId }) as Promise<Row[]>} />}
    </>
  );
};
