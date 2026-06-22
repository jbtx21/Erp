// Generische, datengetriebene Modul-Seiten für das "alles durchklickbar"-Gerüst.
// AutoTable rendert jede Liste robust (Cent→€, Datum, Status-Badge), sodass neue
// Bereiche mit wenig Code anbindbar sind. Interaktive Aktionen (Versand bestätigen,
// Mahnlauf, Reorder→Bestellungen) sind je Seite ergänzt.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Badge, Button, Checkbox, Group, Loader, NumberInput, Select, Table, Text, TextInput, Title } from "@mantine/core";
import { orderStatusMachine, type OrderStatus } from "@texma/shared/order";
import { trpc } from "./trpc.js";
import { euro, numTd, statusMantineColor } from "./theme.js";

type Row = Record<string, unknown>;
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// Deutsche Spaltenbezeichnungen statt roher Feldnamen ("Don't ship the schema").
const COL_LABELS: Record<string, string> = {
  id: "ID", number: "Nr.", name: "Name", status: "Status", kind: "Art", quelle: "Quelle",
  companyId: "Firma", supplierId: "Lieferant", variantId: "Variante", articleId: "Artikel",
  email: "E-Mail", phone: "Telefon", branche: "Branche", vatId: "USt-IdNr.", iban: "IBAN", bic: "BIC",
  active: "Aktiv", mahnsperre: "Mahnsperre", gesperrt: "Gesperrt", priceGroupKind: "Preisgruppe",
  zahlungszielTage: "Zahlungsziel (T)", netCents: "Netto", taxCents: "MwSt.", grossCents: "Brutto",
  openCents: "Offen", ekCents: "EK", unitNetCents: "Einzel netto", totalNetCents: "Summe",
  qty: "Menge", menge: "Menge", position: "Pos.", description: "Beschreibung", sku: "SKU",
  supplierSku: "Lief.-SKU", availableQty: "Verfügbar", variantCount: "Varianten",
  createdAt: "Erstellt", updatedAt: "Geändert", ausgegebenAm: "Ausgegeben", dueDate: "Fällig",
  gueltigBisAm: "Gültig bis", zugesagterLiefertermin: "Liefertermin", externalNumber: "Shop-Nr.", employeeNote: "Vermerk",
  trackingNumber: "Tracking", invoiceId: "Rechnung", kontaktName: "Kontakt", note: "Notiz",
  verworfenGrund: "Grund", finalized: "Final", lastSyncAt: "Letzter Sync", dunningLevel: "Mahnstufe",
};
const colLabel = (key: string): string =>
  COL_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

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
          {cols.map((c) => <Table.Th key={c}>{colLabel(c)}</Table.Th>)}
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

export function ProductsPage(): JSX.Element {
  const [articles, setArticles] = useState<Row[]>([]);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [variants, setVariants] = useState<Row[]>([]);
  const [vsku, setVsku] = useState("");
  const [farbe, setFarbe] = useState("");
  const [groesse, setGroesse] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const loadArticles = useCallback(async () => {
    try { setArticles((await trpc.products.listArticles.query()) as Row[]); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void loadArticles(); }, [loadArticles]);

  const loadVariants = useCallback(async (articleId: string) => {
    setSel(articleId);
    try { setVariants((await trpc.products.listVariants.query({ articleId })) as Row[]); }
    catch (e) { setErr(errMsg(e)); }
  }, []);

  return (
    <>
      <Title order={3}>Artikel &amp; Varianten</Title>
      <Text size="sm" c="dimmed" mt={4}>Stammdaten (B16): Artikel + Farbe×Größe-Varianten.</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Artikel-SKU" value={sku} onChange={(e) => setSku(e.currentTarget.value)} placeholder="POLO-PREMIUM" w={160} />
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="Premium-Poloshirt" />
        <Button disabled={!sku.trim() || !name.trim()} onClick={async () => {
          setErr(null);
          try { await trpc.products.createArticle.mutate({ sku: sku.trim(), name: name.trim() }); setSku(""); setName(""); await loadArticles(); }
          catch (e) { setErr(errMsg(e)); }
        }}>Artikel anlegen</Button>
      </Group>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      <AutoTable rows={articles} action={(r) => (
        <Button size="compact-xs" variant="default" onClick={() => void loadVariants(String(r.id))}>Varianten</Button>
      )} />

      {sel && (
        <>
          <Title order={4} mt="lg">Varianten · {sel}</Title>
          <Group mt="xs" gap="xs" align="end">
            <TextInput label="Varianten-SKU" value={vsku} onChange={(e) => setVsku(e.currentTarget.value)} placeholder="POLO-PREM-NAVY-L" w={180} />
            <TextInput label="Farbe" value={farbe} onChange={(e) => setFarbe(e.currentTarget.value)} w={110} />
            <TextInput label="Größe" value={groesse} onChange={(e) => setGroesse(e.currentTarget.value)} w={90} />
            <Button disabled={!vsku.trim()} onClick={async () => {
              setErr(null);
              const attributes = [
                ...(farbe ? [{ name: "Farbe", value: farbe }] : []),
                ...(groesse ? [{ name: "Größe", value: groesse }] : []),
              ];
              try { await trpc.products.createVariant.mutate({ articleId: sel, sku: vsku.trim(), attributes }); setVsku(""); setFarbe(""); setGroesse(""); await loadVariants(sel); await loadArticles(); }
              catch (e) { setErr(errMsg(e)); }
            }}>Variante anlegen</Button>
          </Group>
          <AutoTable rows={variants} />
        </>
      )}
    </>
  );
}

export function QuotesPage(): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [companyId, setCompanyId] = useState("co-muster");
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState(10);
  const [euroPrice, setEuroPrice] = useState(12.9);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await trpc.quotes.list.query()) as Row[]); setErr(null); }
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
        {status === "ENTWURF" && <Button size="compact-xs" variant="default" onClick={() => void act(() => trpc.quotes.transition.mutate({ id, to: "VERSENDET" }))}>→ Versendet</Button>}
        {(status === "VERSENDET" || status === "NACHFASSEN") && <Button size="compact-xs" color="green" onClick={() => void act(() => trpc.quotes.transition.mutate({ id, to: "ANGENOMMEN" }))}>Angenommen</Button>}
        {status !== "ANGENOMMEN" && status !== "ABGELEHNT" && (
          <Button size="compact-xs" color="red" variant="light" onClick={() => {
            const grund = typeof window !== "undefined" ? window.prompt("Ablehnen — Verlustgrund?") : null;
            if (grund) void act(() => trpc.quotes.reject.mutate({ id, verlustgrund: grund }));
          }}>Ablehnen</Button>
        )}
      </Group>
    );
  };

  return (
    <>
      <Title order={3}>Angebote</Title>
      <Text size="sm" c="dimmed" mt={4}>Entwurf anlegen → Versendet → Angenommen/Abgelehnt (B8, AN-Nummer aus F1).</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Firmen-ID" value={companyId} onChange={(e) => setCompanyId(e.currentTarget.value)} w={130} />
        <TextInput label="Position" value={desc} onChange={(e) => setDesc(e.currentTarget.value)} placeholder="200 Polos bestickt" w={220} />
        <NumberInput label="Menge" value={qty} onChange={(v) => setQty(Number(v) || 1)} min={1} w={90} />
        <NumberInput label="Einzel (€)" value={euroPrice} onChange={(v) => setEuroPrice(Number(v) || 0)} min={0} decimalScale={2} w={110} />
        <Button loading={busy} disabled={!companyId.trim() || !desc.trim()} onClick={async () => {
          setBusy(true); setErr(null);
          try {
            await trpc.quotes.create.mutate({ companyId, lines: [{ description: desc.trim(), qty, unitNetCents: Math.round(euroPrice * 100) }] });
            setDesc(""); await load();
          } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
        }}>Angebot anlegen</Button>
      </Group>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      <AutoTable rows={rows} action={actionsFor} />
    </>
  );
}

// Standard-Veredelungskette mit Platzhalter-Durchlaufzeiten (Kalendertage) für die
// Rückwärtsterminierung-Vorschau (B9). Die echten Stufendauern sind ein K-Punkt
// (FinishingTargetTime ist Bearbeitungs-Minuten, nicht Kalendertage) → von TEXMA zu bestätigen.
const DEFAULT_LEAD_STAGES: ReadonlyArray<{ label: string; durationDays: number }> = [
  { label: "Beschaffung Textil", durationDays: 5 },
  { label: "Fremdvergabe Siebdruck", durationDays: 4 },
  { label: "Stickerei", durationDays: 4 },
  { label: "Endkontrolle / Versandvorbereitung", durationDays: 1 },
];

interface SchedulePlan {
  start: string;
  deliveryDate: string;
  stages: { label: string; durationDays: number; start: string; end: string }[];
}
const deDate = (iso: string): string => new Date(iso).toLocaleDateString("de-DE");

export function OrdersPage({ role }: { role: string }): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // Terminierungs-Panel (B9): Auftrag + zugesagter Liefertermin + Rückwärts-Vorschau.
  const [termOrder, setTermOrder] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState<string>("");
  const [plan, setPlan] = useState<SchedulePlan | null>(null);

  const load = useCallback(async () => {
    try { setRows((await trpc.shopOrders.list.query({ limit: 100 })) as Row[]); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const canAct = role === "ADMIN" || role === "BUERO";

  return (
    <>
      <Title order={3}>Aufträge</Title>
      <Text size="sm" c="dimmed" mt={4}>
        {role === "PRODUKTION" ? "Rolle PRODUKTION: Preise/Kundendaten ausgeblendet (Kap. 12)." : "Status weiterschalten — illegale Übergänge blockiert (F2, Kap. 35.2)."}
      </Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      <AutoTable rows={rows} hide={["rawPayload"]} action={!canAct ? undefined : (r) => {
        const next = orderStatusMachine.next(String(r.status) as OrderStatus);
        if (next.length === 0) return <Text size="xs" c="dimmed">—</Text>;
        return (
          <Group gap={4} justify="flex-end" wrap="nowrap">
            {next.map((to) => (
              <Button key={to} size="compact-xs" variant={to === "STORNIERT" ? "light" : "default"} color={to === "STORNIERT" ? "red" : undefined}
                onClick={async () => {
                  setErr(null);
                  try { await trpc.shopOrders.transition.mutate({ orderId: String(r.id), to: to as Exclude<OrderStatus, "ANGELEGT"> }); await load(); }
                  catch (e) { setErr(errMsg(e)); }
                }}>→ {to}</Button>
            ))}
          </Group>
        );
      }} />

      {canAct && (
        <>
          <Title order={4} mt="xl">Liefertermin &amp; Rückwärtsterminierung (Kap. 35.2)</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Zugesagten Liefertermin setzen; die Vorschau rechnet den spätesten Starttermin je Stufe zurück.
          </Text>
          <Group align="flex-end" gap="sm" mt="sm" wrap="wrap">
            <Select label="Auftrag" placeholder="wählen" w={220} searchable
              data={rows.map((r) => ({ value: String(r.id), label: String(r.number ?? r.id) }))}
              value={termOrder} onChange={setTermOrder} />
            <TextInput type="date" label="Zugesagter Liefertermin" value={dateStr}
              onChange={(e) => setDateStr(e.currentTarget.value)} />
            <Button disabled={!termOrder || !dateStr}
              onClick={async () => {
                setErr(null);
                try {
                  await trpc.shopOrders.setLiefertermin.mutate({ orderId: termOrder!, deliveryDate: new Date(dateStr).toISOString() });
                  await load();
                } catch (e) { setErr(errMsg(e)); }
              }}>Termin setzen</Button>
            <Button variant="light" disabled={!dateStr}
              onClick={async () => {
                setErr(null); setPlan(null);
                try {
                  const p = await trpc.scheduling.preview.query({ deliveryDate: new Date(dateStr).toISOString(), stages: [...DEFAULT_LEAD_STAGES] });
                  setPlan(p as SchedulePlan);
                } catch (e) { setErr(errMsg(e)); }
              }}>Terminierung anzeigen</Button>
          </Group>

          {plan && (
            <>
              <Text size="sm" mt="md">
                Spätester <b>Produktionsstart: {deDate(plan.start)}</b> — Liefertermin {deDate(plan.deliveryDate)}.
              </Text>
              <Table mt="xs" withTableBorder withColumnBorders striped>
                <Table.Thead><Table.Tr>
                  <Table.Th>Stufe</Table.Th><Table.Th ta="right">Dauer (T)</Table.Th>
                  <Table.Th>Start</Table.Th><Table.Th>Ende</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {plan.stages.map((s, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>{s.label}</Table.Td>
                      <Table.Td ta="right">{s.durationDays}</Table.Td>
                      <Table.Td>{deDate(s.start)}</Table.Td>
                      <Table.Td>{deDate(s.end)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Text size="xs" c="dimmed" mt={4}>
                Stufendauern sind Standardwerte (Platzhalter, K-Punkt) — auftragsspezifische Durchlaufzeiten folgen.
              </Text>
            </>
          )}
          {termOrder && <RecordPanel entity="Order" entityId={termOrder} />}
        </>
      )}
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

// Generischer Datensatz-Querschnitt (ERP-Grundfunktion): Kommentare, Aktivitäten
// ("was ist als Nächstes") und Anhänge — auf JEDEN Beleg/Stammsatz einsetzbar.
const fmtDate = (v: unknown): string => (v ? new Date(v as string).toLocaleDateString("de-DE") : "—");

export function RecordPanel({ entity, entityId }: { entity: string; entityId: string }): JSX.Element {
  const [data, setData] = useState<Awaited<ReturnType<typeof trpc.collab.list.query>> | null>(null);
  const [comment, setComment] = useState("");
  const [actTitle, setActTitle] = useState("");
  const [attName, setAttName] = useState("");
  const [attUrl, setAttUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await trpc.collab.list.query({ entity, entityId })); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, [entity, entityId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Title order={4} mt="xl">Notizen, Aktivitäten &amp; Anhänge</Title>
      <Text size="sm" c="dimmed" mt={2}>Generischer Datensatz-Querschnitt — „was ist als Nächstes" zu {entity} {entityId}.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      {/* Aktivitäten */}
      <Text fw={600} size="sm" mt="md">Aktivitäten</Text>
      {(data?.activities ?? []).map((a) => (
        <Group key={a.id} gap="xs" mt={4}>
          <Checkbox checked={a.done} label={`${a.title}${a.dueDate ? ` (fällig ${fmtDate(a.dueDate)})` : ""}`}
            onChange={async (e) => { setErr(null); try { await trpc.collab.setActivityDone.mutate({ id: a.id, done: e.currentTarget.checked }); await load(); } catch (x) { setErr(errMsg(x)); } }} />
          <Badge size="xs" variant="light">{a.kind}</Badge>
        </Group>
      ))}
      <Group gap="xs" mt={6}>
        <TextInput placeholder="Neue Aufgabe…" value={actTitle} onChange={(e) => setActTitle(e.currentTarget.value)} w={260} />
        <Button size="compact-sm" variant="light" disabled={!actTitle.trim()}
          onClick={async () => { setErr(null); try { await trpc.collab.addActivity.mutate({ entity, entityId, kind: "TASK", title: actTitle, dueDate: null }); setActTitle(""); await load(); } catch (x) { setErr(errMsg(x)); } }}>+ Aufgabe</Button>
      </Group>

      {/* Kommentare */}
      <Text fw={600} size="sm" mt="md">Kommentare</Text>
      {(data?.comments ?? []).map((c) => (
        <Text key={c.id} size="sm" mt={2}><b>{c.author}</b> ({fmtDate(c.createdAt)}): {c.text}</Text>
      ))}
      <Group gap="xs" mt={6}>
        <TextInput placeholder="Kommentar…" value={comment} onChange={(e) => setComment(e.currentTarget.value)} w={320} />
        <Button size="compact-sm" variant="light" disabled={!comment.trim()}
          onClick={async () => { setErr(null); try { await trpc.collab.addComment.mutate({ entity, entityId, text: comment }); setComment(""); await load(); } catch (x) { setErr(errMsg(x)); } }}>+ Kommentar</Button>
      </Group>

      {/* Anhänge */}
      <Text fw={600} size="sm" mt="md">Anhänge</Text>
      {(data?.attachments ?? []).map((f) => (
        <Text key={f.id} size="sm" mt={2}>📎 <a href={f.url} target="_blank" rel="noreferrer">{f.fileName}</a> — {f.uploadedBy} ({fmtDate(f.createdAt)})</Text>
      ))}
      <Group gap="xs" mt={6}>
        <TextInput placeholder="Dateiname" value={attName} onChange={(e) => setAttName(e.currentTarget.value)} w={180} />
        <TextInput placeholder="URL/Verweis" value={attUrl} onChange={(e) => setAttUrl(e.currentTarget.value)} w={240} />
        <Button size="compact-sm" variant="light" disabled={!attName.trim() || !attUrl.trim()}
          onClick={async () => { setErr(null); try { await trpc.collab.addAttachment.mutate({ entity, entityId, fileName: attName, mimeType: null, url: attUrl }); setAttName(""); setAttUrl(""); await load(); } catch (x) { setErr(errMsg(x)); } }}>+ Anhang</Button>
      </Group>
      <Text size="xs" c="dimmed" mt={4}>Datei-Upload selbst ist ein Integrationspunkt (Objektspeicher); hier wird der Verweis erfasst.</Text>
    </>
  );
}

// Preise & Mengenstaffel (B4, Kap. 4.4 / T-15): Preis berechnen (mit Herkunft) +
// Gruppen-Staffel pflegen. Präzedenz Kunde → Gruppen-Staffel → Einzelpreis.
export function PricingPage(): JSX.Element {
  const [companies, setCompanies] = useState<Row[]>([]);
  const [articles, setArticles] = useState<Row[]>([]);
  const [variants, setVariants] = useState<Row[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [articleId, setArticleId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [menge, setMenge] = useState<number>(1);
  const [price, setPrice] = useState<{ netCents: number; source: string; minMenge: number | null } | null>(null);
  const [tiers, setTiers] = useState<{ customerTiers: { minMenge: number; netCents: number }[]; groupTiers: { minMenge: number; netCents: number }[] } | null>(null);
  const [newMin, setNewMin] = useState<number>(1);
  const [newNet, setNewNet] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setCompanies((await trpc.companies.list.query()) as Row[]);
        setArticles((await trpc.products.listArticles.query()) as Row[]);
      } catch (e) { setErr(errMsg(e)); }
    })();
  }, []);

  useEffect(() => {
    if (!articleId) { setVariants([]); return; }
    void (async () => {
      try { setVariants((await trpc.products.listVariants.query({ articleId })) as Row[]); }
      catch (e) { setErr(errMsg(e)); }
    })();
  }, [articleId]);

  const loadTiers = useCallback(async () => {
    if (!companyId || !variantId) { setTiers(null); return; }
    try { setTiers(await trpc.pricing.tiers.query({ companyId, variantId })); }
    catch (e) { setErr(errMsg(e)); }
  }, [companyId, variantId]);
  useEffect(() => { void loadTiers(); }, [loadTiers]);

  const compute = async (): Promise<void> => {
    setErr(null); setPrice(null);
    if (!companyId || !variantId) return;
    try { setPrice(await trpc.pricing.resolve.query({ companyId, variantId, menge })); }
    catch (e) { setErr(errMsg(e)); }
  };

  return (
    <>
      <Title order={3}>Preise &amp; Mengenstaffel (T-15)</Title>
      <Text size="sm" c="dimmed" mt={4}>
        Basispreis-Staffel je Preisgruppe + kundenindividuell. Präzedenz: Kunde → Gruppen-Staffel → Einzelpreis (Kap. 4.4).
      </Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      <Group align="flex-end" gap="sm" mt="sm" wrap="wrap">
        <Select label="Firma" w={200} searchable value={companyId} onChange={setCompanyId}
          data={companies.map((c) => ({ value: String(c.id), label: String(c.name ?? c.id) }))} />
        <Select label="Artikel" w={200} searchable value={articleId} onChange={(v) => { setArticleId(v); setVariantId(null); }}
          data={articles.map((a) => ({ value: String(a.id), label: String(a.name ?? a.sku ?? a.id) }))} />
        <Select label="Variante" w={200} searchable disabled={!articleId} value={variantId} onChange={setVariantId}
          data={variants.map((v) => ({ value: String(v.id), label: String(v.sku ?? v.id) }))} />
        <NumberInput label="Menge" w={110} min={1} value={menge} onChange={(v) => setMenge(typeof v === "number" ? v : 1)} />
        <Button disabled={!companyId || !variantId} onClick={() => void compute()}>Preis berechnen</Button>
      </Group>

      {price && (
        <Alert color="navy" variant="light" mt="md">
          <b>{euro(price.netCents)}</b> netto/Stück bei {menge} Stück — Herkunft{" "}
          <Badge variant="light">{price.source}</Badge>{price.minMenge !== null ? ` (ab ${String(price.minMenge)} Stück)` : ""}
        </Alert>
      )}

      {companyId && variantId && (
        <>
          <Title order={4} mt="xl">Hinterlegte Staffel</Title>
          <Table mt="xs" withTableBorder withColumnBorders striped>
            <Table.Thead><Table.Tr>
              <Table.Th>Ebene</Table.Th><Table.Th ta="right">ab Menge</Table.Th><Table.Th ta="right">Netto/Stück</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {(tiers?.customerTiers ?? []).map((t, i) => (
                <Table.Tr key={`c${String(i)}`}><Table.Td><Badge color="grape" variant="light">Kunde</Badge></Table.Td>
                  <Table.Td ta="right">{t.minMenge}</Table.Td><Table.Td ta="right">{euro(t.netCents)}</Table.Td></Table.Tr>
              ))}
              {(tiers?.groupTiers ?? []).map((t, i) => (
                <Table.Tr key={`g${String(i)}`}><Table.Td><Badge variant="light">Gruppe</Badge></Table.Td>
                  <Table.Td ta="right">{t.minMenge}</Table.Td><Table.Td ta="right">{euro(t.netCents)}</Table.Td></Table.Tr>
              ))}
              {(!tiers || (tiers.customerTiers.length === 0 && tiers.groupTiers.length === 0)) && (
                <Table.Tr><Table.Td colSpan={3}><Text size="sm" c="dimmed">Keine Staffel hinterlegt.</Text></Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
          <Group align="flex-end" gap="sm" mt="sm">
            <NumberInput label="ab Menge" w={110} min={1} value={newMin} onChange={(v) => setNewMin(typeof v === "number" ? v : 1)} />
            <NumberInput label="Netto/Stück (Cent)" w={160} min={0} value={newNet} onChange={(v) => setNewNet(typeof v === "number" ? v : 0)} />
            <Button variant="light" onClick={async () => {
              setErr(null);
              try { await trpc.pricing.addGroupTier.mutate({ companyId, variantId, minMenge: newMin, netCents: newNet }); await loadTiers(); }
              catch (e) { setErr(errMsg(e)); }
            }}>Gruppen-Stufe hinzufügen</Button>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>Gruppen-Stufe gilt für alle Kunden der Preisgruppe dieser Firma (auditiert).</Text>
        </>
      )}
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

// ── Fertigung: mehrstufige Fremdvergabe / Lohnveredelung (T-04, Kap. 5.3) ─────
type SubStatus = "OFFEN" | "BEISTELLUNG_VERSANDT" | "RUECKLAUF_ERHALTEN" | "ABGESCHLOSSEN";
interface SubStage { id: string; sequence: number; supplierId: string; status: SubStatus; beistellMenge: number | null; ruecklaufMenge: number | null; dueDate: string | null; lohnCents: number | null; }
interface SubPlan {
  nextActionable: SubStage | null; blocked: SubStage[]; overdue: SubStage[];
  totalScrap: number; totalLohnCents: number; progressPercent: number; yieldPercent: number | null; allReturned: boolean;
}

export function SubproductionPage(): JSX.Element {
  const [productionId, setProductionId] = useState("pa-1");
  const [applied, setApplied] = useState("pa-1");
  const [stages, setStages] = useState<SubStage[]>([]);
  const [plan, setPlan] = useState<SubPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (pid: string) => {
    setLoading(true); setErr(null);
    try {
      const [st, pl] = await Promise.all([
        trpc.subproduction.list.query({ productionId: pid }) as Promise<{ stages: SubStage[] }>,
        trpc.subproduction.plan.query({ productionId: pid }) as Promise<SubPlan>,
      ]);
      setStages(st.stages); setPlan(pl);
    } catch (e) { setErr(errMsg(e)); setStages([]); setPlan(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(applied); }, [load, applied]);

  // Mengenfluss: beim Versand Beistellmenge, beim Rücklauf Rücklaufmenge abfragen (T-04).
  const advance = async (sub: SubStage, to: "BEISTELLUNG_VERSANDT" | "RUECKLAUF_ERHALTEN" | "ABGESCHLOSSEN") => {
    setErr(null);
    let menge: number | undefined;
    if (to === "BEISTELLUNG_VERSANDT" || to === "RUECKLAUF_ERHALTEN") {
      const def = to === "RUECKLAUF_ERHALTEN" ? sub.beistellMenge ?? 0 : 0;
      const ans = typeof window !== "undefined" ? window.prompt(`${to === "RUECKLAUF_ERHALTEN" ? "Rücklauf" : "Beistell"}menge?`, String(def)) : null;
      if (ans === null) return;
      menge = Number(ans) || 0;
    }
    try { await trpc.subproduction.advance.mutate({ subProductionId: sub.id, to, menge }); await load(applied); }
    catch (e) { setErr(errMsg(e)); }
  };

  const actionsFor = (s: SubStage): ReactNode => {
    const blocked = plan?.blocked.some((b) => b.sequence === s.sequence) ?? false;
    if (s.status === "OFFEN") return blocked
      ? <Text size="xs" c="dimmed">wartet auf Vorstufe</Text>
      : <Button size="compact-xs" variant="default" onClick={() => void advance(s, "BEISTELLUNG_VERSANDT")}>Beistellung versenden</Button>;
    if (s.status === "BEISTELLUNG_VERSANDT") return <Button size="compact-xs" color="green" onClick={() => void advance(s, "RUECKLAUF_ERHALTEN")}>Rücklauf buchen</Button>;
    if (s.status === "RUECKLAUF_ERHALTEN") return <Button size="compact-xs" variant="light" onClick={() => void advance(s, "ABGESCHLOSSEN")}>Abschließen</Button>;
    return <Text size="xs" c="dimmed">—</Text>;
  };

  return (
    <>
      <Title order={3}>Fremdvergabe (Lohnveredelung)</Title>
      <Text size="sm" c="dimmed" mt={4}>Mehrstufig &amp; sequenziell: Stufe n+1 startet erst, wenn der Rücklauf von Stufe n da ist (T-04, Kap. 5.3).</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Produktions-ID" value={productionId} onChange={(e) => setProductionId(e.currentTarget.value)} w={160} />
        <Button variant="default" onClick={() => setApplied(productionId)}>Anzeigen</Button>
      </Group>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      {plan && (
        <Group mt="md" gap="lg" wrap="wrap">
          <PlanStat label="Fortschritt" value={`${plan.progressPercent} %`} />
          <PlanStat label="Ausbeute" value={plan.yieldPercent == null ? "—" : `${plan.yieldPercent} %`} color={plan.yieldPercent != null && plan.yieldPercent < 100 ? "amber.7" : undefined} />
          <PlanStat label="Schwund" value={`${plan.totalScrap} Stk`} color={plan.totalScrap > 0 ? "amber.7" : undefined} />
          <PlanStat label="Lohnkosten" value={euro(plan.totalLohnCents)} />
          <PlanStat label="Nächste Stufe" value={plan.nextActionable ? `#${plan.nextActionable.sequence}` : (plan.allReturned ? "alle zurück" : "—")} />
          <PlanStat label="Überfällig" value={String(plan.overdue.length)} color={plan.overdue.length ? "red.7" : undefined} />
        </Group>
      )}
      {plan?.allReturned && <Alert color="teal" variant="light" mt="sm" title="Fremdvergabe komplett">Alle Stufen zurück — interne Weiterverarbeitung freigegeben.</Alert>}

      {loading ? <Group mt="sm" gap="xs"><Loader size="sm" /><Text size="sm">lädt…</Text></Group> : (
        stages.length === 0 ? <Text c="dimmed" mt="sm">Keine Fremdvergabe-Stufen zu „{applied}".</Text> : (
          <Table striped highlightOnHover withTableBorder mt="md" verticalSpacing="xs" fz="sm">
            <Table.Thead><Table.Tr>
              <Table.Th>Stufe</Table.Th><Table.Th>Veredler</Table.Th><Table.Th>Status</Table.Th>
              <Table.Th ta="right">Beistellung</Table.Th><Table.Th ta="right">Rücklauf</Table.Th>
              <Table.Th ta="right">Lohn</Table.Th><Table.Th>Termin</Table.Th><Table.Th />
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {stages.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td>#{s.sequence}</Table.Td>
                  <Table.Td>{s.supplierId}</Table.Td>
                  <Table.Td><Badge color={statusMantineColor[s.status] ?? "gray"} variant="light">{s.status}</Badge></Table.Td>
                  <Table.Td style={numTd}>{s.beistellMenge ?? "—"}</Table.Td>
                  <Table.Td style={numTd}>{s.ruecklaufMenge ?? "—"}</Table.Td>
                  <Table.Td style={numTd}>{euro(s.lohnCents)}</Table.Td>
                  <Table.Td>{s.dueDate ? new Date(s.dueDate).toLocaleDateString("de-DE") : "—"}</Table.Td>
                  <Table.Td>{actionsFor(s)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )
      )}
    </>
  );
}

function PlanStat({ label, value, color }: { label: string; value: string; color?: string }): JSX.Element {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.4 }}>{label}</Text>
      <Text fz={20} fw={700} c={color} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</Text>
    </div>
  );
}
