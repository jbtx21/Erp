// Generische, datengetriebene Modul-Seiten für das "alles durchklickbar"-Gerüst.
// AutoTable rendert jede Liste robust (Cent→€, Datum, Status-Badge), sodass neue
// Bereiche mit wenig Code anbindbar sind. Interaktive Aktionen (Versand bestätigen,
// Mahnlauf, Reorder→Bestellungen) sind je Seite ergänzt.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Badge, Button, Group, Loader, NumberInput, Select, Table, Text, TextInput, Title } from "@mantine/core";
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
export function SuppliersPage(): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [vatId, setVatId] = useState("");
  const [iban, setIban] = useState("");
  const [applied, setApplied] = useState("sup-fhb");
  const [sid, setSid] = useState("sup-fhb");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await trpc.suppliers.listAll.query()) as Row[]); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Title order={3}>Lieferanten</Title>
      <Text size="sm" c="dimmed" mt={4}>Stammsätze + Katalog je Lieferant (EK nur ADMIN/Büro/Buchhaltung, Kap. 12).</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Neuer Lieferant GmbH" />
        <TextInput label="USt-IdNr." value={vatId} onChange={(e) => setVatId(e.currentTarget.value)} w={150} />
        <TextInput label="IBAN" value={iban} onChange={(e) => setIban(e.currentTarget.value)} w={200} />
        <Button loading={busy} disabled={!name.trim()} onClick={async () => {
          setBusy(true); setErr(null);
          try { await trpc.suppliers.create.mutate({ name: name.trim(), vatId: vatId || undefined, iban: iban || undefined }); setName(""); setVatId(""); setIban(""); await load(); }
          catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
        }}>Lieferant anlegen</Button>
      </Group>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      <AutoTable rows={rows} action={(r) => (
        <Button size="compact-xs" variant="default" onClick={() => { setSid(String(r.id)); setApplied(String(r.id)); }}>Katalog</Button>
      )} />

      <Title order={4} mt="lg">Katalog</Title>
      <Group mt="xs" gap="xs" align="end">
        <TextInput label="Lieferanten-ID" value={sid} onChange={(e) => setSid(e.currentTarget.value)} w={200} />
        <Button size="sm" variant="default" onClick={() => setApplied(sid)}>Anzeigen</Button>
      </Group>
      <ListPage key={applied} title={`Katalog · ${applied}`}
        load={() => trpc.suppliers.list.query({ supplierId: applied, limit: 100 }) as Promise<Row[]>} />
    </>
  );
}

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

export function SampleLoansPage(): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [companyId, setCompanyId] = useState("co-muster");
  const [variantId, setVariantId] = useState("var-polo-navy-l");
  const [menge, setMenge] = useState(3);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await trpc.sampleLoans.list.query()) as Row[]); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); await load(); } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <>
      <Title order={3}>Muster-Leihgut</Title>
      <Text size="sm" c="dimmed" mt={4}>Ausgabe als Leihgut; Rückgabe unter 21 Tagen → keine Rechnung, sonst Musterrechnung zum Listenpreis (B5).</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Firmen-ID" value={companyId} onChange={(e) => setCompanyId(e.currentTarget.value)} w={130} />
        <TextInput label="Varianten-ID" value={variantId} onChange={(e) => setVariantId(e.currentTarget.value)} w={170} />
        <NumberInput label="Menge" value={menge} onChange={(v) => setMenge(Number(v) || 1)} min={1} w={90} />
        <Button loading={busy} onClick={async () => {
          setBusy(true); setErr(null);
          try { await trpc.sampleLoans.issue.mutate({ companyId, variantId, menge }); await load(); }
          catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
        }}>Muster ausgeben</Button>
        <Button variant="light" onClick={() => void act(async () => {
          const r = await trpc.sampleLoans.billOverdue.mutate();
          setStatus(`Berechnungslauf: ${r.billed.length} berechnet, ${r.failed.length} fehlgeschlagen.`);
        })}>Überfällige berechnen</Button>
      </Group>
      {status && <Text size="sm" mt="xs" c="dimmed">{status}</Text>}
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      <AutoTable rows={rows} action={(r) => (
        String(r.status) === "VERLIEHEN"
          ? <Button size="compact-xs" variant="default" onClick={() => void act(() => trpc.sampleLoans.returnSample.mutate({ loanId: String(r.id) }))}>Zurückgenommen</Button>
          : <Text size="xs" c="dimmed">—</Text>
      )} />
    </>
  );
}

export function CompaniesPage(): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [branche, setBranche] = useState("");
  const [kind, setKind] = useState("STANDARD");
  const [ziel, setZiel] = useState(14);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await trpc.companies.list.query()) as Row[]); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Title order={3}>Firmen / Kunden</Title>
      <Text size="sm" c="dimmed" mt={4}>Stammdaten (B3). Sperren/Anonymisieren erfolgt separat (DSGVO).</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Neue Firma GmbH" />
        <TextInput label="Branche" value={branche} onChange={(e) => setBranche(e.currentTarget.value)} w={140} />
        <Select label="Preisgruppe" value={kind} onChange={(v) => v && setKind(v)} w={170}
          data={["STANDARD", "TOP", "PREMIUM", "WIEDERVERKAEUFER", "AGENTUR"]} />
        <NumberInput label="Zahlungsziel (Tage)" value={ziel} onChange={(v) => setZiel(Number(v) || 0)} min={0} max={180} w={150} />
        <Button loading={busy} disabled={!name.trim()} onClick={async () => {
          setBusy(true); setErr(null);
          try { await trpc.companies.create.mutate({ name: name.trim(), branche: branche || undefined, priceGroupKind: kind as "STANDARD" | "TOP" | "PREMIUM" | "WIEDERVERKAEUFER" | "AGENTUR", zahlungszielTage: ziel }); setName(""); setBranche(""); await load(); }
          catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
        }}>Firma anlegen</Button>
      </Group>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      <AutoTable rows={rows} action={(r) => (
        <Button size="compact-xs" variant="light" color={r.mahnsperre ? "teal" : "orange"} onClick={async () => {
          try { await trpc.companies.update.mutate({ id: String(r.id), mahnsperre: !r.mahnsperre }); await load(); }
          catch (e) { setErr(errMsg(e)); }
        }}>{r.mahnsperre ? "Mahnsperre aufheben" : "Mahnsperre setzen"}</Button>
      )} />
    </>
  );
}

export function InquiriesPage(): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [text, setText] = useState("");
  const [quelle, setQuelle] = useState("WEB");
  const [companyId, setCompanyId] = useState("co-muster");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await trpc.inquiries.list.query()) as Row[]); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); await load(); } catch (e) { setErr(errMsg(e)); }
  };

  const actionsFor = (r: Row): ReactNode => {
    const id = String(r.id); const status = String(r.status);
    return (
      <Group gap={4} justify="flex-end" wrap="nowrap">
        {status === "NEU" && <Button size="compact-xs" variant="default" onClick={() => void act(() => trpc.inquiries.startProcessing.mutate({ id }))}>In Bearbeitung</Button>}
        {status === "IN_BEARBEITUNG" && <Button size="compact-xs" color="green" onClick={() => void act(() => trpc.inquiries.convertToQuote.mutate({ id }))}>→ Angebot</Button>}
        {status !== "ANGEBOT" && status !== "VERWORFEN" && (
          <Button size="compact-xs" color="red" variant="light" onClick={() => {
            const grund = typeof window !== "undefined" ? window.prompt("Verwerfen — Grund?") : null;
            if (grund) void act(() => trpc.inquiries.discard.mutate({ id, grund }));
          }}>Verwerfen</Button>
        )}
      </Group>
    );
  };

  return (
    <>
      <Title order={3}>Anfragen</Title>
      <Text size="sm" c="dimmed" mt={4}>Anfrage-Funnel NEU → In Bearbeitung → Angebot (B20, AF-Nummer aus F1).</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Anfragetext" value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder="200 Polos bestickt, Logo …" w={280} />
        <Select label="Quelle" value={quelle} onChange={(v) => v && setQuelle(v)} data={["WEB", "EMAIL", "SHOP", "TELEFON"]} w={110} />
        <TextInput label="Firmen-ID (optional)" value={companyId} onChange={(e) => setCompanyId(e.currentTarget.value)} w={150} />
        <Button loading={busy} disabled={!text.trim()} onClick={async () => {
          setBusy(true); setErr(null);
          try { await trpc.inquiries.create.mutate({ text: text.trim(), quelle: quelle as "WEB" | "EMAIL" | "SHOP" | "TELEFON", companyId: companyId || undefined }); setText(""); await load(); }
          catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
        }}>Anfrage anlegen</Button>
      </Group>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      <AutoTable rows={rows} hide={["verworfenGrund"]} action={actionsFor} />
    </>
  );
}

export function LeadsPage(): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [quelle, setQuelle] = useState("WEB");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await trpc.leads.list.query()) as Row[]); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); await load(); } catch (e) { setErr(errMsg(e)); }
  };

  const actionsFor = (r: Row): ReactNode => {
    const id = String(r.id); const status = String(r.status);
    return (
      <Group gap={4} justify="flex-end" wrap="nowrap">
        {status === "NEU" && <Button size="compact-xs" variant="default" onClick={() => void act(() => trpc.leads.transition.mutate({ id, to: "KONTAKTIERT" }))}>→ Kontaktiert</Button>}
        {status === "KONTAKTIERT" && <Button size="compact-xs" variant="default" onClick={() => void act(() => trpc.leads.transition.mutate({ id, to: "QUALIFIZIERT" }))}>→ Qualifiziert</Button>}
        {status === "QUALIFIZIERT" && <Button size="compact-xs" color="green" onClick={() => void act(() => trpc.leads.convert.mutate({ id }))}>Konvertieren</Button>}
        {status !== "KONVERTIERT" && status !== "VERWORFEN" && (
          <Button size="compact-xs" color="red" variant="light" onClick={() => {
            const grund = typeof window !== "undefined" ? window.prompt("Verwerfen — Grund?") : null;
            if (grund) void act(() => trpc.leads.discard.mutate({ id, grund }));
          }}>Verwerfen</Button>
        )}
      </Group>
    );
  };

  return (
    <>
      <Title order={3}>Leads / Interessenten</Title>
      <Text size="sm" c="dimmed" mt={4}>Funnel NEU → Kontaktiert → Qualifiziert → konvertiert zu Firma (B15, Kap. 18.1).</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Interessent GmbH" />
        <Select label="Quelle" value={quelle} onChange={(v) => v && setQuelle(v)} data={["WEB", "EMAIL", "SHOP", "TELEFON"]} w={120} />
        <TextInput label="E-Mail (optional)" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
        <Button loading={busy} disabled={!name.trim()} onClick={async () => {
          setBusy(true); setErr(null);
          try { await trpc.leads.create.mutate({ name: name.trim(), quelle: quelle as "WEB" | "EMAIL" | "SHOP" | "TELEFON", email: email || undefined }); setName(""); setEmail(""); await load(); }
          catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
        }}>Lead anlegen</Button>
      </Group>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      <AutoTable rows={rows} hide={["note", "convertedCompanyId"]} action={actionsFor} />
    </>
  );
}

export function CostCentersPage(): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [nummer, setNummer] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await trpc.costCenters.list.query()) as Row[]); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Title order={3}>Kostenstellen</Title>
      <Text size="sm" c="dimmed" mt={4}>Stammdaten je Kostenstelle (B7) — Auswertung, keine Buchung (G1).</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Nummer" value={nummer} onChange={(e) => setNummer(e.currentTarget.value)} w={120} placeholder="1000" />
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Veredelung" />
        <Button loading={busy} disabled={!nummer.trim() || !name.trim()} onClick={async () => {
          setBusy(true); setErr(null);
          try { await trpc.costCenters.create.mutate({ nummer: nummer.trim(), name: name.trim() }); setNummer(""); setName(""); await load(); }
          catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
        }}>Anlegen</Button>
      </Group>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      <AutoTable rows={rows} action={(r) => (
        <Button size="compact-xs" color="red" variant="light" onClick={async () => {
          if (typeof window !== "undefined" && !window.confirm(`Kostenstelle „${String(r.nummer)}" löschen?`)) return;
          try { await trpc.costCenters.delete.mutate({ id: String(r.id) }); await load(); }
          catch (e) { setErr(errMsg(e)); }
        }}>Löschen</Button>
      )} />
    </>
  );
}

export const ReklamationPage = (): JSX.Element => {
  const [orderId, setOrderId] = useState("ord-1");
  const [lines, setLines] = useState<Row[]>([]);
  const [lineId, setLineId] = useState("");
  const [cause, setCause] = useState("INTERN");
  const [followUp, setFollowUp] = useState("GUTSCHRIFT");
  const [costEuro, setCostEuro] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const loadLines = useCallback(async () => {
    setErr(null); setLineId("");
    try {
      const ls = (await trpc.shopOrders.lines.query({ orderId })) as Row[];
      setLines(ls);
      if (ls[0]) setLineId(String(ls[0].id));
    } catch (e) { setErr(errMsg(e)); }
  }, [orderId]);

  return (
    <>
      <Title order={3}>Reklamation</Title>
      <Text size="sm" c="dimmed" mt={4}>Reklamation je Auftragsposition → Folgevorgang (Gutschrift/Nachproduktion, Kap. 20).</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Auftrags-ID" value={orderId} onChange={(e) => setOrderId(e.currentTarget.value)} placeholder="ord-1" />
        <Button variant="default" onClick={() => void loadLines()}>Positionen laden</Button>
      </Group>

      {lines.length > 0 && (
        <Group mt="sm" gap="xs" align="end">
          <Select label="Position" value={lineId} onChange={(v) => v && setLineId(v)} w={260}
            data={lines.map((l) => ({ value: String(l.id), label: `#${String(l.position)} ${String(l.description)} (${String(l.qty)}×)` }))} />
          <Select label="Ursache" value={cause} onChange={(v) => v && setCause(v)} w={150}
            data={[{ value: "LIEFERANT", label: "Lieferant" }, { value: "INTERN", label: "Intern" }, { value: "EXTERN_VEREDLER", label: "Externer Veredler" }]} />
          <Select label="Folgevorgang" value={followUp} onChange={(v) => v && setFollowUp(v)} w={190}
            data={[{ value: "NACHPRODUKTION", label: "Nachproduktion" }, { value: "EXPRESS_NACHPRODUKTION", label: "Express-Nachproduktion" }, { value: "GUTSCHRIFT", label: "Gutschrift" }, { value: "KEINE", label: "Keine" }]} />
          <NumberInput label="Kosten (€)" value={costEuro} onChange={(v) => setCostEuro(Number(v) || 0)} min={0} w={110} />
          <Button disabled={!lineId} onClick={async () => {
            setErr(null); setStatus(null);
            try {
              const r = await trpc.reklamation.create.mutate({
                orderId, orderLineId: lineId,
                cause: cause as "LIEFERANT" | "INTERN" | "EXTERN_VEREDLER",
                followUp: followUp as "NACHPRODUKTION" | "EXPRESS_NACHPRODUKTION" | "GUTSCHRIFT" | "KEINE",
                costCents: Math.round(costEuro * 100),
              });
              setStatus(`Reklamation angelegt — Folgevorgang: ${JSON.stringify(r)}`);
              setReload((n) => n + 1);
            } catch (e) { setErr(errMsg(e)); }
          }}>Reklamation anlegen</Button>
        </Group>
      )}
      {status && <Text size="sm" mt="xs" c="dimmed">{status}</Text>}
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      {orderId && <ListPage key={`${orderId}-${reload}`} title={`Reklamationen zu ${orderId}`}
        load={() => trpc.reklamation.listByOrder.query({ orderId }) as Promise<Row[]>} />}
    </>
  );
};
