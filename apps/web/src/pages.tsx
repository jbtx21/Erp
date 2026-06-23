// Generische, datengetriebene Modul-Seiten für das "alles durchklickbar"-Gerüst.
// AutoTable rendert jede Liste robust (Cent→€, Datum, Status-Badge), sodass neue
// Bereiche mit wenig Code anbindbar sind. Interaktive Aktionen (Versand bestätigen,
// Mahnlauf, Reorder→Bestellungen) sind je Seite ergänzt.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Badge, Box, Button, Checkbox, Group, Loader, NumberInput, Select, Switch, Table, Text, Textarea, TextInput, Title } from "@mantine/core";
import { orderStatusMachine, type OrderStatus } from "@texma/shared/order";
import { trpc } from "./trpc.js";
import { euro, numTd, statusMantineColor } from "./theme.js";

type Row = Record<string, unknown>;
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// Lädt ein Base64-PDF (vom Server) als Datei herunter.
function downloadBase64Pdf(filename: string, base64: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

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
  gueltigBisAm: "Gültig bis", zugesagterLiefertermin: "Liefertermin", lieferstatus: "Lieferstatus", fakturastatus: "Fakturastatus", externalNumber: "Shop-Nr.", employeeNote: "Vermerk",
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

export function ReorderPage(): JSX.Element {
  const [proposals, setProposals] = useState<Row[]>([]);
  const [demand, setDemand] = useState<Awaited<ReturnType<typeof trpc.reorder.demandProposals.query>>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setProposals((await trpc.reorder.proposals.query()) as Row[]);
      setDemand(await trpc.reorder.demandProposals.query());
      setErr(null);
    } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  return (
    <>
      <Title order={3}>Warenbestellvorschläge</Title>
      <Text size="sm" c="dimmed" mt={4}>Mindestbestand-Vorschläge (T-12) und auftragsübergreifender Bedarf — gesammelt aus allen angelegten Aufträgen + Muster-Leihen, gegen Bestand verrechnet.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      <Group mt="sm">
        <Button size="xs" onClick={async () => { setMsg(null); try { const r = await trpc.reorder.createPurchaseOrders.mutate(); setMsg(`Bestellungen erzeugt: ${r.length}`); await reload(); } catch (e) { setMsg(errMsg(e)); } }}>Bestellungen aus Mindestbestand erzeugen</Button>
        {msg && <Text size="xs" c="dimmed">{msg}</Text>}
      </Group>

      <Title order={4} mt="lg">Auftragsübergreifender Bedarf</Title>
      {demand.length === 0 ? <Text size="sm" c="dimmed" mt="xs">Kein offener variantenbezogener Bedarf (Auftragspositionen mit Artikelverknüpfung nötig).</Text> : (
        <Table mt="xs" withTableBorder withColumnBorders>
          <Table.Thead><Table.Tr>
            <Table.Th>Variante</Table.Th><Table.Th ta="right">Bedarf</Table.Th><Table.Th ta="right">Bestand</Table.Th><Table.Th ta="right">Bestellen</Table.Th><Table.Th>Lieferant</Table.Th><Table.Th>Quellen</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {demand.map((d) => (
              <Table.Tr key={d.variantId}>
                <Table.Td>{d.variantId}</Table.Td>
                <Table.Td ta="right">{d.requiredQty}</Table.Td>
                <Table.Td ta="right">{d.stockQty}</Table.Td>
                <Table.Td ta="right"><b>{d.orderQty}</b></Table.Td>
                <Table.Td>{d.supplierId ?? <Text span c="red" size="xs">kein Hauptlieferant</Text>}</Table.Td>
                <Table.Td><Text size="xs" c="dimmed">{d.sources.map((s) => `${s.source === "ORDER" ? "Auftrag" : "Leihe"} ${s.ref}: ${s.qty}`).join(" · ")}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Title order={4} mt="xl">Mindestbestand-Vorschläge je Lieferant</Title>
      <AutoTable rows={proposals} />
    </>
  );
}

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
  // Mehrartikel-Leihe (mehrere Lieferanten)
  const [multiCompany, setMultiCompany] = useState("co-muster");
  const [multiZweck, setMultiZweck] = useState("Anprobe");
  const [multiLines, setMultiLines] = useState<{ description: string; supplierId: string; menge: number }[]>([{ description: "", supplierId: "", menge: 1 }]);

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

      <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
        <Text size="sm" fw={600}>Mehrartikel-Leihe (Muster/Anprobe, mehrere Lieferanten)</Text>
        <Group gap="xs" align="end" mt="xs">
          <TextInput label="Firmen-ID" value={multiCompany} onChange={(e) => setMultiCompany(e.currentTarget.value)} w={130} />
          <TextInput label="Zweck" value={multiZweck} onChange={(e) => setMultiZweck(e.currentTarget.value)} w={140} />
        </Group>
        {multiLines.map((l, i) => (
          <Group key={i} gap="xs" mt={4} align="end">
            <TextInput label={i === 0 ? "Artikel" : undefined} value={l.description} onChange={(e) => setMultiLines((ls) => ls.map((x, j) => j === i ? { ...x, description: e.currentTarget.value } : x))} w={240} placeholder="Polo blau M" />
            <TextInput label={i === 0 ? "Lieferant-ID" : undefined} value={l.supplierId} onChange={(e) => setMultiLines((ls) => ls.map((x, j) => j === i ? { ...x, supplierId: e.currentTarget.value } : x))} w={150} />
            <NumberInput label={i === 0 ? "Menge" : undefined} value={l.menge} onChange={(v) => setMultiLines((ls) => ls.map((x, j) => j === i ? { ...x, menge: Number(v) || 1 } : x))} min={1} w={90} />
            <Button size="compact-sm" variant="subtle" color="red" disabled={multiLines.length === 1} onClick={() => setMultiLines((ls) => ls.filter((_, j) => j !== i))}>✕</Button>
          </Group>
        ))}
        <Group gap="xs" mt="xs">
          <Button size="compact-xs" variant="light" onClick={() => setMultiLines((ls) => [...ls, { description: "", supplierId: "", menge: 1 }])}>+ Artikel</Button>
          <Button size="compact-sm" disabled={!multiLines.some((l) => l.description.trim())} onClick={() => void act(async () => {
            await trpc.sampleLoans.issueMulti.mutate({ companyId: multiCompany, zweck: multiZweck, lines: multiLines.filter((l) => l.description.trim()).map((l) => ({ description: l.description.trim(), supplierId: l.supplierId.trim() || undefined, menge: l.menge })) });
            setMultiLines([{ description: "", supplierId: "", menge: 1 }]);
          })}>Mehrartikel-Leihe anlegen</Button>
        </Group>
      </Box>

      <AutoTable rows={rows} hide={["lines"]} action={(r) => (
        String(r.status) === "VERLIEHEN"
          ? <Button size="compact-xs" variant="default" onClick={() => void act(() => trpc.sampleLoans.returnSample.mutate({ loanId: String(r.id) }))}>Zurückgenommen</Button>
          : <Text size="xs" c="dimmed">—</Text>
      )} />
    </>
  );
}

// PIM-Felder für die Schnell-/Massenbearbeitung (Schlüssel = API-Feld, Label = deutsch).
const PIM_COLS: ReadonlyArray<{ key: "name" | "brand" | "materialComposition" | "careInstructions" | "hsCode" | "originCountry"; label: string; w: number }> = [
  { key: "name", label: "Name", w: 150 },
  { key: "brand", label: "Marke", w: 110 },
  { key: "materialComposition", label: "Material", w: 130 },
  { key: "careInstructions", label: "Pflege", w: 120 },
  { key: "hsCode", label: "Zolltarif", w: 100 },
  { key: "originCountry", label: "Ursprung", w: 90 },
];

// Eine editierbare Artikelzeile (Schnellbearbeitung): lokaler Entwurf + Speichern.
type ArticleData = Row & { completeness?: { percent: number; missing: string[] } };
function ArticleRowEdit({ a, onSaved, onVariants }: { a: ArticleData; onSaved: () => void; onVariants: () => void }): JSX.Element {
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(PIM_COLS.map((c) => [c.key, String(a[c.key] ?? "")])));
  const [busy, setBusy] = useState(false);
  const dirty = PIM_COLS.some((c) => draft[c.key] !== String(a[c.key] ?? ""));
  const pct = (a.completeness?.percent ?? 0);
  return (
    <Table.Tr>
      <Table.Td><Text size="sm" fw={600}>{String(a.sku)}</Text></Table.Td>
      {PIM_COLS.map((c) => (
        <Table.Td key={c.key}><TextInput size="xs" w={c.w} value={draft[c.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.currentTarget.value }))} /></Table.Td>
      ))}
      <Table.Td><Badge color={pct === 100 ? "green" : pct >= 50 ? "yellow" : "red"} variant="light">{pct}%</Badge></Table.Td>
      <Table.Td>
        <Group gap={4} wrap="nowrap">
          <Button size="compact-xs" disabled={!dirty} loading={busy} onClick={async () => {
            setBusy(true);
            try { await trpc.products.updateArticle.mutate({ id: String(a.id), patch: draft }); onSaved(); } finally { setBusy(false); }
          }}>Speichern</Button>
          <Button size="compact-xs" variant="default" onClick={onVariants}>Varianten</Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

export function ProductsPage(): JSX.Element {
  const [articles, setArticles] = useState<ArticleData[]>([]);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [variants, setVariants] = useState<Row[]>([]);
  const [vsku, setVsku] = useState("");
  const [farbe, setFarbe] = useState("");
  const [groesse, setGroesse] = useState("");
  const [err, setErr] = useState<string | null>(null);
  // Massenbearbeitung
  const [bulkSkus, setBulkSkus] = useState("");
  const [bulkField, setBulkField] = useState<string>("brand");
  const [bulkValue, setBulkValue] = useState("");

  const loadArticles = useCallback(async () => {
    try { setArticles((await trpc.products.listArticles.query()) as ArticleData[]); setErr(null); }
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
      <Title order={3}>Artikel &amp; Varianten (PIM)</Title>
      <Text size="sm" c="dimmed" mt={4}>Stammdaten (B16): Artikel direkt in der Tabelle bearbeiten (Schnellbearbeitung), Vollständigkeit je Artikel, Massenbearbeitung über mehrere SKUs, Farbe×Größe-Varianten.</Text>
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

      <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
        <Text size="sm" fw={600}>Massenbearbeitung</Text>
        <Group gap="xs" align="end" mt="xs">
          <TextInput label="SKUs (kommagetrennt)" value={bulkSkus} onChange={(e) => setBulkSkus(e.currentTarget.value)} placeholder="A-1, A-2" w={220} />
          <Select label="Feld" w={160} value={bulkField} onChange={(v) => v && setBulkField(v)}
            data={[{ value: "brand", label: "Marke" }, { value: "materialComposition", label: "Material" }, { value: "careInstructions", label: "Pflege" }, { value: "hsCode", label: "Zolltarif" }, { value: "originCountry", label: "Ursprung" }]} />
          <TextInput label="Wert" value={bulkValue} onChange={(e) => setBulkValue(e.currentTarget.value)} w={160} />
          <Button disabled={!bulkSkus.trim()} onClick={async () => {
            setErr(null);
            try {
              const skus = bulkSkus.split(",").map((s) => s.trim()).filter(Boolean);
              const r = await trpc.products.bulkUpdateArticles.mutate({ skus, patch: { [bulkField]: bulkValue } });
              window.alert(`${r.updated} Artikel aktualisiert.`);
              setBulkValue(""); await loadArticles();
            } catch (e) { setErr(errMsg(e)); }
          }}>Anwenden</Button>
        </Group>
      </Box>

      <Table mt="md" withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead><Table.Tr>
          <Table.Th>SKU</Table.Th>
          {PIM_COLS.map((c) => <Table.Th key={c.key}>{c.label}</Table.Th>)}
          <Table.Th>Vollst.</Table.Th><Table.Th>Aktion</Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {articles.map((a) => (
            <ArticleRowEdit key={String(a.id)} a={a} onSaved={() => void loadArticles()} onVariants={() => void loadVariants(String(a.id))} />
          ))}
        </Table.Tbody>
      </Table>

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

// Wiederverwendbarer Mehrzeilen-Positionseditor (Anfrage/Angebot/Auftrag-Erstellung):
// Beschreibung, Menge, Einzelpreis (€) je Zeile; Zeilen hinzufügen/entfernen.
export type PositionKind = "TEXTIL" | "VEREDELUNG" | "SONSTIGE";
export interface EditorLine { description: string; qty: number; euro: number; kind: PositionKind }
export function LinesEditor({ lines, onChange }: { lines: EditorLine[]; onChange: (l: EditorLine[]) => void }): JSX.Element {
  const set = (i: number, patch: Partial<EditorLine>): void => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <Box>
      {lines.map((l, i) => (
        <Group key={i} gap="xs" mt={4} align="end">
          <Select label={i === 0 ? "Art" : undefined} w={130} value={l.kind} onChange={(v) => v && set(i, { kind: v as PositionKind })}
            data={[{ value: "TEXTIL", label: "Textil" }, { value: "VEREDELUNG", label: "Veredelung" }, { value: "SONSTIGE", label: "Sonstiges" }]} />
          <TextInput label={i === 0 ? "Beschreibung" : undefined} value={l.description} onChange={(e) => set(i, { description: e.currentTarget.value })} placeholder="200 Polos bestickt" w={240} />
          <NumberInput label={i === 0 ? "Menge" : undefined} value={l.qty} onChange={(v) => set(i, { qty: Number(v) || 1 })} min={1} w={90} />
          <NumberInput label={i === 0 ? "Einzel (€)" : undefined} value={l.euro} onChange={(v) => set(i, { euro: Number(v) || 0 })} min={0} decimalScale={2} w={110} />
          <Button size="compact-sm" variant="subtle" color="red" disabled={lines.length === 1} onClick={() => onChange(lines.filter((_, j) => j !== i))}>✕</Button>
        </Group>
      ))}
      <Button size="compact-xs" variant="light" mt="xs" onClick={() => onChange([...lines, { description: "", qty: 1, euro: 0, kind: "VEREDELUNG" }])}>+ Position</Button>
    </Box>
  );
}
export const toApiLines = (lines: EditorLine[]): { description: string; qty: number; unitNetCents: number; kind: PositionKind }[] =>
  lines.filter((l) => l.description.trim()).map((l) => ({ description: l.description.trim(), qty: l.qty, unitNetCents: Math.round(l.euro * 100), kind: l.kind }));

export function QuotesPage(): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [companyId, setCompanyId] = useState("co-muster");
  const [lines, setLines] = useState<EditorLine[]>([{ description: "", qty: 10, euro: 12.9, kind: "TEXTIL" }]);
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
        {status === "ANGENOMMEN" && <Button size="compact-xs" color="blue" onClick={() => void act(async () => { const r = await trpc.sales.convertQuote.mutate({ quoteId: id }); window.alert(`Auftrag ${r.number} angelegt.`); })}>→ Auftrag</Button>}
        {status === "ANGENOMMEN" && <Button size="compact-xs" variant="light" color="grape" onClick={() => void act(async () => { await trpc.sampleLoans.convertQuote.mutate({ quoteId: id }); window.alert("Muster/Anprobe-Leihe aus Angebot angelegt."); })}>→ Leihgut</Button>}
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
      <Text size="sm" c="dimmed" mt={4}>Mehrzeiliges Angebot anlegen → Versendet → Angenommen → „→ Auftrag" wandelt es in einen Auftrag um (B8, AN-Nummer aus F1).</Text>
      <Group mt="sm" gap="xs" align="end">
        <TextInput label="Firmen-ID" value={companyId} onChange={(e) => setCompanyId(e.currentTarget.value)} w={130} />
      </Group>
      <LinesEditor lines={lines} onChange={setLines} />
      <Button mt="sm" loading={busy} disabled={!companyId.trim() || toApiLines(lines).length === 0} onClick={async () => {
        setBusy(true); setErr(null);
        try {
          await trpc.quotes.create.mutate({ companyId, lines: toApiLines(lines) });
          setLines([{ description: "", qty: 10, euro: 12.9, kind: "TEXTIL" }]); await load();
        } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
      }}>Angebot anlegen</Button>
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

// Mehrfach-Teillieferung: Restmengen je Position erfassen → (Teil-)Lieferschein.
// Verknüpfte Belege („Connections"): alle mit dem Auftrag verbundenen Dokumente.
function LinksPanel({ orderId }: { orderId: string }): JSX.Element {
  const [data, setData] = useState<Awaited<ReturnType<typeof trpc.links.forOrder.query>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void trpc.links.forOrder.query({ orderId }).then(setData).catch((e: unknown) => setErr(errMsg(e)));
  }, [orderId]);
  return (
    <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
      <Text size="sm" fw={600}>Verknüpfte Belege</Text>
      {err && <Alert color="red" mt="xs">{err}</Alert>}
      {data && data.links.length === 0 && <Text size="sm" c="dimmed" mt={4}>Noch keine verknüpften Belege.</Text>}
      <Group gap="xs" mt="xs" wrap="wrap">
        {data?.links.map((l, i) => (
          <Badge key={i} variant="light" color={l.financial ? "teal" : "gray"} title={l.type}>
            {l.type}: {l.label}
          </Badge>
        ))}
      </Group>
    </Box>
  );
}

// Auftrags-Workflow / Statusverwaltung: Produktionsroute + Schritt-Checkliste.
const WF_ROUTES = [
  { value: "ROUTE1_KEINE", label: "Route 1 – keine Veredelung" },
  { value: "ROUTE2_INTERN", label: "Route 2 – interne Veredelung" },
  { value: "ROUTE3_EXTERN", label: "Route 3 – externe Veredler" },
  { value: "ROUTE4_EXTERN_INTERN", label: "Route 4 – extern + intern" },
] as const;

function WorkflowPanel({ orderId }: { orderId: string }): JSX.Element {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof trpc.workflow.status.query>> | null>(null);
  const [route, setRoute] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setStatus(await trpc.workflow.status.query({ orderId })); setErr(null); } catch (e) { setErr(errMsg(e)); }
  }, [orderId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
      <Text size="sm" fw={600}>Workflow / Statusverwaltung</Text>
      {err && <Alert color="red" mt="xs">{err}</Alert>}
      {!status ? (
        <Group gap="xs" align="end" mt="xs">
          <Select label="Route zuweisen" placeholder="automatisch aus Veredelung" w={260} value={route} onChange={setRoute} data={WF_ROUTES.map((r) => ({ value: r.value, label: r.label }))} />
          <Button size="compact-sm" onClick={async () => { try { await trpc.workflow.assignRoute.mutate({ orderId, route: (route ?? undefined) as "ROUTE1_KEINE" | undefined }); await load(); } catch (e) { setErr(errMsg(e)); } }}>Route starten</Button>
        </Group>
      ) : (
        <>
          <Text size="sm" mt={4}>{status.label} · Schritt {Math.min(status.stepIndex + 1, status.totalSteps)}/{status.totalSteps}{status.done ? " · abgeschlossen ✓" : ""}</Text>
          <Box mt="xs">
            {status.steps.map((s) => (
              <Group key={s.key} gap={8} py={3}>
                <Text size="sm" w={20}>{s.done ? "✅" : s.current ? "▶️" : "⬜"}</Text>
                <Text size="sm" fw={s.current ? 700 : 400} c={s.done ? "dimmed" : undefined}>{s.label}</Text>
              </Group>
            ))}
          </Box>
          {!status.done && (
            <Button size="compact-sm" mt="xs" onClick={async () => { try { await trpc.workflow.advance.mutate({ orderId }); await load(); } catch (e) { setErr(errMsg(e)); } }}>
              Schritt abschließen → „{status.currentStep?.label ?? ""}"
            </Button>
          )}
        </>
      )}
    </Box>
  );
}

function DeliveryPanel({ orderId, onChanged }: { orderId: string; onChanged: () => void }): JSX.Element {
  const [lines, setLines] = useState<Awaited<ReturnType<typeof trpc.deliveries.remaining.query>>>([]);
  const [notes, setNotes] = useState<Awaited<ReturnType<typeof trpc.deliveries.list.query>>>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setLines(await trpc.deliveries.remaining.query({ orderId })); setNotes(await trpc.deliveries.list.query({ orderId })); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, [orderId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Title order={4} mt="xl">Teillieferung erfassen</Title>
      <Text size="sm" c="dimmed" mt={2}>Mehrere Teil-Lieferscheine je Auftrag möglich; Überlieferung wird blockiert.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      {lines.length === 0 ? <Text size="sm" c="dimmed" mt="xs">Keine Auftragspositionen (Demo-Auftrag ohne Zeilen).</Text> : (
        <Table mt="xs" withTableBorder withColumnBorders>
          <Table.Thead><Table.Tr>
            <Table.Th>Pos.</Table.Th><Table.Th>Beschreibung</Table.Th>
            <Table.Th ta="right">Bestellt</Table.Th><Table.Th ta="right">Geliefert</Table.Th><Table.Th ta="right">Rest</Table.Th><Table.Th ta="right">Jetzt liefern</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {lines.map((l) => (
              <Table.Tr key={l.orderLineId}>
                <Table.Td>{l.position}</Table.Td><Table.Td>{l.description}</Table.Td>
                <Table.Td ta="right">{l.orderedQty}</Table.Td><Table.Td ta="right">{l.deliveredQty}</Table.Td><Table.Td ta="right">{l.remainingQty}</Table.Td>
                <Table.Td ta="right">
                  <NumberInput size="xs" w={90} min={0} max={l.remainingQty} disabled={l.remainingQty === 0}
                    value={qty[l.orderLineId] ?? 0} onChange={(v) => setQty((q) => ({ ...q, [l.orderLineId]: typeof v === "number" ? v : 0 }))} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Button mt="sm" disabled={Object.values(qty).every((v) => !v)}
        onClick={async () => {
          setErr(null);
          try {
            const dlines = Object.entries(qty).filter(([, v]) => v > 0).map(([orderLineId, v]) => ({ orderLineId, qty: v }));
            await trpc.deliveries.create.mutate({ orderId, lines: dlines });
            setQty({}); await load(); onChanged();
          } catch (e) { setErr(errMsg(e)); }
        }}>Lieferschein erstellen</Button>
      {notes.length > 0 && (
        <>
          <Text fw={600} size="sm" mt="md">Lieferscheine</Text>
          {notes.map((n) => (
            <Group key={n.id} gap="xs" mt={2}>
              <Text size="sm">📦 {n.number} — {n.lines.reduce((s, x) => s + x.qty, 0)} Stück ({fmtDate(n.createdAt)})</Text>
              <Button size="compact-xs" variant="light" onClick={async () => {
                try { const pdf = await trpc.print.deliveryNote.query({ deliveryNoteId: n.id }); downloadBase64Pdf(pdf.filename, pdf.base64); }
                catch (e) { setErr(errMsg(e)); }
              }}>PDF</Button>
            </Group>
          ))}
        </>
      )}
    </>
  );
}

export function OrdersPage({ role }: { role: string }): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // Terminierungs-Panel (B9): Auftrag + zugesagter Liefertermin + Rückwärts-Vorschau.
  const [termOrder, setTermOrder] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState<string>("");
  const [plan, setPlan] = useState<SchedulePlan | null>(null);
  // Manuelle Auftragserstellung (ADMIN/BUERO).
  const [showCreate, setShowCreate] = useState(false);
  const [newCompany, setNewCompany] = useState("co-muster");
  const [newLines, setNewLines] = useState<EditorLine[]>([{ description: "", qty: 10, euro: 12.9, kind: "TEXTIL" }]);

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
      {canAct && (
        <Box mt="sm">
          <Button size="compact-sm" variant="light" onClick={() => setShowCreate((v) => !v)}>{showCreate ? "Erfassung schließen" : "+ Auftrag manuell anlegen"}</Button>
          {showCreate && (
            <Box mt="xs" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
              <TextInput label="Firmen-ID" value={newCompany} onChange={(e) => setNewCompany(e.currentTarget.value)} w={160} />
              <LinesEditor lines={newLines} onChange={setNewLines} />
              <Button mt="sm" disabled={!newCompany.trim() || toApiLines(newLines).length === 0} onClick={async () => {
                setErr(null);
                try {
                  const r = await trpc.sales.createOrder.mutate({ companyId: newCompany, lines: toApiLines(newLines) });
                  window.alert(`Auftrag ${r.number} angelegt.`);
                  setNewLines([{ description: "", qty: 10, euro: 12.9, kind: "TEXTIL" }]); setShowCreate(false); await load();
                } catch (e) { setErr(errMsg(e)); }
              }}>Auftrag anlegen</Button>
            </Box>
          )}
        </Box>
      )}
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
            <Button variant="default" disabled={!termOrder}
              onClick={async () => {
                setErr(null);
                try { await trpc.shopOrders.recomputeFulfillment.mutate({ orderId: termOrder! }); await load(); }
                catch (e) { setErr(errMsg(e)); }
              }}>Erfüllungsstatus neu berechnen</Button>
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
          {termOrder && <WorkflowPanel orderId={termOrder} />}
          {termOrder && <LinksPanel orderId={termOrder} />}
          {termOrder && <DeliveryPanel orderId={termOrder} onChanged={() => void load()} />}
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
      <Text size="sm" c="dimmed" mt={4}>Anfrage-Funnel NEU → In Bearbeitung → Angebot (B20, AF-Nummer aus F1). Maileingang wird per IMAP zu Anfragen, Absender mit Kundenstammdaten abgeglichen.</Text>
      <Button size="compact-sm" variant="light" mt="xs" onClick={() => void act(async () => {
        const r = await trpc.mail.pollInbox.mutate();
        window.alert(`Posteingang: ${r.created} neue Anfrage(n), ${r.matched} Kunde(n) zugeordnet, ${r.skipped} übersprungen.`);
      })}>📧 Posteingang abrufen</Button>
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

// Generisches Dashboard (G-7): Charts/KPI-Kacheln als wiederverwendbare Entitäten über
// einem festen Metrik-Katalog; zu Dashboards zusammenstellbar und aufgelöst angezeigt.
function MiniBars({ series }: { series: { label: string; value: number }[] }): JSX.Element {
  const max = Math.max(1, ...series.map((s) => s.value));
  return (
    <>
      {series.map((s, i) => (
        <Group key={i} gap="xs" mt={3} wrap="nowrap">
          <Text size="xs" w={150} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</Text>
          <Box style={{ flex: 1, background: "var(--erp-surface)", borderRadius: 4 }}>
            <Box style={{ width: `${String((s.value / max) * 100)}%`, minWidth: 2, height: 14, background: "var(--erp-focus)", borderRadius: 4 }} />
          </Box>
          <Text size="xs" w={40} ta="right">{s.value}</Text>
        </Group>
      ))}
    </>
  );
}

export function DashboardsPage(): JSX.Element {
  const [dashboards, setDashboards] = useState<Row[]>([]);
  const [metrics, setMetrics] = useState<{ key: string; label: string; kind: string }[]>([]);
  const [charts, setCharts] = useState<Row[]>([]);
  const [cards, setCards] = useState<Row[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Awaited<ReturnType<typeof trpc.dashboards.resolved.query>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chartName, setChartName] = useState(""); const [chartMetric, setChartMetric] = useState<string | null>(null);
  const [cardName, setCardName] = useState(""); const [cardMetric, setCardMetric] = useState<string | null>(null);
  const [dashName, setDashName] = useState(""); const [dashShared, setDashShared] = useState(false);
  const [addKind, setAddKind] = useState<string>("CARD"); const [addRef, setAddRef] = useState<string | null>(null);

  const reloadResolved = useCallback(async (id: string) => {
    setResolved(await trpc.dashboards.resolved.query({ id }));
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const ds = (await trpc.dashboards.list.query()) as Row[];
      setDashboards(ds);
      // Persönliches Standard-Dashboard automatisch vorauswählen (jede:r sieht das eigene).
      setSel((cur) => cur ?? (ds.find((d) => d.isDefault)?.id as string | undefined) ?? null);
      setMetrics(await trpc.dashboards.metrics.query());
      setCharts((await trpc.dashboards.listCharts.query()) as Row[]);
      setCards((await trpc.dashboards.listCards.query()) as Row[]);
      setErr(null);
    } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => {
    if (!sel) { setResolved(null); return; }
    void trpc.dashboards.resolved.query({ id: sel }).then(setResolved).catch((e: unknown) => setErr(errMsg(e)));
  }, [sel]);

  const metricOpts = metrics.map((m) => ({ value: m.key, label: `${m.label} · ${m.kind}` }));
  const refOpts = addKind === "CARD"
    ? cards.map((c) => ({ value: String(c.id), label: String(c.name) }))
    : charts.map((c) => ({ value: String(c.id), label: String(c.name) }));

  return (
    <>
      <Title order={3}>Dashboards</Title>
      <Text size="sm" c="dimmed" mt={4}>Personalisierte Dashboards je Mitarbeiter — frei aus Charts + KPI-Kacheln (fester Metrik-Katalog, G-7) zusammenstellbar. „Geteilt" = für alle sichtbar.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      <Group align="flex-end" gap="sm" mt="sm">
        <Select label="Dashboard" placeholder="wählen" w={300}
          data={dashboards.map((d) => ({ value: String(d.id), label: `${String(d.name)}${d.ownerEmail ? "" : " · geteilt"}${d.isDefault ? " ★" : ""}` }))}
          value={sel} onChange={setSel} />
        <Button variant="light" disabled={!sel} onClick={async () => { setErr(null); try { await trpc.dashboards.setDefault.mutate({ dashboardId: sel! }); await loadAll(); } catch (e) { setErr(errMsg(e)); } }}>Als mein Standard</Button>
      </Group>

      {resolved && (
        <Group align="stretch" mt="md" gap="md" wrap="wrap">
          {resolved.widgets.map((w) => (
            <Box key={w.id} p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, width: w.width === "FULL" ? "100%" : "calc(50% - 8px)" }}>
              <Group justify="space-between" align="flex-start" gap={4}>
                <Text size="sm" fw={600}>{w.title}</Text>
                <Group gap={2}>
                  <Button size="compact-xs" variant="subtle" onClick={async () => { setErr(null); try { await trpc.dashboards.moveItem.mutate({ itemId: w.id, direction: "UP" }); if (sel) await reloadResolved(sel); } catch (e) { setErr(errMsg(e)); } }}>↑</Button>
                  <Button size="compact-xs" variant="subtle" onClick={async () => { setErr(null); try { await trpc.dashboards.moveItem.mutate({ itemId: w.id, direction: "DOWN" }); if (sel) await reloadResolved(sel); } catch (e) { setErr(errMsg(e)); } }}>↓</Button>
                  <Button size="compact-xs" variant="subtle" color="red" onClick={async () => { setErr(null); try { await trpc.dashboards.removeItem.mutate({ itemId: w.id }); if (sel) await reloadResolved(sel); } catch (e) { setErr(errMsg(e)); } }}>✕</Button>
                </Group>
              </Group>
              {w.kind === "CARD"
                ? <Text fz={32} fw={700} mt={4}>{w.value ?? "—"}</Text>
                : w.series && w.series.length > 0 ? <MiniBars series={w.series} /> : <Text size="sm" c="dimmed" mt={4}>Keine Daten.</Text>}
            </Box>
          ))}
          {resolved.widgets.length === 0 && <Text size="sm" c="dimmed">Noch keine Kacheln — unten hinzufügen.</Text>}
        </Group>
      )}

      <Title order={4} mt="xl">Bausteine anlegen</Title>
      <Group align="flex-end" gap="sm" mt="xs" wrap="wrap">
        <TextInput label="KPI-Kachel: Name" value={cardName} onChange={(e) => setCardName(e.currentTarget.value)} w={180} />
        <Select label="Metrik" w={240} data={metricOpts.filter((m) => m.label.endsWith("NUMBER"))} value={cardMetric} onChange={setCardMetric} />
        <Button variant="light" disabled={!cardName.trim() || !cardMetric} onClick={async () => { setErr(null); try { await trpc.dashboards.createCard.mutate({ name: cardName, metricKey: cardMetric! }); setCardName(""); await loadAll(); } catch (e) { setErr(errMsg(e)); } }}>+ Kachel</Button>
      </Group>
      <Group align="flex-end" gap="sm" mt="xs" wrap="wrap">
        <TextInput label="Chart: Name" value={chartName} onChange={(e) => setChartName(e.currentTarget.value)} w={180} />
        <Select label="Metrik" w={240} data={metricOpts.filter((m) => m.label.endsWith("SERIES"))} value={chartMetric} onChange={setChartMetric} />
        <Button variant="light" disabled={!chartName.trim() || !chartMetric} onClick={async () => { setErr(null); try { await trpc.dashboards.createChart.mutate({ name: chartName, chartType: "BAR", metricKey: chartMetric! }); setChartName(""); await loadAll(); } catch (e) { setErr(errMsg(e)); } }}>+ Chart</Button>
      </Group>

      <Title order={4} mt="xl">Dashboard zusammenstellen</Title>
      <Group align="flex-end" gap="sm" mt="xs" wrap="wrap">
        <TextInput label="Neues Dashboard" value={dashName} onChange={(e) => setDashName(e.currentTarget.value)} w={200} />
        <Switch label="Geteilt (für alle)" checked={dashShared} onChange={(e) => setDashShared(e.currentTarget.checked)} mb={6} />
        <Button variant="light" disabled={!dashName.trim()} onClick={async () => { setErr(null); try { const d = await trpc.dashboards.createDashboard.mutate({ name: dashName, shared: dashShared }); setDashName(""); setDashShared(false); await loadAll(); setSel(d.id); } catch (e) { setErr(errMsg(e)); } }}>+ Dashboard</Button>
      </Group>
      <Group align="flex-end" gap="sm" mt="xs" wrap="wrap">
        <Select label="Typ" w={120} data={[{ value: "CARD", label: "Kachel" }, { value: "CHART", label: "Chart" }]} value={addKind} onChange={(v) => { if (v) { setAddKind(v); setAddRef(null); } }} />
        <Select label="Baustein" w={240} data={refOpts} value={addRef} onChange={setAddRef} />
        <Button disabled={!sel || !addRef} onClick={async () => { setErr(null); try { await trpc.dashboards.addItem.mutate({ dashboardId: sel!, kind: addKind as "CARD" | "CHART", refId: addRef!, width: addKind === "CHART" ? "FULL" : "HALF" }); if (sel) setResolved(await trpc.dashboards.resolved.query({ id: sel })); } catch (e) { setErr(errMsg(e)); } }}>Zum gewählten Dashboard hinzufügen</Button>
      </Group>
    </>
  );
}

// E-Mail-/Text-Vorlagen (G-5): anlegen/bearbeiten + Vorschau-Rendering mit Variablen.
// Platzhalter in doppelten geschweiften Klammern (z. B. name, nr).
export function EmailTemplatesPage(): JSX.Element {
  const [list, setList] = useState<Row[]>([]);
  const [key, setKey] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [varsJson, setVarsJson] = useState('{ "name": "Max", "nr": "WC-1" }');
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setList((await trpc.emailTemplates.list.query()) as Row[]); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Title order={3}>E-Mail-Vorlagen</Title>
      <Text size="sm" c="dimmed" mt={4}>Vorlagen mit Platzhaltern (doppelte geschweifte Klammern), z. B. „name" oder „nr" (G-5).</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      <AutoTable rows={list} hide={["id", "updatedAt", "body"]} action={(t) => (
        <Button size="compact-xs" variant="light" onClick={() => { setKey(String(t.key)); setSubject(String(t.subject)); setBody(String(t.body)); setPreview(null); }}>Bearbeiten</Button>
      )} />

      <Title order={4} mt="xl">Vorlage anlegen/bearbeiten</Title>
      <TextInput label="Schlüssel" placeholder="auftrag.versendet" value={key} onChange={(e) => setKey(e.currentTarget.value)} w={340} mt="xs" />
      <TextInput label="Betreff" value={subject} onChange={(e) => setSubject(e.currentTarget.value)} mt="xs" />
      <Textarea label="Text" value={body} onChange={(e) => setBody(e.currentTarget.value)} autosize minRows={4} mt="xs" />
      <Button mt="sm" disabled={!key.trim() || !subject.trim() || !body.trim()}
        onClick={async () => { setErr(null); try { await trpc.emailTemplates.upsert.mutate({ key, subject, body }); await load(); } catch (e) { setErr(errMsg(e)); } }}>Speichern</Button>

      <Title order={4} mt="xl">Vorschau (Rendering)</Title>
      <Textarea label="Variablen (JSON)" value={varsJson} onChange={(e) => setVarsJson(e.currentTarget.value)} autosize minRows={2} mt="xs" />
      <Button mt="sm" variant="light" disabled={!key.trim()}
        onClick={async () => {
          setErr(null); setPreview(null);
          try { setPreview(await trpc.emailTemplates.render.query({ key, vars: JSON.parse(varsJson) as Record<string, string | number> })); }
          catch (e) { setErr(errMsg(e)); }
        }}>Vorschau rendern</Button>
      {preview && (
        <Alert color="navy" variant="light" mt="md">
          <b>{preview.subject}</b>
          <Text size="sm" mt={4} style={{ whiteSpace: "pre-wrap" }}>{preview.body}</Text>
        </Alert>
      )}
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

// Stammdaten-Im-/Export (CSV): Artikel/Kunden/Lieferanten exportieren (Download) und
// importieren (Datei oder Textfeld). Migration aus CDH + laufende Pflege.
export function DataIoPage(): JSX.Element {
  const [kind, setKind] = useState<"ARTICLE" | "COMPANY" | "SUPPLIER">("ARTICLE");
  const [csv, setCsv] = useState("");
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof trpc.dataIo.importCsv.mutate>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const label = { ARTICLE: "Artikel", COMPANY: "Kunden", SUPPLIER: "Lieferanten" }[kind];

  const doExport = async (): Promise<void> => {
    setErr(null);
    try {
      const text = await trpc.dataIo.exportCsv.query({ kind });
      const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${label.toLowerCase()}-export.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <>
      <Title order={3}>Import / Export</Title>
      <Text size="sm" c="dimmed" mt={4}>Stammdaten als CSV (deutsches Excel-Format, Trennzeichen „;"). Import upsertet je Artikelnummer bzw. Name; fehlerhafte Zeilen werden gemeldet und übersprungen.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      <Group align="flex-end" gap="sm" mt="md" wrap="wrap">
        <Select label="Datensatz" w={200} value={kind} onChange={(v) => { if (v) { setKind(v as typeof kind); setSummary(null); } }}
          data={[{ value: "ARTICLE", label: "Artikel" }, { value: "COMPANY", label: "Kunden" }, { value: "SUPPLIER", label: "Lieferanten" }]} />
        <Button variant="light" onClick={() => void doExport()}>{label} exportieren (CSV)</Button>
      </Group>

      <Title order={4} mt="xl">{label} importieren</Title>
      <Group gap="sm" mt="xs">
        <input type="file" accept=".csv,text/csv" onChange={(e) => {
          const f = e.currentTarget.files?.[0]; if (!f) return;
          const reader = new FileReader();
          reader.onload = () => setCsv(String(reader.result ?? ""));
          reader.readAsText(f);
        }} />
      </Group>
      <Textarea label="…oder CSV einfügen" autosize minRows={4} maxRows={12} mt="xs" value={csv} onChange={(e) => setCsv(e.currentTarget.value)} placeholder="Artikelnummer;Bezeichnung;Marke&#10;A-1;Poloshirt;TEXMA" />
      <Button mt="sm" disabled={!csv.trim()} onClick={async () => {
        setErr(null); setSummary(null);
        try { setSummary(await trpc.dataIo.importCsv.mutate({ kind, csv })); } catch (e) { setErr(errMsg(e)); }
      }}>Importieren</Button>

      {summary && (
        <Alert color={summary.errors.length > 0 ? "yellow" : "green"} mt="md" title="Import-Ergebnis">
          <Text size="sm">Neu: {summary.created} · Aktualisiert: {summary.updated} · Übersprungen: {summary.skipped} · Fehler: {summary.errors.length}</Text>
          {summary.errors.slice(0, 20).map((e, i) => (
            <Text key={i} size="xs" c="dimmed">Zeile {e.row}: {e.message}</Text>
          ))}
        </Alert>
      )}
    </>
  );
}

// Newsletter (Brevo): Kampagnen anlegen + an Opt-in-Kontakte versenden (DSGVO).
export function NewsletterPage(): JSX.Element {
  const [list, setList] = useState<Row[]>([]);
  const [audience, setAudience] = useState<number>(0);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList((await trpc.newsletter.list.query()) as Row[]);
      setAudience(await trpc.newsletter.audienceSize.query());
      setErr(null);
    } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Title order={3}>Newsletter</Title>
      <Text size="sm" c="dimmed" mt={4}>Kampagnen über Brevo an Kontakte mit Newsletter-Einwilligung (DSGVO, Kap. 28). Aktuelle Empfänger mit Opt-in: <b>{audience}</b>.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      <Title order={4} mt="md">Neue Kampagne</Title>
      <TextInput label="Betreff" value={subject} onChange={(e) => setSubject(e.currentTarget.value)} mt="xs" w={420} />
      <Textarea label="Inhalt" value={body} onChange={(e) => setBody(e.currentTarget.value)} autosize minRows={4} mt="xs" />
      <Button mt="sm" disabled={!subject.trim() || !body.trim()} onClick={async () => {
        setErr(null);
        try { await trpc.newsletter.create.mutate({ subject, body }); setSubject(""); setBody(""); await load(); }
        catch (e) { setErr(errMsg(e)); }
      }}>Kampagne anlegen</Button>

      <Title order={4} mt="xl">Kampagnen</Title>
      <AutoTable rows={list} hide={["body"]} action={(r) => (
        String(r.status) === "ENTWURF"
          ? <Button size="compact-xs" color="green" onClick={async () => {
              setErr(null);
              try { const res = await trpc.newsletter.send.mutate({ campaignId: String(r.id) }); window.alert(`Versendet an ${res.recipientCount} Empfänger.`); await load(); }
              catch (e) { setErr(errMsg(e)); }
            }}>Versenden</Button>
          : <Text size="xs" c="dimmed">gesendet</Text>
      )} />
    </>
  );
}

// Verkaufschancen / Pipeline (komplexes CRM): gewichteter Forecast + Phasen.
const OPP_STAGES = [
  { value: "QUALIFIZIERUNG", label: "Qualifizierung" },
  { value: "ANGEBOT", label: "Angebot" },
  { value: "VERHANDLUNG", label: "Verhandlung" },
  { value: "ABSCHLUSS", label: "Abschluss" },
] as const;

export function OpportunitiesPage(): JSX.Element {
  const [items, setItems] = useState<Row[]>([]);
  const [pipeline, setPipeline] = useState<Awaited<ReturnType<typeof trpc.opportunities.pipeline.query>> | null>(null);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [stage, setStage] = useState<string>("QUALIFIZIERUNG");
  const [euro, setEuro] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems((await trpc.opportunities.list.query()) as Row[]); setPipeline(await trpc.opportunities.pipeline.query()); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>): Promise<void> => { setErr(null); try { await fn(); await load(); } catch (e) { setErr(errMsg(e)); } };

  return (
    <>
      <Title order={3}>Verkaufschancen (CRM-Pipeline)</Title>
      <Text size="sm" c="dimmed" mt={4}>Gewichteter Forecast = Wert × Wahrscheinlichkeit der offenen Chancen. Hubspot-Spiegelung optional (HUBSPOT_TOKEN).</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      {pipeline && (
        <Group mt="md" gap="md" wrap="wrap">
          {pipeline.buckets.map((b) => (
            <Box key={b.stage} p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, minWidth: 160 }}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{b.label}</Text>
              <Text fz={22} fw={700}>{(b.weightedCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</Text>
              <Text size="xs" c="dimmed">{b.count} offen · brutto {(b.valueCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</Text>
            </Box>
          ))}
          <Box p="md" style={{ border: "2px solid var(--mantine-color-blue-4)", borderRadius: 8, minWidth: 180 }}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Forecast (gewichtet)</Text>
            <Text fz={24} fw={800} c="blue">{(pipeline.forecastCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</Text>
            <Text size="xs" c="dimmed">{pipeline.openCount} offene Chancen</Text>
          </Box>
        </Group>
      )}

      <Title order={4} mt="xl">Neue Chance</Title>
      <Group gap="xs" align="end" mt="xs">
        <TextInput label="Titel" value={title} onChange={(e) => setTitle(e.currentTarget.value)} w={220} />
        <TextInput label="Firmen-ID (optional)" value={company} onChange={(e) => setCompany(e.currentTarget.value)} w={150} />
        <Select label="Phase" value={stage} onChange={(v) => v && setStage(v)} data={OPP_STAGES.map((s) => ({ value: s.value, label: s.label }))} w={150} />
        <NumberInput label="Wert (€)" value={euro} onChange={(v) => setEuro(Number(v) || 0)} min={0} w={120} />
        <Button disabled={!title.trim()} onClick={() => void act(async () => {
          await trpc.opportunities.create.mutate({ title, companyId: company || undefined, stage: stage as "QUALIFIZIERUNG", valueCents: Math.round(euro * 100) });
          setTitle(""); setCompany(""); setEuro(0);
        })}>Anlegen</Button>
      </Group>

      <Title order={4} mt="xl">Chancen</Title>
      <AutoTable rows={items} action={(r) => {
        const id = String(r.id); const status = String(r.status);
        if (status !== "OFFEN") return <Text size="xs" c="dimmed">{status === "GEWONNEN" ? "✓ gewonnen" : "✗ verloren"}</Text>;
        return (
          <Group gap={4} justify="flex-end" wrap="nowrap">
            <Select size="xs" w={140} value={String(r.stage)} onChange={(v) => v && void act(() => trpc.opportunities.advanceStage.mutate({ id, stage: v as "ANGEBOT" }))} data={OPP_STAGES.map((s) => ({ value: s.value, label: s.label }))} />
            <Button size="compact-xs" color="green" onClick={() => void act(() => trpc.opportunities.markWon.mutate({ id }))}>Gewonnen</Button>
            <Button size="compact-xs" color="red" variant="light" onClick={() => { const g = window.prompt("Verlustgrund?"); if (g) void act(() => trpc.opportunities.markLost.mutate({ id, reason: g })); }}>Verloren</Button>
          </Group>
        );
      }} />
    </>
  );
}

// Büro-Kalender (Terminmanagement): Termine/Urlaub/Abwesenheiten, eigene + geteilte.
const CAL_KINDS = [
  { value: "TERMIN", label: "Termin", color: "blue" },
  { value: "URLAUB", label: "Urlaub", color: "green" },
  { value: "ABWESENHEIT", label: "Abwesenheit", color: "orange" },
  { value: "SONSTIGES", label: "Sonstiges", color: "gray" },
] as const;

export function CalendarPage(): JSX.Element {
  const [items, setItems] = useState<Row[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<string>("TERMIN");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [shared, setShared] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const from = new Date(); from.setDate(from.getDate() - 7);
    const to = new Date(); to.setDate(to.getDate() + 120);
    try { setItems((await trpc.calendar.list.query({ from: from.toISOString(), to: to.toISOString() })) as Row[]); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const fmt = (d: unknown): string => new Date(String(d)).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <Title order={3}>Kalender</Title>
      <Text size="sm" c="dimmed" mt={4}>Büro-Termine, Urlaub und Abwesenheiten. „Geteilt" = für alle sichtbar. Externe Sync (CalDAV/Google) als Add-on vorgesehen.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      <Group gap="xs" align="end" mt="md" wrap="wrap">
        <TextInput label="Titel" value={title} onChange={(e) => setTitle(e.currentTarget.value)} w={200} />
        <Select label="Art" value={kind} onChange={(v) => v && setKind(v)} data={CAL_KINDS.map((k) => ({ value: k.value, label: k.label }))} w={150} />
        <TextInput label="Von" type="datetime-local" value={start} onChange={(e) => setStart(e.currentTarget.value)} w={200} />
        <TextInput label="Bis" type="datetime-local" value={end} onChange={(e) => setEnd(e.currentTarget.value)} w={200} />
        <Switch label="Geteilt" checked={shared} onChange={(e) => setShared(e.currentTarget.checked)} mb={8} />
        <Button disabled={!title.trim() || !start || !end} onClick={async () => {
          setErr(null);
          try {
            await trpc.calendar.create.mutate({ title, kind: kind as "TERMIN", shared, start: new Date(start).toISOString(), end: new Date(end).toISOString(), allDay: false });
            setTitle(""); setStart(""); setEnd(""); setShared(false); await load();
          } catch (e) { setErr(errMsg(e)); }
        }}>Eintragen</Button>
      </Group>

      <Title order={4} mt="xl">Anstehend</Title>
      {items.length === 0 ? <Text size="sm" c="dimmed" mt="xs">Keine Einträge im Zeitraum.</Text> : (
        <Box mt="xs">
          {items.map((e) => {
            const k = CAL_KINDS.find((x) => x.value === String(e.kind));
            return (
              <Group key={String(e.id)} gap="sm" py={6} style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}>
                <Badge color={k?.color ?? "gray"} variant="light" w={120}>{k?.label}</Badge>
                <Text size="sm" fw={600} style={{ flex: 1 }}>{String(e.title)}{e.ownerEmail ? "" : " · geteilt"}</Text>
                <Text size="sm" c="dimmed">{fmt(e.start)} – {fmt(e.end)}</Text>
                <Button size="compact-xs" variant="subtle" color="red" onClick={async () => { try { await trpc.calendar.remove.mutate({ id: String(e.id) }); await load(); } catch (er) { setErr(errMsg(er)); } }}>✕</Button>
              </Group>
            );
          })}
        </Box>
      )}
    </>
  );
}

// Mitarbeiter-Nachrichtenportal: internes Postfach (Eingang/Ausgang).
export function MessagesPage(): JSX.Element {
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [items, setItems] = useState<Row[]>([]);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems((await (tab === "inbox" ? trpc.messages.inbox : trpc.messages.sent).query()) as Row[]); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, [tab]);
  useEffect(() => { void load(); }, [load]);

  const fmt = (d: unknown): string => new Date(String(d)).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

  return (
    <>
      <Title order={3}>Nachrichten</Title>
      <Text size="sm" c="dimmed" mt={4}>Internes Mitarbeiter-Postfach (kein E-Mail-Versand).</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      <Title order={4} mt="md">Neue Nachricht</Title>
      <Group gap="xs" align="end" mt="xs" wrap="wrap">
        <TextInput label="An (E-Mail)" value={to} onChange={(e) => setTo(e.currentTarget.value)} w={220} placeholder="kollege@texma.de" />
        <TextInput label="Betreff" value={subject} onChange={(e) => setSubject(e.currentTarget.value)} w={240} />
      </Group>
      <Textarea label="Text" value={body} onChange={(e) => setBody(e.currentTarget.value)} autosize minRows={3} mt="xs" />
      <Button mt="sm" disabled={!to.trim() || !subject.trim()} onClick={async () => {
        setErr(null);
        try { await trpc.messages.send.mutate({ toEmail: to, subject, body }); setTo(""); setSubject(""); setBody(""); setTab("sent"); }
        catch (e) { setErr(errMsg(e)); }
      }}>Senden</Button>

      <Group mt="xl" gap="xs">
        <Button size="compact-sm" variant={tab === "inbox" ? "filled" : "default"} onClick={() => setTab("inbox")}>Posteingang</Button>
        <Button size="compact-sm" variant={tab === "sent" ? "filled" : "default"} onClick={() => setTab("sent")}>Gesendet</Button>
      </Group>
      <Box mt="sm">
        {items.length === 0 ? <Text size="sm" c="dimmed">Keine Nachrichten.</Text> : items.map((m) => (
          <Box key={String(m.id)} py={8} style={{ borderBottom: "1px solid var(--mantine-color-gray-2)", cursor: tab === "inbox" && !m.read ? "pointer" : "default" }}
            onClick={async () => { if (tab === "inbox" && !m.read) { try { await trpc.messages.markRead.mutate({ id: String(m.id) }); await load(); } catch (e) { setErr(errMsg(e)); } } }}>
            <Group justify="space-between">
              <Text size="sm" fw={m.read ? 400 : 700}>{String(m.subject)} {tab === "inbox" && !m.read ? <Badge size="xs" color="red" ml={4}>neu</Badge> : null}</Text>
              <Text size="xs" c="dimmed">{tab === "inbox" ? `von ${String(m.fromEmail)}` : `an ${String(m.toEmail)}`} · {fmt(m.createdAt)}</Text>
            </Group>
            {m.body ? <Text size="sm" c="dimmed">{String(m.body)}</Text> : null}
          </Box>
        ))}
      </Box>
    </>
  );
}
