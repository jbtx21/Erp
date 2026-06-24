// Generische, datengetriebene Modul-Seiten für das "alles durchklickbar"-Gerüst.
// AutoTable rendert jede Liste robust (Cent→€, Datum, Status-Badge), sodass neue
// Bereiche mit wenig Code anbindbar sind. Interaktive Aktionen (Versand bestätigen,
// Mahnlauf, Reorder→Bestellungen) sind je Seite ergänzt.
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Badge, Box, Button, Checkbox, Group, Loader, Modal, NumberInput, Select, Switch, Table, Tabs, Text, Textarea, TextInput, Title } from "@mantine/core";
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

function downloadText(filename: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadBase64(filename: string, base64: string, type: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type }));
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

export function AutoTable({ rows, hide = [], action, onRowClick, highlightId }: { rows: Row[]; hide?: string[]; action?: (r: Row) => ReactNode; onRowClick?: (r: Row) => void; highlightId?: string }): JSX.Element {
  const hlRef = useRef<HTMLTableRowElement | null>(null);
  // Treffer aus der globalen Suche in den Sichtbereich rollen (Deep-Link).
  useEffect(() => { if (highlightId && hlRef.current) hlRef.current.scrollIntoView({ block: "center", behavior: "smooth" }); }, [highlightId, rows]);
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
        {rows.map((r, i) => {
          const hit = highlightId !== undefined && String(r.id) === highlightId;
          return (
            <Table.Tr key={i} ref={hit ? hlRef : undefined}
              style={{ ...(onRowClick ? { cursor: "pointer" } : {}), ...(hit ? { background: "var(--mantine-color-yellow-1)" } : {}) }}>
              {cols.map((c) => <Table.Td key={c} onClick={onRowClick ? () => onRowClick(r) : undefined}>{fmtCell(c, r[c])}</Table.Td>)}
              {action && <Table.Td>{action(r)}</Table.Td>}
            </Table.Tr>
          );
        })}
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

// Lieferanten-360° (Paket 1): Stammdaten (Adresse/Konditionen) + Ansprechpartner +
// Historie (Bestellungen, Eingangsrechnungen, Einkaufsvolumen). Anzeige + Inline-Edit.
type SupplierDetail = NonNullable<Awaited<ReturnType<typeof trpc.suppliers.overview.query>>>;
function SupplierStammdatenEditor({ s, onSaved }: { s: SupplierDetail["supplier"]; onSaved: () => void }): JSX.Element {
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const init = () => ({
    street: s.street ?? "", zip: s.zip ?? "", city: s.city ?? "", country: s.country ?? "DE",
    iban: s.iban ?? "", bic: s.bic ?? "",
    zahlungszielTage: String(s.zahlungszielTage ?? 14), skontoPercent: s.skontoPercent?.toString() ?? "", skontoDays: s.skontoDays?.toString() ?? "",
    lieferzeitTage: s.lieferzeitTage?.toString() ?? "", notiz: s.notiz ?? "",
  });
  const [f, setF] = useState(init);
  const set = (k: keyof ReturnType<typeof init>) => (v: string): void => setF((x) => ({ ...x, [k]: v }));
  const numOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));

  const save = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      await trpc.suppliers.update.mutate({
        id: s.id, street: f.street.trim() || null, zip: f.zip.trim() || null, city: f.city.trim() || null, country: f.country.trim() || "DE",
        iban: f.iban.trim() || null, bic: f.bic.trim() || null,
        zahlungszielTage: Number(f.zahlungszielTage) || 14, skontoPercent: numOrNull(f.skontoPercent), skontoDays: numOrNull(f.skontoDays),
        lieferzeitTage: numOrNull(f.lieferzeitTage), notiz: f.notiz.trim() || null,
      });
      setEdit(false); onSaved();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  if (!edit) {
    const addr = [s.street, [s.zip, s.city].filter(Boolean).join(" "), s.country].filter(Boolean).join(", ");
    return (
      <Box mt="sm" p="xs" style={{ background: "var(--mantine-color-gray-0)", borderRadius: 6 }}>
        <Group justify="space-between" mb={4}><Text size="xs" fw={700} tt="uppercase" c="dimmed">Stammdaten</Text>
          <Button size="compact-xs" variant="subtle" onClick={() => { setF(init()); setEdit(true); }}>Bearbeiten</Button></Group>
        <Group gap="lg" wrap="wrap">
          <Text size="sm">Adresse: <b>{addr || "—"}</b></Text>
          <Text size="sm">USt-IdNr.: <b>{s.vatId || "—"}</b></Text>
          <Text size="sm">IBAN: <b>{s.iban || "—"}</b></Text>
          <Text size="sm">Zahlungsziel: <b>{s.zahlungszielTage} T</b></Text>
          <Text size="sm">Skonto: <b>{s.skontoPercent != null ? `${s.skontoPercent} % / ${s.skontoDays ?? "?"} T` : "—"}</b></Text>
          <Text size="sm">Lieferzeit: <b>{s.lieferzeitTage != null ? `${s.lieferzeitTage} T` : "—"}</b></Text>
        </Group>
        {s.notiz ? <Text size="sm" mt={4}>Notiz: {s.notiz}</Text> : null}
      </Box>
    );
  }
  return (
    <Box mt="sm" p="xs" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 6 }}>
      {err && <Alert color="red" mb="xs">{err}</Alert>}
      <Group gap="xs" align="end" wrap="wrap">
        <TextInput size="xs" label="Straße" w={200} value={f.street} onChange={(e) => set("street")(e.currentTarget.value)} />
        <TextInput size="xs" label="PLZ" w={80} value={f.zip} onChange={(e) => set("zip")(e.currentTarget.value)} />
        <TextInput size="xs" label="Ort" w={150} value={f.city} onChange={(e) => set("city")(e.currentTarget.value)} />
        <TextInput size="xs" label="Land" w={70} value={f.country} onChange={(e) => set("country")(e.currentTarget.value)} />
      </Group>
      <Group gap="xs" align="end" wrap="wrap" mt={6}>
        <TextInput size="xs" label="IBAN" w={200} value={f.iban} onChange={(e) => set("iban")(e.currentTarget.value)} />
        <TextInput size="xs" label="BIC" w={120} value={f.bic} onChange={(e) => set("bic")(e.currentTarget.value)} />
        <NumberInput size="xs" label="Zahlungsziel (T)" w={120} min={0} max={180} value={Number(f.zahlungszielTage) || 0} onChange={(v) => set("zahlungszielTage")(String(v ?? 0))} />
        <NumberInput size="xs" label="Skonto %" w={90} min={0} max={100} value={f.skontoPercent === "" ? "" : Number(f.skontoPercent)} onChange={(v) => set("skontoPercent")(v === "" ? "" : String(v))} />
        <NumberInput size="xs" label="Skonto-Tage" w={100} min={0} max={180} value={f.skontoDays === "" ? "" : Number(f.skontoDays)} onChange={(v) => set("skontoDays")(v === "" ? "" : String(v))} />
        <NumberInput size="xs" label="Lieferzeit (T)" w={110} min={0} max={365} value={f.lieferzeitTage === "" ? "" : Number(f.lieferzeitTage)} onChange={(v) => set("lieferzeitTage")(v === "" ? "" : String(v))} />
      </Group>
      <TextInput size="xs" label="Notiz" mt={6} w={420} value={f.notiz} onChange={(e) => set("notiz")(e.currentTarget.value)} />
      <Group gap="xs" mt="sm">
        <Button size="compact-xs" loading={busy} onClick={() => void save()}>Speichern</Button>
        <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setEdit(false)}>Abbrechen</Button>
      </Group>
    </Box>
  );
}

function SupplierContactsBox({ supplierId, contacts, onChanged }: { supplierId: string; contacts: SupplierDetail["contacts"]; onChanged: () => void }): JSX.Element {
  const [fn, setFn] = useState(""); const [ln, setLn] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [role, setRole] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const add = async (): Promise<void> => {
    if (!fn.trim() || !ln.trim()) { setErr("Vor- und Nachname sind Pflicht."); return; }
    setErr(null);
    try { await trpc.suppliers.addContact.mutate({ supplierId, firstName: fn.trim(), lastName: ln.trim(), email: email || undefined, phone: phone || undefined, role: role || undefined }); setFn(""); setLn(""); setEmail(""); setPhone(""); setRole(""); onChanged(); }
    catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Box mt="sm">
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={4}>Ansprechpartner ({contacts.length})</Text>
      {err && <Alert color="red" mb="xs">{err}</Alert>}
      {contacts.map((c) => (
        <Group key={c.id} gap="xs" mb={2} wrap="nowrap">
          <Text size="sm">{c.firstName} {c.lastName}{c.role ? ` · ${c.role}` : ""}</Text>
          {c.email ? <Text size="xs" c="dimmed">{c.email}</Text> : null}
          {c.phone ? <Text size="xs" c="dimmed">{c.phone}</Text> : null}
          <Button size="compact-xs" variant="subtle" color="red" onClick={async () => { try { await trpc.suppliers.deleteContact.mutate({ id: c.id }); onChanged(); } catch (e) { setErr(errMsg(e)); } }}>✕</Button>
        </Group>
      ))}
      <Group gap="xs" align="end" mt={6} wrap="wrap">
        <TextInput size="xs" label="Vorname" w={120} value={fn} onChange={(e) => setFn(e.currentTarget.value)} />
        <TextInput size="xs" label="Nachname" w={120} value={ln} onChange={(e) => setLn(e.currentTarget.value)} />
        <TextInput size="xs" label="E-Mail" w={170} value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
        <TextInput size="xs" label="Telefon" w={120} value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />
        <TextInput size="xs" label="Funktion" w={120} value={role} onChange={(e) => setRole(e.currentTarget.value)} />
        <Button size="compact-xs" onClick={() => void add()}>+ Kontakt</Button>
      </Group>
    </Box>
  );
}

function SupplierDetailPanel({ supplierId }: { supplierId: string }): JSX.Element {
  const [ov, setOv] = useState<SupplierDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => { void trpc.suppliers.overview.query({ supplierId }).then(setOv).catch((e) => setErr(errMsg(e))); }, [supplierId]);
  useEffect(() => { reload(); }, [reload]);
  if (err) return <Alert color="red" mt="md">{err}</Alert>;
  if (!ov) return <Text size="sm" c="dimmed" mt="md">lädt…</Text>;
  const d = (x: string | Date): string => new Date(x).toLocaleDateString("de-DE");
  return (
    <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
      <Group justify="space-between">
        <Text fw={600}>{ov.supplier.name}</Text>
        <Group gap="xs">
          <Badge size="xs" variant="light">{ov.supplier.kind}</Badge>
          <Badge size="xs" variant="light" color="gray">{ov.itemCount} Katalog-Artikel</Badge>
          <Badge size="xs" color="blue" variant="light">Einkaufsvolumen {euro(ov.purchaseVolumeCents)}</Badge>
        </Group>
      </Group>
      <SupplierStammdatenEditor s={ov.supplier} onSaved={reload} />
      <SupplierContactsBox supplierId={supplierId} contacts={ov.contacts} onChanged={reload} />
      <Group align="flex-start" gap="lg" mt="sm" wrap="wrap">
        <Box miw={230}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={4}>Bestellungen ({ov.purchaseOrders.length})</Text>
          {ov.purchaseOrders.length === 0 ? <Text size="sm" c="dimmed">—</Text> : ov.purchaseOrders.slice(0, 8).map((p) => <Text key={p.id} size="sm">{p.number} · {p.status}</Text>)}
        </Box>
        <Box miw={230}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={4}>Eingangsrechnungen ({ov.incomingInvoices.length})</Text>
          {ov.incomingInvoices.length === 0 ? <Text size="sm" c="dimmed">—</Text> : ov.incomingInvoices.slice(0, 8).map((i) => <Text key={i.id} size="sm">{i.number} · {euro(i.grossCents)} · {d(i.receivedAt)}</Text>)}
        </Box>
      </Group>
    </Box>
  );
}

export function SuppliersPage({ focusId }: { focusId?: string } = {}): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [vatId, setVatId] = useState("");
  const [iban, setIban] = useState("");
  const [applied, setApplied] = useState("sup-fhb");
  const [sid, setSid] = useState("sup-fhb");
  const [openSupplier, setOpenSupplier] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await trpc.suppliers.listAll.query()) as Row[]); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Deep-Link aus der globalen Suche: Lieferanten-Zeile hervorheben + Detail öffnen.
  useEffect(() => { if (focusId) { setApplied(focusId); setSid(focusId); setOpenSupplier(focusId); } }, [focusId]);

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
      <AutoTable rows={rows} highlightId={focusId} onRowClick={(r) => setOpenSupplier((c) => c === String(r.id) ? null : String(r.id))} action={(r) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Button size="compact-xs" variant={openSupplier === String(r.id) ? "filled" : "subtle"} onClick={() => setOpenSupplier((c) => c === String(r.id) ? null : String(r.id))}>Details</Button>
          <Button size="compact-xs" variant="default" onClick={() => { setSid(String(r.id)); setApplied(String(r.id)); }}>Katalog</Button>
        </Group>
      )} />
      {openSupplier && <SupplierDetailPanel supplierId={openSupplier} />}

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
        <CompanyPicker value={companyId} onChange={setCompanyId} w={200} />
        <Box>
          <Text size="sm" fw={500} mb={2}>Artikel/Variante</Text>
          <ArticlePicker onPick={(e) => setVariantId(e.variantId)} />
          {variantId ? <Text size="xs" c="dimmed" mt={2}>gewählt: {variantId}</Text> : null}
        </Box>
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
          <CompanyPicker value={multiCompany} onChange={setMultiCompany} w={200} />
          <TextInput label="Zweck" value={multiZweck} onChange={(e) => setMultiZweck(e.currentTarget.value)} w={140} />
        </Group>
        {multiLines.map((l, i) => (
          <Group key={i} gap="xs" mt={4} align="end">
            <TextInput label={i === 0 ? "Artikel" : undefined} value={l.description} onChange={(e) => setMultiLines((ls) => ls.map((x, j) => j === i ? { ...x, description: e.currentTarget.value } : x))} w={240} placeholder="Polo blau M" />
            <Box>{i === 0 ? <Text size="sm" fw={500} mb={2}>Lieferant</Text> : null}<SupplierPicker value={l.supplierId} onChange={(id) => setMultiLines((ls) => ls.map((x, j) => j === i ? { ...x, supplierId: id } : x))} w={180} /></Box>
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

export function ProductsPage({ focusId }: { focusId?: string } = {}): JSX.Element {
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
  // Deep-Link aus der globalen Suche: Varianten des gesuchten Artikels direkt öffnen.
  useEffect(() => { if (focusId) void loadVariants(focusId); }, [focusId, loadVariants]);

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
// Eine Position kann auf eine konkrete Variante (variantId) ODER nur auf einen
// Hauptartikel (articleId, Farbe×Größe noch offen) verweisen; isAlternative kennzeichnet
// ein unverbindliches Alternativangebot (wird beim Wandeln in den Auftrag weggelassen).
export interface EditorLine { description: string; qty: number; euro: number; kind: PositionKind; variantId?: string; articleId?: string; isAlternative?: boolean; ekEuro?: number; isBundle?: boolean }

// Artikel-Picker: durchsuchbare Auswahl aus dem Artikelstamm (ERPNext „Link field").
// Bei Auswahl wird eine Position vorbefüllt (Bezeichnung, Standardpreis, Variante).
// Artikel-Picker: durchsuchbarer Katalog (Artikel×Variante) für die Positionserfassung.
// Kein Treffer → „+ anlegen" öffnet ein kompaktes Inline-Formular (SKU + optional
// Farbe/Größe); legt Artikel + Basis-Variante an und wählt sie direkt (ERPNext „Create a new…").
export function ArticlePicker({ onPick }: { onPick: (e: { label: string; unitNetCents: number; variantId: string; isBundle?: boolean }) => void }): JSX.Element {
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof trpc.products.catalog.query>>>([]);
  const [value, setValue] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [sku, setSku] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [farbe, setFarbe] = useState("");
  const [groesse, setGroesse] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(async () => { try { setCatalog(await trpc.products.catalog.query()); } catch { /* ignore */ } }, []);
  useEffect(() => { void reload(); }, [reload]);
  const q = search.trim().toLowerCase();
  // Artikelnummer, -name UND -beschreibung sind eigene Suchfelder — Treffer über alle drei.
  const byId = new Map(catalog.map((c) => [c.variantId, c]));
  const matches = (c: (typeof catalog)[number], needle: string): boolean =>
    c.sku.toLowerCase().includes(needle) || c.articleName.toLowerCase().includes(needle) || c.description.toLowerCase().includes(needle) || c.label.toLowerCase().includes(needle);
  const hasMatch = catalog.some((c) => matches(c, q));
  const reset = (): void => { setCreating(false); setSku(""); setBeschreibung(""); setFarbe(""); setGroesse(""); setErr(null); };
  return (
    <Box>
      <Select size="xs" searchable clearable placeholder="+ Artikel: Nr., Name oder Beschreibung…" w={340} value={value}
        searchValue={search} onSearchChange={setSearch}
        nothingFoundMessage="Kein Treffer — unten anlegen"
        maxDropdownHeight={320}
        data={catalog.map((c) => ({ value: c.variantId, label: c.label }))}
        filter={({ options, search: s }) => {
          const needle = s.trim().toLowerCase();
          if (!needle) return options;
          return (options as { value: string; label: string }[]).filter((o) => {
            const e = byId.get(o.value);
            return e ? matches(e, needle) : o.label.toLowerCase().includes(needle);
          });
        }}
        renderOption={({ option }) => {
          const e = byId.get(option.value);
          if (!e) return <Text size="xs">{option.label}</Text>;
          return (
            <Box>
              <Group gap={6} wrap="nowrap">
                <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>{e.sku}</Badge>
                <Text size="xs" fw={600} truncate>{e.articleName}</Text>
                {e.isBundle && <Badge size="xs" variant="light" color="blue" style={{ flexShrink: 0 }}>Set</Badge>}
              </Group>
              {e.description && <Text size="xs" c="dimmed" truncate>{e.description}</Text>}
            </Box>
          );
        }}
        onChange={(v) => {
          const e = catalog.find((c) => c.variantId === v);
          if (e) onPick({ label: e.label, unitNetCents: e.unitNetCents, variantId: e.variantId, isBundle: e.isBundle });
          setValue(null);
        }} />
      {!creating && search.trim().length >= 2 && !hasMatch && (
        <Button size="compact-xs" variant="light" mt={4} onClick={() => { setCreating(true); setErr(null); }}>
          + „{search.trim()}" als Artikel anlegen
        </Button>
      )}
      {creating && (
        <Box mt={6} p="xs" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 4, maxWidth: 320 }}>
          <Text size="xs" fw={600} mb={4}>Neuer Artikel: „{search.trim()}"</Text>
          <Group gap="xs" align="end" wrap="wrap">
            <TextInput size="xs" label="Artikel-Nr. (SKU)" placeholder="z. B. POLO-001" w={130} value={sku} onChange={(e) => setSku(e.currentTarget.value)} />
            <TextInput size="xs" label="Farbe" placeholder="optional" w={80} value={farbe} onChange={(e) => setFarbe(e.currentTarget.value)} />
            <TextInput size="xs" label="Größe" placeholder="optional" w={70} value={groesse} onChange={(e) => setGroesse(e.currentTarget.value)} />
          </Group>
          <TextInput size="xs" label="Beschreibung" placeholder="optional" mt={4} value={beschreibung} onChange={(e) => setBeschreibung(e.currentTarget.value)} />
          {err && <Text size="xs" c="red" mt={4}>{err}</Text>}
          <Group gap="xs" mt={6}>
            <Button size="compact-xs" onClick={async () => {
              if (!sku.trim()) { setErr("Artikel-Nr. ist Pflicht."); return; }
              const attributes = [
                ...(farbe.trim() ? [{ name: "Farbe", value: farbe.trim() }] : []),
                ...(groesse.trim() ? [{ name: "Größe", value: groesse.trim() }] : []),
              ];
              try {
                const entry = await trpc.products.quickCreate.mutate({ sku: sku.trim(), name: search.trim(), ...(beschreibung.trim() ? { description: beschreibung.trim() } : {}), attributes });
                await reload();
                onPick({ label: entry.label, unitNetCents: entry.unitNetCents, variantId: entry.variantId });
                setValue(null); setSearch(""); reset();
              } catch (e) { setErr(e instanceof Error ? e.message : "Anlegen fehlgeschlagen."); }
            }}>Anlegen & übernehmen</Button>
            <Button size="compact-xs" variant="subtle" color="gray" onClick={reset}>Abbrechen</Button>
          </Group>
        </Box>
      )}
    </Box>
  );
}

// Hauptartikel-Picker: wählt einen Artikel OHNE Festlegung auf Farbe×Größe (für
// Angebote, wenn die genaue Variante noch offen ist). Beim Wandeln in den Auftrag wird
// die Variante dann abgefragt. Aggregiert den Varianten-Katalog auf Artikel-Ebene.
export function HauptartikelPicker({ onPick }: { onPick: (e: { articleId: string; articleName: string; unitNetCents: number }) => void }): JSX.Element {
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof trpc.products.catalog.query>>>([]);
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => { void (async () => { try { setCatalog(await trpc.products.catalog.query()); } catch { /* ignore */ } })(); }, []);
  // Auf Artikel-Ebene aggregieren (erste Variante liefert Richtpreis, SKU, Beschreibung).
  const articles = new Map<string, { articleName: string; unitNetCents: number; sku: string; description: string }>();
  for (const c of catalog) if (!articles.has(c.articleId)) articles.set(c.articleId, { articleName: c.articleName, unitNetCents: c.unitNetCents, sku: c.sku, description: c.description });
  return (
    <Select size="xs" searchable clearable placeholder="+ Hauptartikel: Nr., Name, Beschreibung…" w={320} value={value} maxDropdownHeight={320}
      data={[...articles.entries()].map(([id, a]) => ({ value: id, label: a.articleName }))}
      filter={({ options, search }) => {
        const needle = search.trim().toLowerCase();
        if (!needle) return options;
        return (options as { value: string; label: string }[]).filter((o) => {
          const a = articles.get(o.value);
          return a ? (a.articleName.toLowerCase().includes(needle) || a.sku.toLowerCase().includes(needle) || a.description.toLowerCase().includes(needle)) : o.label.toLowerCase().includes(needle);
        });
      }}
      renderOption={({ option }) => {
        const a = articles.get(option.value);
        if (!a) return <Text size="xs">{option.label}</Text>;
        return (
          <Box>
            <Group gap={6} wrap="nowrap"><Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>{a.sku}</Badge><Text size="xs" fw={600} truncate>{a.articleName}</Text></Group>
            {a.description && <Text size="xs" c="dimmed" truncate>{a.description}</Text>}
          </Box>
        );
      }}
      onChange={(v) => {
        const a = v ? articles.get(v) : null;
        if (v && a) onPick({ articleId: v, articleName: a.articleName, unitNetCents: a.unitNetCents });
        setValue(null);
      }} />
  );
}

// Kunden-Picker: durchsuchbare Auswahl aus dem Kundenstamm (statt Firmen-ID tippen).
// Kein Treffer → „+ anlegen" erstellt den Kunden inline (ERPNext „Create a new…").
export function CompanyPicker({ value, onChange, label = "Kunde", w = 240, allowEmpty = false }: { value: string; onChange: (id: string) => void; label?: string; w?: number; allowEmpty?: boolean }): JSX.Element {
  const [companies, setCompanies] = useState<Awaited<ReturnType<typeof trpc.companies.list.query>>>([]);
  const [search, setSearch] = useState("");
  const reload = useCallback(async () => { try { setCompanies(await trpc.companies.list.query()); } catch { /* ignore */ } }, []);
  useEffect(() => { void reload(); }, [reload]);
  const exact = companies.some((c) => c.name.toLowerCase() === search.trim().toLowerCase());
  return (
    <Box>
      <Select label={label} searchable clearable={allowEmpty} placeholder="Kunde suchen…" w={w}
        value={value || null} onChange={(v) => onChange(v ?? "")} searchValue={search} onSearchChange={setSearch}
        nothingFoundMessage="Kein Treffer — unten anlegen"
        data={companies.map((c) => ({ value: c.id, label: `${c.name}${c.branche ? ` · ${c.branche}` : ""}` }))} />
      {search.trim().length >= 2 && !exact && (
        <Button size="compact-xs" variant="light" mt={4} onClick={async () => {
          try { const r = await trpc.companies.create.mutate({ name: search.trim(), priceGroupKind: "STANDARD" }); await reload(); onChange(r.id); setSearch(""); }
          catch { /* ignore */ }
        }}>+ „{search.trim()}" als Kunde anlegen</Button>
      )}
    </Box>
  );
}

// Lieferanten-Picker: durchsuchbare Auswahl aus dem Lieferantenstamm; kein Treffer → inline anlegen.
export function SupplierPicker({ value, onChange, label, w = 200 }: { value: string; onChange: (id: string) => void; label?: string; w?: number }): JSX.Element {
  const [suppliers, setSuppliers] = useState<Awaited<ReturnType<typeof trpc.suppliers.listAll.query>>>([]);
  const [search, setSearch] = useState("");
  const reload = useCallback(async () => { try { setSuppliers(await trpc.suppliers.listAll.query()); } catch { /* ignore */ } }, []);
  useEffect(() => { void reload(); }, [reload]);
  const exact = suppliers.some((s) => s.name.toLowerCase() === search.trim().toLowerCase());
  return (
    <Box>
      <Select label={label} size={label ? undefined : "xs"} searchable clearable placeholder="Lieferant suchen…" w={w}
        value={value || null} onChange={(v) => onChange(v ?? "")} searchValue={search} onSearchChange={setSearch}
        nothingFoundMessage="Kein Treffer — unten anlegen"
        data={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
      {search.trim().length >= 2 && !exact && (
        <Button size="compact-xs" variant="light" mt={4} onClick={async () => {
          try { const r = await trpc.suppliers.create.mutate({ name: search.trim() }); await reload(); onChange(r.id); setSearch(""); }
          catch { /* ignore */ }
        }}>+ „{search.trim()}" als Lieferant anlegen</Button>
      )}
    </Box>
  );
}

// Deckungsbeitrag je Position (VK − EK) × Menge in Cent; null wenn kein EK bekannt.
const lineDbCents = (l: EditorLine): number | null =>
  l.ekEuro === undefined ? null : Math.round((l.euro - l.ekEuro) * 100) * l.qty;

interface BundleRow { description: string; qty: number; componentVariantId: string | null }

// Set/Bundle-Stückliste einer Variante (Kap. 5.1): zeigt die Komponenten (× Positionsmenge)
// und erlaubt das Bearbeiten der Stückliste (Stammdaten). Komponenten sind Freitext oder
// optional auf eine reale Katalog-Variante verknüpft (Bedarf/EK).
function BundleEditor({ variantId, label, positionQty, onClose, onSaved }: { variantId: string; label: string; positionQty: number; onClose: () => void; onSaved: (isBundle: boolean) => void }): JSX.Element {
  const [rows, setRows] = useState<BundleRow[]>([]);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof trpc.products.catalog.query>>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { void (async () => {
    try {
      const [comps, cat] = await Promise.all([trpc.products.components.query({ variantId }), trpc.products.catalog.query()]);
      setRows(comps.map((c) => ({ description: c.description, qty: c.qty, componentVariantId: c.componentVariantId })));
      setCatalog(cat);
    } catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  })(); }, [variantId]);

  const setRow = (i: number, patch: Partial<BundleRow>): void => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = (): void => setRows((rs) => [...rs, { description: "", qty: 1, componentVariantId: null }]);
  const save = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      const clean = rows.filter((r) => r.description.trim()).map((r) => ({ description: r.description.trim(), qty: r.qty, componentVariantId: r.componentVariantId }));
      await trpc.products.setComponents.mutate({ variantId, components: clean });
      onSaved(clean.length > 0);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal opened onClose={onClose} title={`Stückliste · ${label}`} size="xl">
      {err && <Alert color="red" mb="sm">{err}</Alert>}
      {loading ? <Loader size="sm" /> : (
        <>
          <Text size="sm" c="dimmed" mb="sm">Komponenten je Set-Stück. Mengen werden mit der Positionsmenge ({positionQty}) multipliziert. Optional auf eine Katalog-Variante verknüpfen (Bedarf/EK).</Text>
          {rows.length === 0 && <Text size="sm" c="dimmed">Noch keine Komponenten — unten hinzufügen.</Text>}
          {rows.map((r, i) => (
            <Group key={i} gap="xs" mt={4} align="end" wrap="nowrap">
              <TextInput label={i === 0 ? "Komponente" : undefined} value={r.description} onChange={(e) => setRow(i, { description: e.currentTarget.value })} placeholder="z. B. Polo rot M / Stick Brust links" w={260} />
              <NumberInput label={i === 0 ? "Menge/Set" : undefined} value={r.qty} onChange={(v) => setRow(i, { qty: Number(v) || 1 })} min={1} w={100} />
              <Select label={i === 0 ? "Variante (optional)" : undefined} searchable clearable placeholder="— Freitext —" w={260}
                value={r.componentVariantId} data={catalog.filter((c) => c.variantId !== variantId).map((c) => ({ value: c.variantId, label: c.label }))}
                onChange={(v) => { const e = v ? catalog.find((c) => c.variantId === v) : null; setRow(i, { componentVariantId: v, ...(e && !r.description.trim() ? { description: e.label } : {}) }); }} />
              <Text size="sm" c="dimmed" w={70} ta="right" title="Gesamtmenge">= {r.qty * positionQty}</Text>
              <Button size="compact-sm" variant="subtle" color="red" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>✕</Button>
            </Group>
          ))}
          <Button size="compact-xs" variant="light" mt="sm" onClick={addRow}>+ Komponente</Button>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>Abbrechen</Button>
            <Button color="dark" loading={busy} onClick={() => void save()}>Stückliste speichern</Button>
          </Group>
        </>
      )}
    </Modal>
  );
}

// Read-only-Aufklappung der Stückliste einer Set-Variante auf Beleg-Ebene (× Positionsmenge).
function BundlePreview({ variantId, positionQty }: { variantId: string; positionQty: number }): JSX.Element {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof trpc.products.components.query>>>([]);
  useEffect(() => { void (async () => { try { setRows(await trpc.products.components.query({ variantId })); } catch { /* ignore */ } })(); }, [variantId]);
  if (rows.length === 0) return <Text size="xs" c="dimmed" ml={124} mt={2}>Keine Komponenten hinterlegt.</Text>;
  return (
    <Box ml={124} mt={2} mb={4} pl="xs" style={{ borderLeft: "2px solid var(--mantine-color-gray-3)" }}>
      {rows.map((r, i) => (
        <Text key={i} size="xs" c="dimmed">• {r.qty * positionQty}× {r.description}{r.componentLabel ? ` (${r.componentLabel})` : ""}</Text>
      ))}
    </Box>
  );
}

// Logo/Veredelung als wiederverwendbaren Artikel anlegen (Kap. 5.4/11): Pflicht-Veredler
// (analog Textil-„Hersteller"), eigener EK beim Veredler + eigene Mengenstaffel. Beim
// Siebdruck den festen Siebdruck-Lieferanten wählen. Direkt als Angebotsposition übernommen.
interface TierRow { minMenge: number; euro: number }
function LogoArticleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (e: { label: string; variantId: string; unitNetCents: number }) => void }): JSX.Element {
  const [name, setName] = useState(""); const [sku, setSku] = useState("");
  const [method, setMethod] = useState<"STICK" | "DRUCK" | "TRANSFER">("STICK");
  const [placement, setPlacement] = useState("");
  const [veredlerId, setVeredlerId] = useState("");
  const [ek, setEk] = useState<number | "">("");
  const [tiers, setTiers] = useState<TierRow[]>([{ minMenge: 1, euro: 0 }]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  const setTier = (i: number, patch: Partial<TierRow>): void => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const create = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      const cleanTiers = tiers.filter((t) => t.minMenge > 0).map((t) => ({ minMenge: t.minMenge, vkCents: Math.round(t.euro * 100) }));
      const e = await trpc.products.createVeredelung.mutate({
        name: name.trim(), sku: sku.trim(), method, ...(placement.trim() ? { placement: placement.trim() } : {}),
        veredlerId, ...(ek !== "" ? { ekCents: Math.round(Number(ek) * 100) } : {}), tiers: cleanTiers,
      });
      onCreated({ label: e.label, variantId: e.variantId, unitNetCents: e.unitNetCents });
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal opened onClose={onClose} title="Logo / Veredelung anlegen" size="lg">
      {err && <Alert color="red" mb="sm">{err}</Alert>}
      <Group gap="md" align="end" wrap="wrap">
        <TextInput label="Bezeichnung" placeholder="z. B. Logo TSV Emden" value={name} onChange={(e) => setName(e.currentTarget.value)} w={240} />
        <TextInput label="Artikel-Nr. (SKU)" placeholder="LOGO-…" value={sku} onChange={(e) => setSku(e.currentTarget.value)} w={150} />
        <Select label="Veredelungsart" w={150} value={method} onChange={(v) => v && setMethod(v as typeof method)}
          data={[{ value: "STICK", label: "Stick" }, { value: "DRUCK", label: "Siebdruck" }, { value: "TRANSFER", label: "Transfer" }]} />
        <TextInput label="Position" placeholder="Brust links" value={placement} onChange={(e) => setPlacement(e.currentTarget.value)} w={140} />
      </Group>
      <Group gap="md" align="end" wrap="wrap" mt="sm">
        <SupplierPicker label={method === "DRUCK" ? "Siebdruck-Lieferant (Pflicht)" : "Veredler (Pflicht)"} value={veredlerId} onChange={setVeredlerId} w={240} />
        <NumberInput label="EK beim Veredler (€)" value={ek} onChange={(v) => setEk(typeof v === "number" ? v : "")} min={0} decimalScale={2} w={170} placeholder="je Logo abweichend" />
      </Group>
      <Title order={6} mt="md">Mengenstaffel (VK je Stück)</Title>
      {tiers.map((t, i) => (
        <Group key={i} gap="xs" mt={4} align="end">
          <NumberInput label={i === 0 ? "ab Menge" : undefined} value={t.minMenge} onChange={(v) => setTier(i, { minMenge: Number(v) || 1 })} min={1} w={110} />
          <NumberInput label={i === 0 ? "VK (€)" : undefined} value={t.euro} onChange={(v) => setTier(i, { euro: Number(v) || 0 })} min={0} decimalScale={2} w={120} />
          <Button size="compact-sm" variant="subtle" color="red" disabled={tiers.length === 1} onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))}>✕</Button>
        </Group>
      ))}
      <Button size="compact-xs" variant="light" mt="xs" onClick={() => setTiers((ts) => [...ts, { minMenge: (ts.at(-1)?.minMenge ?? 0) + 10, euro: 0 }])}>+ Staffelstufe</Button>
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>Abbrechen</Button>
        <Button color="dark" loading={busy} disabled={!name.trim() || !sku.trim() || !veredlerId} onClick={() => void create()}>Anlegen &amp; übernehmen</Button>
      </Group>
    </Modal>
  );
}

export function LinesEditor({ lines, onChange, quoteMode = false, companyId }: { lines: EditorLine[]; onChange: (l: EditorLine[]) => void; quoteMode?: boolean; companyId?: string }): JSX.Element {
  const set = (i: number, patch: Partial<EditorLine>): void => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const [bundleFor, setBundleFor] = useState<number | null>(null); // Index der Zeile mit offenem Stücklisten-Editor
  const [shown, setShown] = useState<Record<number, boolean>>({}); // aufgeklappte Stücklisten-Vorschauen
  const [logoOpen, setLogoOpen] = useState(false); // Dialog „Logo/Veredelung anlegen"
  // Erste leere Zeile ersetzen, sonst anhängen; gibt den Zielindex zurück.
  const addLine = (line: EditorLine): number => {
    const idx = lines.findIndex((l) => !l.description.trim());
    onChange(idx >= 0 ? lines.map((l, j) => (j === idx ? line : l)) : [...lines, line]);
    return idx >= 0 ? idx : lines.length;
  };
  // Staffelpreis + Lieferanten-EK (→ Deckungsbeitrag) für eine Variante des Kunden ziehen.
  const resolve = async (variantId: string, qty: number): Promise<{ euro?: number; ekEuro?: number }> => {
    if (!companyId) return {};
    try {
      const r = await trpc.pricing.resolve.query({ companyId, variantId, menge: Math.max(1, qty) });
      return { euro: r.netCents / 100, ...(r.ekCents != null ? { ekEuro: r.ekCents / 100 } : {}) };
    } catch { return {}; }
  };
  const addFromCatalog = (e: { label: string; unitNetCents: number; variantId: string; isBundle?: boolean }): void => {
    const idx = addLine({ description: e.label, qty: 1, euro: e.unitNetCents / 100, kind: "TEXTIL", variantId: e.variantId, isBundle: e.isBundle });
    void resolve(e.variantId, 1).then((p) => { if (p.euro !== undefined || p.ekEuro !== undefined) set(idx, p); });
  };
  const addHauptartikel = (e: { articleId: string; articleName: string; unitNetCents: number }): void =>
    void addLine({ description: e.articleName, qty: 1, euro: e.unitNetCents / 100, kind: "TEXTIL", articleId: e.articleId });
  return (
    <Box>
      <Group gap="xs" mb={6}>
        <ArticlePicker onPick={addFromCatalog} />
        {quoteMode && <HauptartikelPicker onPick={addHauptartikel} />}
        {quoteMode && <Button size="xs" variant="light" color="grape" onClick={() => setLogoOpen(true)}>+ Logo/Veredelung</Button>}
        <Text size="xs" c="dimmed">{quoteMode ? "Variante/Hauptartikel wählen, Logo anlegen oder unten frei erfassen" : "aus dem Artikelstamm wählen oder unten frei erfassen"}</Text>
      </Group>
      {logoOpen && <LogoArticleDialog onClose={() => setLogoOpen(false)} onCreated={(e) => { addLine({ description: e.label, qty: 1, euro: e.unitNetCents / 100, kind: "VEREDELUNG", variantId: e.variantId }); setLogoOpen(false); }} />}
      {lines.map((l, i) => {
        const db = lineDbCents(l);
        const margePct = db !== null && l.euro > 0 ? (l.euro - (l.ekEuro ?? 0)) / l.euro : null;
        return (
        <Group key={i} gap="xs" mt={4} align="end">
          <Select label={i === 0 ? "Art" : undefined} w={120} value={l.kind} onChange={(v) => v && set(i, { kind: v as PositionKind })}
            data={[{ value: "TEXTIL", label: "Textil" }, { value: "VEREDELUNG", label: "Veredelung" }, { value: "SONSTIGE", label: "Sonstiges" }]} />
          <TextInput label={i === 0 ? "Beschreibung" : undefined} value={l.description} onChange={(e) => set(i, { description: e.currentTarget.value })} placeholder="200 Polos bestickt" w={220} />
          <NumberInput label={i === 0 ? "Menge" : undefined} value={l.qty} onChange={(v) => set(i, { qty: Number(v) || 1 })}
            onBlur={() => { if (companyId && l.variantId) void resolve(l.variantId, l.qty).then((p) => { if (p.euro !== undefined || p.ekEuro !== undefined) set(i, p); }); }}
            min={1} w={80} />
          <NumberInput label={i === 0 ? "Einzel (€)" : undefined} value={l.euro} onChange={(v) => set(i, { euro: Number(v) || 0 })} min={0} decimalScale={2} w={100} />
          <NumberInput label={i === 0 ? "EK (€)" : undefined} value={l.ekEuro ?? ""} onChange={(v) => set(i, { ekEuro: v === "" ? undefined : Number(v) })} min={0} decimalScale={2} w={90} placeholder="—" />
          {db !== null && <Badge color={db >= 0 ? "teal" : "red"} variant="light" size="sm" title="Deckungsbeitrag (VK − EK) × Menge">DB {euro(db)}{margePct !== null ? ` · ${(margePct * 100).toFixed(0)}%` : ""}</Badge>}
          {l.isBundle && <Badge color="grape" variant="light" size="sm" title="Set/Bundle — löst sich in eine Stückliste auf">Set</Badge>}
          {quoteMode && l.articleId && !l.variantId && <Badge color="orange" variant="light" size="sm" title="Farbe & Größe werden beim Wandeln in den Auftrag abgefragt">Variante offen</Badge>}
          {l.variantId && <Button size="compact-xs" variant={l.isBundle ? "light" : "subtle"} color="grape" onClick={() => { if (l.isBundle) setShown((s) => ({ ...s, [i]: !s[i] })); else setBundleFor(i); }} title="Stückliste anzeigen/bearbeiten">⊟ Stückliste</Button>}
          {quoteMode && <Switch size="xs" label="Alt." checked={!!l.isAlternative} onChange={(e) => set(i, { isAlternative: e.currentTarget.checked })} title="Alternativposition — wird beim Wandeln in den Auftrag nicht übernommen" />}
          <Button size="compact-sm" variant="subtle" color="red" disabled={lines.length === 1} onClick={() => onChange(lines.filter((_, j) => j !== i))}>✕</Button>
        </Group>
        );
      })}
      {lines.map((l, i) => (l.isBundle && shown[i] && l.variantId ? (
        <Group key={`bp-${i}`} gap="xs">
          <BundlePreview variantId={l.variantId} positionQty={l.qty} />
          <Button size="compact-xs" variant="subtle" color="grape" onClick={() => setBundleFor(i)}>bearbeiten</Button>
        </Group>
      ) : null))}
      <Button size="compact-xs" variant="light" mt="xs" onClick={() => onChange([...lines, { description: "", qty: 1, euro: 0, kind: "VEREDELUNG" }])}>+ Position</Button>
      <LineTotals lines={lines} />
      {bundleFor !== null && lines[bundleFor]?.variantId && (
        <BundleEditor variantId={lines[bundleFor]!.variantId!} label={lines[bundleFor]!.description || "Variante"} positionQty={lines[bundleFor]!.qty}
          onClose={() => setBundleFor(null)}
          onSaved={(isBundle) => { set(bundleFor, { isBundle }); setShown((s) => ({ ...s, [bundleFor]: isBundle })); setBundleFor(null); }} />
      )}
    </Box>
  );
}

// Auto-berechnete Summen (Netto/USt/Brutto + Deckungsbeitrag) aus den Positionen — read-only (ERPNext-Muster).
function LineTotals({ lines }: { lines: EditorLine[] }): JSX.Element {
  // Alternativpositionen zählen nicht zur Angebotssumme (unverbindlich).
  const main = lines.filter((l) => l.description.trim() && !l.isAlternative);
  const netCents = main.reduce((s, l) => s + Math.round(l.qty * l.euro * 100), 0);
  const taxCents = Math.round(netCents * 0.19);
  const dbLines = main.filter((l) => l.ekEuro !== undefined);
  const dbCents = dbLines.reduce((s, l) => s + (lineDbCents(l) ?? 0), 0);
  const dbMargePct = dbLines.length && netCents > 0 ? dbCents / main.reduce((s, l) => s + Math.round(l.qty * l.euro * 100), 0) : null;
  return (
    <Group gap="lg" mt="sm" justify="flex-end">
      {dbLines.length > 0 && <Text size="sm" c={dbCents >= 0 ? "teal" : "red"}>DB: <b>{euro(dbCents)}</b>{dbMargePct !== null ? ` (${(dbMargePct * 100).toFixed(0)} %)` : ""}</Text>}
      <Text size="sm" c="dimmed">Netto: <b>{euro(netCents)}</b></Text>
      <Text size="sm" c="dimmed">USt 19 %: <b>{euro(taxCents)}</b></Text>
      <Text size="sm">Brutto: <b>{euro(netCents + taxCents)}</b></Text>
    </Group>
  );
}
export const toApiLines = (lines: EditorLine[]): { description: string; qty: number; unitNetCents: number; kind: PositionKind; variantId?: string; dbCents?: number }[] =>
  lines.filter((l) => l.description.trim()).map((l) => {
    const dbPerUnit = l.ekEuro === undefined ? undefined : Math.round((l.euro - l.ekEuro) * 100);
    return { description: l.description.trim(), qty: l.qty, unitNetCents: Math.round(l.euro * 100), kind: l.kind, ...(l.variantId ? { variantId: l.variantId } : {}), ...(dbPerUnit !== undefined ? { dbCents: dbPerUnit } : {}) };
  });

// Wie toApiLines, aber inkl. Artikel-/Varianten-Referenz und Alternativ-Kennzeichen (Angebot).
export const toQuoteApiLines = (lines: EditorLine[]): { description: string; qty: number; unitNetCents: number; kind: PositionKind; articleId?: string; variantId?: string; isAlternative?: boolean; dbCents?: number }[] =>
  lines.filter((l) => l.description.trim()).map((l) => {
    const dbPerUnit = l.ekEuro === undefined ? undefined : Math.round((l.euro - l.ekEuro) * 100);
    return {
      description: l.description.trim(), qty: l.qty, unitNetCents: Math.round(l.euro * 100), kind: l.kind,
      ...(l.articleId ? { articleId: l.articleId } : {}), ...(l.variantId ? { variantId: l.variantId } : {}), ...(l.isAlternative ? { isAlternative: true } : {}), ...(dbPerUnit !== undefined ? { dbCents: dbPerUnit } : {}),
    };
  });

// Angebot → Auftrag: fragt für Hauptartikel ohne Variante (needsVariant) die genaue
// Farbe×Größe ab und übergibt die Auflösung an convertQuote. Alternativen werden vom
// Server weggelassen. Ohne offene Varianten wird direkt gewandelt (kein Dialog).
function ConvertQuoteDialog({ quoteId, onDone, onClose }: { quoteId: string; onDone: (orderNo: string) => void; onClose: () => void }): JSX.Element {
  type Plan = Awaited<ReturnType<typeof trpc.sales.conversionPlan.query>>;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof trpc.products.catalog.query>>>([]);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void (async () => {
    try {
      const [p, c] = await Promise.all([trpc.sales.conversionPlan.query({ quoteId }), trpc.products.catalog.query()]);
      setPlan(p); setCatalog(c);
    } catch (e) { setErr(errMsg(e)); }
  })(); }, [quoteId]);

  const open = plan ? plan.lines.filter((l) => l.needsVariant) : [];
  const allResolved = open.every((l) => picks[l.position]);
  const convert = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      const o = await trpc.sales.convertQuote.mutate({ quoteId, resolutions: open.length ? Object.fromEntries(open.map((l) => [String(l.position), picks[l.position] ?? ""])) : undefined });
      onDone(o.number);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal opened onClose={onClose} title="Angebot in Auftrag wandeln" size="lg">
      {err && <Alert color="red" mb="sm">{err}</Alert>}
      {!plan && <Loader size="sm" />}
      {plan && (
        <>
          {plan.lines.some((l) => l.isAlternative) && (
            <Alert color="gray" variant="light" mb="sm">Alternativpositionen werden nicht in den Auftrag übernommen.</Alert>
          )}
          {open.length === 0 && <Text size="sm" mb="sm">Alle Positionen sind eindeutig — der Auftrag kann direkt angelegt werden.</Text>}
          {open.length > 0 && <Text size="sm" mb="sm">Für folgende Hauptartikel bitte Farbe &amp; Größe wählen:</Text>}
          {open.map((l) => {
            const variants = catalog.filter((c) => c.articleId === l.articleId);
            return (
              <Group key={l.position} gap="xs" mb={6} align="end">
                <Text size="sm" w={220} truncate>Pos. {l.position}: {l.articleName ?? l.description}</Text>
                <Select size="xs" searchable placeholder="Variante (Farbe × Größe)…" w={300}
                  value={picks[l.position] ?? null}
                  data={variants.map((v) => ({ value: v.variantId, label: v.label }))}
                  onChange={(v) => setPicks((p) => ({ ...p, [l.position]: v ?? "" }))} />
              </Group>
            );
          })}
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>Abbrechen</Button>
            <Button color="blue" loading={busy} disabled={!allResolved} onClick={() => void convert()}>Auftrag anlegen</Button>
          </Group>
        </>
      )}
    </Modal>
  );
}

export function QuotesPage(): JSX.Element {
  type QuoteListRow = Awaited<ReturnType<typeof trpc.quotes.list.query>>[number];
  const [rows, setRows] = useState<QuoteListRow[]>([]);
  const [view, setView] = useState<"list" | "create">("list");
  const [convertId, setConvertId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Anlage-Formular
  const [companyId, setCompanyId] = useState("");
  const [lines, setLines] = useState<EditorLine[]>([{ description: "", qty: 10, euro: 12.9, kind: "TEXTIL" }]);
  const datum = new Date().toISOString().slice(0, 10);
  const [gueltigBis, setGueltigBis] = useState<string>(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [orderType, setOrderType] = useState("SALES");
  const [quotationTo, setQuotationTo] = useState("CUSTOMER");
  const [terms, setTerms] = useState("");
  const [exempt, setExempt] = useState(false);
  const [busy, setBusy] = useState(false);
  // Quick-Filter + Sortierung (clientseitig)
  const [fId, setFId] = useState(""); const [fAngebotFuer, setFAngebotFuer] = useState(""); const [fKunde, setFKunde] = useState(""); const [fArt, setFArt] = useState(""); const [fStatus, setFStatus] = useState("");
  const [sortBy, setSortBy] = useState("createdAt"); const [sortDesc, setSortDesc] = useState(true);

  const load = useCallback(async () => {
    try { setRows(await trpc.quotes.list.query()); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); await load(); } catch (e) { setErr(errMsg(e)); }
  };
  const printPdf = async (quoteId: string): Promise<void> => {
    setErr(null);
    try { const r = await trpc.print.quote.query({ quoteId }); downloadBase64(r.filename, r.base64, "application/pdf"); }
    catch (e) { setErr(errMsg(e)); }
  };
  const mailPdf = async (quoteId: string): Promise<void> => {
    const to = typeof window !== "undefined" ? window.prompt("Angebot per E-Mail senden an:") : null;
    if (!to) return;
    setErr(null);
    try { const r = await trpc.mail.sendBeleg.mutate({ kind: "QUOTE", id: quoteId, to }); window.alert(`„${r.filename}" an ${to} gesendet.`); }
    catch (e) { setErr(errMsg(e)); }
  };

  const rowActions = (r: QuoteListRow): JSX.Element => {
    const id = r.id; const status = r.status;
    return (
      <Group gap={4} justify="flex-end" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
        <Button size="compact-xs" variant="subtle" onClick={() => void printPdf(id)}>PDF</Button>
        <Button size="compact-xs" variant="subtle" onClick={() => void mailPdf(id)}>Mail</Button>
        {status === "ENTWURF" && <Button size="compact-xs" variant="default" onClick={() => void act(() => trpc.quotes.transition.mutate({ id, to: "VERSENDET" }))}>→ Versendet</Button>}
        {(status === "VERSENDET" || status === "NACHFASSEN") && <Button size="compact-xs" color="green" onClick={() => void act(() => trpc.quotes.transition.mutate({ id, to: "ANGENOMMEN" }))}>Angenommen</Button>}
        {status === "ANGENOMMEN" && <Button size="compact-xs" color="blue" onClick={() => setConvertId(id)}>→ Auftrag</Button>}
        {status !== "ANGENOMMEN" && status !== "ABGELEHNT" && (
          <Button size="compact-xs" color="red" variant="light" onClick={() => {
            const grund = typeof window !== "undefined" ? window.prompt("Ablehnen — Verlustgrund?") : null;
            if (grund) void act(() => trpc.quotes.reject.mutate({ id, verlustgrund: grund }));
          }}>Ablehnen</Button>
        )}
      </Group>
    );
  };

  const saveQuote = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      await trpc.quotes.create.mutate({
        companyId, lines: toQuoteApiLines(lines),
        gueltigBisAm: gueltigBis ? `${gueltigBis}T00:00:00.000Z` : undefined,
        orderType: orderType as "SALES" | "MAINTENANCE" | "SHOPPING_CART",
        quotationTo: quotationTo as "CUSTOMER" | "LEAD",
        terms: terms.trim() || undefined,
      });
      setLines([{ description: "", qty: 10, euro: 12.9, kind: "TEXTIL" }]); setCompanyId(""); setTerms("");
      setView("list"); await load();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  // ── Anlage-Formular (4 Tabs, ERPNext-Stil) ────────────────────────────────
  if (view === "create") {
    return (
      <>
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">Vertrieb / Angebot / <b>Neu Angebot</b> <Badge color="orange" variant="light" ml={6}>Nicht gespeichert</Badge></Text>
          <Group gap="xs">
            <Button variant="default" onClick={() => setView("list")}>Abbrechen</Button>
            <Button color="dark" loading={busy} disabled={!companyId.trim() || toApiLines(lines).length === 0} onClick={() => void saveQuote()}>Speichern</Button>
          </Group>
        </Group>
        {err && <Alert color="red" mt="sm">{err}</Alert>}
        <Tabs defaultValue="details" mt="md" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="details">Details</Tabs.Tab>
            <Tabs.Tab value="adresse">Adresse &amp; Kontakt</Tabs.Tab>
            <Tabs.Tab value="terms">Geschäftsbedingungen</Tabs.Tab>
            <Tabs.Tab value="more">Weitere Informationen</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="details" pt="md">
            <Group gap="md" align="end" wrap="wrap">
              <TextInput label="Nummernkreis" value="AN-.JJJJ.-" readOnly w={160} />
              <TextInput label="Datum" type="date" value={datum} readOnly w={150} />
              <Select label="Bestellart" w={170} data={[{ value: "SALES", label: "Vertrieb" }, { value: "MAINTENANCE", label: "Wartung" }, { value: "SHOPPING_CART", label: "Warenkorb" }]} value={orderType} onChange={(v) => v && setOrderType(v)} />
              <Select label="Angebot für" w={140} data={[{ value: "CUSTOMER", label: "Kunde" }, { value: "LEAD", label: "Lead" }]} value={quotationTo} onChange={(v) => v && setQuotationTo(v)} />
              <TextInput label="Gültig bis" type="date" value={gueltigBis} onChange={(e) => setGueltigBis(e.currentTarget.value)} w={150} />
              <CompanyPicker value={companyId} onChange={setCompanyId} w={240} />
            </Group>
            <Collapsible title="Währung und Preisliste">
              <Text size="sm" c="dimmed">Währung: <b>EUR</b> · Preisfindung über Preisgruppe des Kunden + Mengenstaffeln (B4).</Text>
            </Collapsible>
            <Title order={5} mt="lg">Artikel</Title>
            <LinesEditor lines={lines} onChange={setLines} quoteMode companyId={companyId || undefined} />
            <Title order={5} mt="lg">Steuern und Gebühren</Title>
            <Checkbox mt="xs" label="Kunde ist von der Umsatzsteuer befreit (innergemeinschaftlich / Reverse-Charge)" checked={exempt} onChange={(e) => setExempt(e.currentTarget.checked)} />
            <Text size="xs" c="dimmed" mt={4}>USt-Satz: {exempt ? "0 % (steuerfrei)" : "19 % Standard"} — Steuer- und Summenfelder werden automatisch berechnet (read-only).</Text>
          </Tabs.Panel>

          <Tabs.Panel value="adresse" pt="md">
            {companyId ? <CompanyStammdatenReadonly companyId={companyId} /> : <Text size="sm" c="dimmed">Bitte zuerst im Tab „Details" einen Kunden wählen — Rechnungs-/Lieferadresse stammen aus dem Kundenstamm (Paket 1).</Text>}
          </Tabs.Panel>

          <Tabs.Panel value="terms" pt="md">
            <Title order={5}>Zahlungsbedingungen</Title>
            <Text size="sm" c="dimmed" mt={4}>Standard: Zahlungsziel des Kunden (Kundenstamm). Ratenpläne folgen als nächste Slice.</Text>
            <Title order={5} mt="lg">Allgemeine Geschäftsbedingungen</Title>
            <Textarea label="Details der Geschäftsbedingungen" autosize minRows={4} maxRows={12} mt="xs" value={terms} onChange={(e) => setTerms(e.currentTarget.value)} placeholder="AGB-/Bedingungstext für dieses Angebot…" />
          </Tabs.Panel>

          <Tabs.Panel value="more" pt="md">
            <Collapsible title="Druckeinstellungen"><Text size="sm" c="dimmed">Briefkopf/Druckvorlage stammen aus den Einstellungen (Admin).</Text></Collapsible>
            <Collapsible title="Gründe für Verlust"><Text size="sm" c="dimmed">Verlustgrund wird beim Ablehnen erfasst (Lost Reason).</Text></Collapsible>
            <Collapsible title="Zusätzliche Information"><Text size="sm" c="dimmed">Kampagne/Quelle/Auto-Wiederholung — folgt.</Text></Collapsible>
          </Tabs.Panel>
        </Tabs>
      </>
    );
  }

  // ── Listenansicht (ERPNext-Stil) ──────────────────────────────────────────
  const visible = rows
    .filter((r) => (fId ? r.number.toLowerCase().includes(fId.toLowerCase()) : true))
    .filter((r) => (fAngebotFuer ? QUOTATION_TO_LABEL[r.quotationTo]?.toLowerCase().includes(fAngebotFuer.toLowerCase()) : true))
    .filter((r) => (fKunde ? r.companyName.toLowerCase().includes(fKunde.toLowerCase()) : true))
    .filter((r) => (fArt ? r.orderType === fArt : true))
    .filter((r) => (fStatus ? r.status === fStatus : true))
    .sort((a, b) => {
      const dir = sortDesc ? -1 : 1;
      if (sortBy === "companyName") return dir * a.companyName.localeCompare(b.companyName);
      if (sortBy === "number") return dir * a.number.localeCompare(b.number);
      if (sortBy === "totalNetCents") return dir * (a.totalNetCents - b.totalNetCents);
      return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
  const resetFilters = (): void => { setFId(""); setFAngebotFuer(""); setFKunde(""); setFArt(""); setFStatus(""); };

  return (
    <>
      {convertId && <ConvertQuoteDialog quoteId={convertId} onClose={() => setConvertId(null)} onDone={(no) => { setConvertId(null); window.alert(`Auftrag ${no} angelegt.`); void load(); }} />}
      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">⌂ Vertrieb / <b>Angebot</b></Text>
        <Group gap="xs">
          <Select size="xs" w={190} data={[{ value: "createdAt", label: "Erstellt am" }, { value: "companyName", label: "Kundenname" }, { value: "number", label: "ID" }, { value: "totalNetCents", label: "Gesamtbetrag" }]} value={sortBy} onChange={(v) => v && setSortBy(v)} />
          <Button size="xs" variant="default" onClick={() => setSortDesc((d) => !d)}>{sortDesc ? "↓" : "↑"}</Button>
          <Button size="xs" variant="default" onClick={() => void load()}>Aktualisieren</Button>
          <Button size="xs" color="dark" onClick={() => setView("create")}>+ Angebot hinzufügen</Button>
        </Group>
      </Group>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      {/* Quick-Filter-Leiste */}
      <Group gap="xs" mt="md" wrap="wrap" align="end">
        <TextInput size="xs" label="ID" placeholder="≈ enthält" w={140} value={fId} onChange={(e) => setFId(e.currentTarget.value)} />
        <TextInput size="xs" label="Angebot für" placeholder="Kunde/Lead" w={130} value={fAngebotFuer} onChange={(e) => setFAngebotFuer(e.currentTarget.value)} />
        <TextInput size="xs" label="Kundenname" placeholder="≈ enthält" w={170} value={fKunde} onChange={(e) => setFKunde(e.currentTarget.value)} />
        <Select size="xs" label="Bestellart" placeholder="alle" clearable w={140} data={[{ value: "SALES", label: "Vertrieb" }, { value: "MAINTENANCE", label: "Wartung" }, { value: "SHOPPING_CART", label: "Warenkorb" }]} value={fArt || null} onChange={(v) => setFArt(v ?? "")} />
        <Select size="xs" label="Status" placeholder="alle" clearable w={150} data={Object.keys(QUOTE_STATUS_LABEL).map((k) => ({ value: k, label: QUOTE_STATUS_LABEL[k]! }))} value={fStatus || null} onChange={(v) => setFStatus(v ?? "")} />
        {(fId || fAngebotFuer || fKunde || fArt || fStatus) && <Button size="compact-xs" variant="subtle" color="gray" onClick={resetFilters}>× Filter zurücksetzen</Button>}
      </Group>

      {rows.length === 0 ? (
        <Box ta="center" py={60}>
          <Text fz={48} c="gray.4">🗎</Text>
          <Text c="dimmed" mt="sm">Sie haben noch kein Angebot erstellt</Text>
          <Button mt="md" variant="default" onClick={() => setView("create")}>Erstellen Sie Ihr erstes Angebot</Button>
        </Box>
      ) : (
        <Table mt="md" striped highlightOnHover withTableBorder verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th><Table.Th>Angebot für</Table.Th><Table.Th>Kundenname</Table.Th>
              <Table.Th>Datum</Table.Th><Table.Th>Bestellart</Table.Th><Table.Th>Status</Table.Th>
              <Table.Th ta="right">Gesamtbetrag</Table.Th><Table.Th ta="right">DB</Table.Th><Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visible.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td><Text size="sm" fw={600} c="blue">{r.number}</Text></Table.Td>
                <Table.Td>{QUOTATION_TO_LABEL[r.quotationTo] ?? r.quotationTo}</Table.Td>
                <Table.Td>{r.companyName}</Table.Td>
                <Table.Td>{new Date(r.createdAt).toLocaleDateString("de-DE")}</Table.Td>
                <Table.Td>{ORDER_TYPE_LABEL[r.orderType] ?? r.orderType}</Table.Td>
                <Table.Td><Badge size="sm" variant="light" color={QUOTE_STATUS_COLOR[r.status] ?? "gray"}>{QUOTE_STATUS_LABEL[r.status] ?? r.status}</Badge></Table.Td>
                <Table.Td ta="right">{euro(r.totalNetCents)}</Table.Td>
                <Table.Td ta="right">{r.totalDbCents !== null ? <Text size="sm" c={r.totalDbCents >= 0 ? "teal" : "red"}>{euro(r.totalDbCents)}</Text> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
                <Table.Td>{rowActions(r)}</Table.Td>
              </Table.Tr>
            ))}
            {visible.length === 0 && <Table.Tr><Table.Td colSpan={9}><Text size="sm" c="dimmed">Kein Angebot passt zum Filter.</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
      )}
      <Text size="xs" c="dimmed" mt="xs">{visible.length} von {rows.length} Angebot(en)</Text>
    </>
  );
}

const ORDER_TYPE_LABEL: Record<string, string> = { SALES: "Vertrieb", MAINTENANCE: "Wartung", SHOPPING_CART: "Warenkorb" };
const QUOTATION_TO_LABEL: Record<string, string> = { CUSTOMER: "Kunde", LEAD: "Lead" };
const QUOTE_STATUS_COLOR: Record<string, string> = { ENTWURF: "gray", VERSENDET: "blue", NACHFASSEN: "yellow", ANGENOMMEN: "green", ABGELEHNT: "red" };
const QUOTE_STATUS_LABEL: Record<string, string> = { ENTWURF: "Entwurf", VERSENDET: "Offen", NACHFASSEN: "Nachfassen", ANGENOMMEN: "Beauftragt", ABGELEHNT: "Verloren" };

// Aufklappbarer Abschnitt (ERPNext-Sektionen).
function Collapsible({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Box mt="sm" style={{ borderTop: "1px solid var(--mantine-color-gray-2)" }}>
      <Button variant="subtle" color="gray" size="compact-sm" onClick={() => setOpen((o) => !o)} mt={4}>{open ? "▾" : "▸"} {title}</Button>
      {open && <Box p="xs">{children}</Box>}
    </Box>
  );
}

// Rechnungs-/Lieferadresse des gewählten Kunden (read-only, aus dem Kundenstamm).
function CompanyStammdatenReadonly({ companyId }: { companyId: string }): JSX.Element {
  const [ov, setOv] = useState<Awaited<ReturnType<typeof trpc.companies.overview.query>> | null>(null);
  useEffect(() => { void trpc.companies.overview.query({ companyId }).then(setOv).catch(() => undefined); }, [companyId]);
  if (!ov) return <Text size="sm" c="dimmed">lädt…</Text>;
  const c = ov.company;
  const addr = [c.street, [c.zip, c.city].filter(Boolean).join(" "), c.country].filter(Boolean).join(", ");
  return (
    <Box>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed">Rechnungsadresse</Text>
      <Text size="sm">{c.name}</Text>
      <Text size="sm">{addr || "— keine Rechnungsadresse hinterlegt (im Kundenstamm ergänzen)"}</Text>
      {c.vatId ? <Text size="sm">USt-IdNr.: {c.vatId}</Text> : null}
    </Box>
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

// Aktion je Schritt → konkreter Hinweis (dockt an das jeweilige Modul an). Beim
// Erreichen des Schritts wird zusätzlich eine In-App-Benachrichtigung ausgelöst.
const STEP_ACTION_HINT: Record<string, string> = {
  BESTELLVORSCHLAG: 'Warenbestellvorschlag erzeugen — siehe „Lager & Inventur" bzw. „Nachbestellung" (auftragsübergreifender Bedarf).',
  LAUFZETTEL: 'Laufzettel/Produktionszettel erstellen (Produktions-Reporting / PDF).',
  AB_DRUCKFREIGABE: 'Auftragsbestätigung mit Druckfreigabe an den Kunden senden (E-Mail-Vorlage).',
  QK_BILD: 'Qualitätskontrolle mit Bild dokumentieren — Foto im Anhänge-Panel unten hochladen.',
};

// Ein-Klick-Aktionen je Workflow-Schritt: Laufzettel-PDF erzeugen, Bestellvorschlag,
// AB+Druckfreigabe senden, QK-Bild hochladen — verdrahtet an die jeweiligen Endpunkte.
function StepActionBox({ orderId, action }: { orderId: string; action: string }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<string>): Promise<void> => {
    setBusy(true); setErr(null); setMsg(null);
    try { setMsg(await fn()); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Alert color="blue" mt="xs" title="🔔 Aktion fällig">
      <Text size="sm">{STEP_ACTION_HINT[action] ?? action}</Text>
      <Group gap="xs" mt="xs">
        {action === "LAUFZETTEL" && (
          <Button size="compact-xs" loading={busy} onClick={() => void run(async () => {
            const pdf = await trpc.print.laufzettel.query({ orderId }); downloadBase64Pdf(pdf.filename, pdf.base64); return "Laufzettel-PDF erzeugt.";
          })}>Laufzettel-PDF erzeugen</Button>
        )}
        {action === "BESTELLVORSCHLAG" && (
          <Button size="compact-xs" loading={busy} onClick={() => void run(async () => {
            const d = await trpc.reorder.demandProposals.query(); return `${d.length} Bestellvorschlag/-vorschläge (auftragsübergreifend) — siehe „Lager & Inventur" / „Nachbestellung".`;
          })}>Bestellvorschlag prüfen</Button>
        )}
        {action === "AB_DRUCKFREIGABE" && (
          <Button size="compact-xs" loading={busy} onClick={() => void run(async () => {
            await trpc.workflow.sendAuftragsbestaetigung.mutate({ orderId }); return "Auftragsbestätigung mit Druckfreigabe versendet.";
          })}>AB + Druckfreigabe senden</Button>
        )}
        {action === "QK_BILD" && (
          <Button size="compact-xs" component="label">
            QK-Foto anhängen
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void run(async () => { await trpc.collab.addAttachment.mutate({ entity: "Order", entityId: orderId, fileName: f.name, mimeType: f.type || null, url: `qk://${orderId}/${f.name}` }); return `Foto „${f.name}" als QK-Beleg vermerkt (Datei-Upload = Integrationspunkt).`; }); }} />
          </Button>
        )}
      </Group>
      {msg && <Text size="xs" c="green" mt={4}>{msg}</Text>}
      {err && <Text size="xs" c="red" mt={4}>{err}</Text>}
    </Alert>
  );
}

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
          {status.currentStep?.action && <StepActionBox orderId={orderId} action={status.currentStep.action} />}
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

// Laufzettel / Produktionszettel (T-11): erzeugt das PDF aus einem Produktionsauftrag.
// INTERN = Maschinenparameter, EXTERN = Dienstleister + Termine (Pflichtfelder je Art).
function LaufzettelModal({ productionId, defaultKind = "INTERN", onClose }: { productionId: string; defaultKind?: "INTERN" | "EXTERN"; onClose: () => void }): JSX.Element {
  const [kind, setKind] = useState<"INTERN" | "EXTERN">(defaultKind);
  const [maschine, setMaschine] = useState(""); const [tempC, setTempC] = useState<number | "">(160); const [presszeit, setPresszeit] = useState<number | "">(15);
  const [dienstleister, setDienstleister] = useState(""); const [positionierung, setPositionierung] = useState("");
  const [anliefer, setAnliefer] = useState(""); const [fertig, setFertig] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  const gen = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      const extra = kind === "INTERN"
        ? { maschine: maschine.trim(), temperaturC: typeof tempC === "number" ? tempC : 0, presszeitSek: typeof presszeit === "number" ? presszeit : 0 }
        : { dienstleister: dienstleister.trim(), positionierung: positionierung.trim(), ...(anliefer ? { anlieferDatum: `${anliefer}T00:00:00.000Z` } : {}), ...(fertig ? { fertigstellDatum: `${fertig}T00:00:00.000Z` } : {}) };
      const res = await trpc.productionSheet.render.mutate({ productionId, kind, extra });
      downloadBase64Pdf(res.fileName, res.pdfBase64);
      onClose();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Modal opened onClose={onClose} title="Laufzettel erzeugen" size="lg">
      {err && <Alert color="red" mb="sm">{err}</Alert>}
      <Select label="Art" w={220} value={kind} onChange={(v) => v && setKind(v as "INTERN" | "EXTERN")}
        data={[{ value: "INTERN", label: "Intern (Maschinenparameter)" }, { value: "EXTERN", label: "Extern (Dienstleister)" }]} />
      {kind === "INTERN" ? (
        <Group gap="md" mt="md" align="end" wrap="wrap">
          <TextInput label="Maschine" value={maschine} onChange={(e) => setMaschine(e.currentTarget.value)} placeholder="z. B. Transferpresse 1" w={200} />
          <NumberInput label="Temperatur (°C)" value={tempC} onChange={(v) => setTempC(typeof v === "number" ? v : "")} w={140} />
          <NumberInput label="Presszeit (s)" value={presszeit} onChange={(v) => setPresszeit(typeof v === "number" ? v : "")} w={140} />
        </Group>
      ) : (
        <Group gap="md" mt="md" align="end" wrap="wrap">
          <TextInput label="Dienstleister" value={dienstleister} onChange={(e) => setDienstleister(e.currentTarget.value)} placeholder="Veredler" w={200} />
          <TextInput label="Positionierung" value={positionierung} onChange={(e) => setPositionierung(e.currentTarget.value)} placeholder="z. B. Brust links" w={180} />
          <TextInput label="Anliefertermin" type="date" value={anliefer} onChange={(e) => setAnliefer(e.currentTarget.value)} w={160} />
          <TextInput label="Fertigstellung" type="date" value={fertig} onChange={(e) => setFertig(e.currentTarget.value)} w={160} />
        </Group>
      )}
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>Abbrechen</Button>
        <Button color="dark" loading={busy} onClick={() => void gen()}>PDF erzeugen</Button>
      </Group>
    </Modal>
  );
}

// Produktionsauftrag erzeugen: Veredelungsweg wählen → Werktage-Terminvorschlag
// (Rückwärtsterminierung) → manuelle Prüfung/Bestätigung des Produktionstermins
// (stückzahlabhängig). Erzeugt PA + Fertigungsstückliste.
type LeadProfile = "INHOUSE_OHNE_TRANSFER" | "INHOUSE_MIT_TRANSFER" | "EXTERN_STICK_SIEBDRUCK" | "EXTERN_UND_INTERN";
const LEAD_PROFILE_OPTIONS: { value: LeadProfile; label: string }[] = [
  { value: "INHOUSE_OHNE_TRANSFER", label: "Inhouse-Veredelung (ohne Transferdruck-Zukauf) · 5 WT" },
  { value: "INHOUSE_MIT_TRANSFER", label: "Inhouse-Veredelung (mit Transferdruck-Zukauf) · 7 WT" },
  { value: "EXTERN_STICK_SIEBDRUCK", label: "Externe Veredelung — Stick & Siebdruck (ab Versand) · 10 WT" },
  { value: "EXTERN_UND_INTERN", label: "Externe + interne Veredelung (kombiniert) · 12 WT" },
];
const LEAD_PROFILE_SHORT: Record<string, string> = {
  INHOUSE_OHNE_TRANSFER: "Inhouse (ohne Transferdruck)", INHOUSE_MIT_TRANSFER: "Inhouse (mit Transferdruck)",
  EXTERN_STICK_SIEBDRUCK: "Extern (Stick & Siebdruck)", EXTERN_UND_INTERN: "Extern + intern",
};
const isExternalProfile = (p: string | null | undefined): boolean => p === "EXTERN_STICK_SIEBDRUCK" || p === "EXTERN_UND_INTERN";

function ProductionCreateDialog({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: (msg: string) => void }): JSX.Element {
  const [profile, setProfile] = useState<LeadProfile>("INHOUSE_OHNE_TRANSFER");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof trpc.production.schedulePreview.query>> | null>(null);
  const [dueDate, setDueDate] = useState<string>("");
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { void (async () => {
    try {
      const p = await trpc.production.schedulePreview.query({ orderId, profile });
      setPreview(p);
      if (!edited) setDueDate(p.proposedDueDate ? new Date(p.proposedDueDate).toISOString().slice(0, 10) : "");
    } catch (e) { setErr(errMsg(e)); }
  })(); }, [orderId, profile, edited]);

  const create = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      const r = await trpc.production.createFromOrder.mutate({ orderId, dueDate: dueDate ? `${dueDate}T00:00:00.000Z` : null, profile });
      const term = r.dueDate ? ` · Produktionstermin ${new Date(r.dueDate).toLocaleDateString("de-DE")}` : "";
      const fv = r.subOrderCount > 0 ? ` · ${r.subOrderCount} Fremdvergabe(n) an die Veredler` : "";
      onDone(`Produktionsauftrag ${r.number} erzeugt (${r.bomItemCount} Stücklisten-Positionen)${fv}${term}.`);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const lieferung = preview?.deliveryDate ? new Date(preview.deliveryDate).toLocaleDateString("de-DE") : "—";
  return (
    <Modal opened onClose={onClose} title="Produktionsauftrag erzeugen" size="lg">
      {err && <Alert color="red" mb="sm">{err}</Alert>}
      <Select label="Veredelungsweg" data={LEAD_PROFILE_OPTIONS} value={profile} onChange={(v) => { if (v) { setProfile(v as LeadProfile); setEdited(false); } }} />
      <Group gap="xl" mt="md" align="end">
        <Box>
          <Text size="xs" c="dimmed">Zugesagter Liefertermin</Text>
          <Text size="sm" fw={600}>{lieferung}</Text>
        </Box>
        <Box>
          <Text size="xs" c="dimmed">Durchlaufzeit</Text>
          <Text size="sm" fw={600}>{preview ? `${preview.leadWorkingDays} Werktage${preview.external ? " (ab Versand z. Veredler)" : ""}` : "—"}</Text>
        </Box>
        <TextInput label="Produktionstermin (Vorschlag, anpassbar)" type="date" value={dueDate} onChange={(e) => { setDueDate(e.currentTarget.value); setEdited(true); }} w={200} />
      </Group>
      <Alert color="yellow" variant="light" mt="md">
        Der Termin ist ein Werktage-Vorschlag aus der Rückwärtsterminierung. Die tatsächliche Dauer ist <b>stückzahlabhängig</b> — bitte vor der Bestätigung manuell prüfen.
      </Alert>
      {!preview?.deliveryDate && <Text size="xs" c="dimmed" mt={4}>Hinweis: Kein zugesagter Liefertermin am Auftrag — Termin frei wählbar.</Text>}
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>Abbrechen</Button>
        <Button color="orange" loading={busy} onClick={() => void create()}>Bestätigen &amp; PA erzeugen</Button>
      </Group>
    </Modal>
  );
}

// Nachkalkulation Soll-Ist (T-10): Plan-DB (aus dem Beleg abgeleitet) vs. Ist-DB
// (Material + Lohn). Plan-Lohnminuten sind stückzahlabhängig und manuell überschreibbar.
function NachkalkulationModal({ productionId, onClose }: { productionId: string; onClose: () => void }): JSX.Element {
  const [eurPerHour, setEurPerHour] = useState<number>(45);
  const [planMin, setPlanMin] = useState<number | "">("");
  const [res, setRes] = useState<Awaited<ReturnType<typeof trpc.postcalc.computeForProduction.query>> | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      const rate = Math.round((eurPerHour * 100) / 60); // €/h → Cent/Minute
      setRes(await trpc.postcalc.computeForProduction.query({ productionId, laborRateCentsPerMinute: rate, ...(planMin !== "" ? { planLaborMinutes: Number(planMin) } : {}) }));
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  useEffect(() => { void run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ampelColor: Record<string, string> = { GRUEN: "teal", GELB: "yellow", ROT: "red" };
  const ampelLabel: Record<string, string> = { GRUEN: "im Plan", GELB: "knapp", ROT: "unter Plan" };
  return (
    <Modal opened onClose={onClose} title="Nachkalkulation (Soll-Ist)" size="lg">
      {err && <Alert color="red" mb="sm">{err}</Alert>}
      <Group gap="md" align="end" wrap="wrap">
        <NumberInput label="Stundensatz (€/h)" value={eurPerHour} onChange={(v) => setEurPerHour(Number(v) || 0)} min={0} w={150} />
        <NumberInput label="Plan-Lohnminuten (optional)" value={planMin} onChange={(v) => setPlanMin(typeof v === "number" ? v : "")} min={0} w={210} placeholder="aus Sollzeit abgeleitet" />
        <Button onClick={() => void run()} loading={busy}>Neu berechnen</Button>
      </Group>
      {res && (
        <>
          <Group mt="lg" gap="xl">
            <Box><Text size="xs" c="dimmed">Plan-DB</Text><Text fz={24} fw={700}>{euro(res.plan.dbCents)}</Text><Text size="xs" c="dimmed">Marge {(res.planMarginPct * 100).toFixed(0)} %</Text></Box>
            <Box><Text size="xs" c="dimmed">Ist-DB</Text><Text fz={24} fw={700} c={res.dbVarianceCents < 0 ? "red" : "teal"}>{euro(res.ist.dbCents)}</Text><Text size="xs" c="dimmed">Marge {(res.istMarginPct * 100).toFixed(0)} %</Text></Box>
            <Box><Text size="xs" c="dimmed">Abweichung</Text><Text fz={24} fw={700} c={res.dbVarianceCents < 0 ? "red" : "teal"}>{euro(res.dbVarianceCents)}</Text><Badge color={ampelColor[res.status] ?? "gray"} variant="light">{ampelLabel[res.status] ?? res.status}</Badge></Box>
          </Group>
          <Title order={6} mt="lg">Abweichungszerlegung</Title>
          <Table mt="xs" withTableBorder verticalSpacing="xs" fz="sm" w="auto">
            <Table.Tbody>
              <Table.Tr><Table.Td>Material (Plan − Ist)</Table.Td><Table.Td ta="right" c={res.variance.materialVarianceCents < 0 ? "red" : "teal"}>{euro(res.variance.materialVarianceCents)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Lohn-Menge (Zeit)</Table.Td><Table.Td ta="right" c={res.variance.laborQtyVarianceCents < 0 ? "red" : "teal"}>{euro(res.variance.laborQtyVarianceCents)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Lohn-Satz</Table.Td><Table.Td ta="right" c={res.variance.laborRateVarianceCents < 0 ? "red" : "teal"}>{euro(res.variance.laborRateVarianceCents)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Erlös (Ist − Plan)</Table.Td><Table.Td ta="right" c={res.variance.revenueVarianceCents < 0 ? "red" : "teal"}>{euro(res.variance.revenueVarianceCents)}</Table.Td></Table.Tr>
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt="xs">Plan-Material aus dem hinterlegten Plan-DB des Belegs; Plan-Lohn aus den Veredelungs-Sollzeiten (manuell überschreibbar, stückzahlabhängig).</Text>
        </>
      )}
    </Modal>
  );
}

// Belegkette/Connections (ERPNext-Muster): phasen-gruppierter Belegbaum eines Auftrags
// + „Create"-Folgebeleg-Aktionen (Rechnung erzeugen / Storno per Gutschrift / Produktion).
function ConnectionsPanel({ orderId, role, onChanged }: { orderId: string; role: string; onChanged: () => void }): JSX.Element {
  const [graph, setGraph] = useState<Awaited<ReturnType<typeof trpc.shopOrders.connections.query>> | null>(null);
  const [prod, setProd] = useState<Awaited<ReturnType<typeof trpc.production.status.query>> | null>(null);
  const [laufzettelFor, setLaufzettelFor] = useState<string | null>(null);
  const [nachkalkFor, setNachkalkFor] = useState<string | null>(null);
  const [createProdOpen, setCreateProdOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const canFinance = role === "ADMIN" || role === "BUERO" || role === "BUCHHALTUNG";
  const canProd = role === "ADMIN" || role === "BUERO";

  const load = useCallback(async () => {
    try {
      setGraph(await trpc.shopOrders.connections.query({ orderId }));
      try { setProd(await trpc.production.status.query({ orderId })); } catch { setProd(null); }
      setErr(null);
    }
    catch (e) { setErr(errMsg(e)); }
  }, [orderId]);
  useEffect(() => { void load(); }, [load]);

  const invoiceNode = graph?.groups.flatMap((g) => g.nodes).find((n) => n.entity === "Invoice");
  const phaseColor: Record<string, string> = { Vertrieb: "blue", Fulfillment: "teal", Zahlung: "green", Produktion: "orange", Reklamation: "red" };

  return (
    <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
      {laufzettelFor && <LaufzettelModal productionId={laufzettelFor} defaultKind={isExternalProfile(prod?.finishingProfile) ? "EXTERN" : "INTERN"} onClose={() => setLaufzettelFor(null)} />}
      {nachkalkFor && <NachkalkulationModal productionId={nachkalkFor} onClose={() => setNachkalkFor(null)} />}
      {createProdOpen && <ProductionCreateDialog orderId={orderId} onClose={() => setCreateProdOpen(false)} onDone={(m) => { setCreateProdOpen(false); setMsg(m); setErr(null); void load(); onChanged(); }} />}
      <Group justify="space-between">
        <Text fw={600}>Belegkette {graph ? `· ${graph.anchor.label}` : ""}</Text>
        <Group gap="xs">
          {canProd && prod && !prod.productionId && !prod.freigegeben && (
            <Button size="compact-xs" variant="light" color="orange" onClick={async () => {
              setErr(null); setMsg(null);
              try { await trpc.production.release.mutate({ orderId }); setMsg("Auftrag für die Produktion freigegeben."); await load(); }
              catch (e) { setErr(errMsg(e)); }
            }}>Freigeben</Button>
          )}
          {canProd && prod && !prod.productionId && (
            <Button size="compact-xs" color="orange" disabled={!prod.freigegeben} title={prod.freigegeben ? "" : "Auftrag erst freigeben"} onClick={() => { setErr(null); setMsg(null); setCreateProdOpen(true); }}>Produktionsauftrag erzeugen</Button>
          )}
          {prod?.productionId && (
            <Button size="compact-xs" variant="light" color="orange" onClick={() => setLaufzettelFor(prod.productionId)}>Laufzettel (PDF)</Button>
          )}
          {canFinance && prod?.productionId && (
            <Button size="compact-xs" variant="light" color="grape" onClick={() => setNachkalkFor(prod.productionId)}>Nachkalkulation</Button>
          )}
          {canFinance && (
            <>
              {!invoiceNode && (
                <Button size="compact-xs" onClick={async () => {
                  setErr(null); setMsg(null);
                  try { const r = await trpc.invoices.createFromOrder.mutate({ orderId }); setMsg(`Rechnung ${r.number} erzeugt.`); await load(); onChanged(); }
                  catch (e) { setErr(errMsg(e)); }
                }}>Rechnung erzeugen</Button>
              )}
              {invoiceNode && (role === "ADMIN" || role === "BUCHHALTUNG") && (
                <Button size="compact-xs" variant="light" color="red" onClick={async () => {
                  const reason = window.prompt("Gutschriftsgrund (Storno der Rechnung):");
                  if (!reason) return;
                  setErr(null); setMsg(null);
                  try { const r = await trpc.invoices.cancelByCreditNote.mutate({ invoiceId: invoiceNode.id, reason }); setMsg(`Gutschrift ${r.number} gebucht (Rechnung bleibt WORM).`); await load(); onChanged(); }
                  catch (e) { setErr(errMsg(e)); }
                }}>Storno per Gutschrift</Button>
              )}
            </>
          )}
        </Group>
      </Group>
      {err && <Alert color="red" mt="xs">{err}</Alert>}
      {msg && <Alert color="green" mt="xs">{msg}</Alert>}
      {prod?.productionId && (prod.finishingProfile || prod.dueDate) && (
        <Group gap="xs" mt="xs">
          <Badge color="orange" variant="light" size="sm">Produktion</Badge>
          {prod.finishingProfile && <Text size="sm">Veredelung: <b>{LEAD_PROFILE_SHORT[prod.finishingProfile] ?? prod.finishingProfile}</b></Text>}
          {prod.dueDate && <Text size="sm" c="dimmed">· Produktionstermin {new Date(prod.dueDate).toLocaleDateString("de-DE")}</Text>}
        </Group>
      )}
      {!graph || graph.groups.length === 0 ? (
        <Text size="sm" c="dimmed" mt="xs">Noch keine Folgebelege.</Text>
      ) : (
        <Group align="flex-start" gap="lg" mt="sm" wrap="wrap">
          {graph.groups.map((g) => (
            <Box key={g.phase} miw={180}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={4}>{g.phase} ({g.nodes.length})</Text>
              {g.nodes.map((n) => (
                <Group key={n.id} gap={6} mb={3} wrap="nowrap">
                  <Badge size="xs" color={phaseColor[g.phase] ?? "gray"} variant="light">{n.entity}</Badge>
                  <Text size="sm">{n.label}</Text>
                  {n.status ? <Text size="xs" c="dimmed">· {n.status}</Text> : null}
                </Group>
              ))}
            </Box>
          ))}
        </Group>
      )}
    </Box>
  );
}

export function OrdersPage({ role, focusId }: { role: string; focusId?: string }): JSX.Element {
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
  // Direkter Sprung aus der globalen Suche: das Detail-/Belegketten-Panel des Auftrags öffnen.
  useEffect(() => { if (focusId) setTermOrder(focusId); }, [focusId]);

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
              <CompanyPicker value={newCompany} onChange={setNewCompany} w={240} />
              <LinesEditor lines={newLines} onChange={setNewLines} companyId={newCompany || undefined} />
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
          {termOrder && canAct && (
            <Group mt="md" gap="xs">
              <Button size="xs" variant="default" onClick={async () => {
                setErr(null);
                try { const r = await trpc.print.auftragsbestaetigung.query({ orderId: termOrder }); downloadBase64(r.filename, r.base64, "application/pdf"); }
                catch (e) { setErr(errMsg(e)); }
              }}>Auftragsbestätigung (PDF)</Button>
              <Button size="xs" variant="default" onClick={async () => {
                const to = typeof window !== "undefined" ? window.prompt("Auftragsbestätigung per E-Mail senden an:") : null;
                if (!to) return;
                setErr(null);
                try { const r = await trpc.mail.sendBeleg.mutate({ kind: "AUFTRAGSBESTAETIGUNG", id: termOrder, to }); window.alert(`„${r.filename}" an ${to} gesendet.`); }
                catch (e) { setErr(errMsg(e)); }
              }}>AB per Mail</Button>
            </Group>
          )}
          {termOrder && (
            <Tabs defaultValue="belegkette" mt="md" keepMounted={false}>
              <Tabs.List>
                <Tabs.Tab value="belegkette">Belegkette</Tabs.Tab>
                <Tabs.Tab value="aufgaben">Aufgaben</Tabs.Tab>
                <Tabs.Tab value="workflow">Workflow</Tabs.Tab>
                <Tabs.Tab value="lieferung">Lieferung &amp; Druckdaten</Tabs.Tab>
                <Tabs.Tab value="notizen">Notizen &amp; Dateien</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="belegkette"><ConnectionsPanel orderId={termOrder} role={role} onChanged={() => void load()} /></Tabs.Panel>
              <Tabs.Panel value="aufgaben"><AssignTaskBox entity="Order" entityId={termOrder} navKey="orders" /></Tabs.Panel>
              <Tabs.Panel value="workflow"><WorkflowPanel orderId={termOrder} /></Tabs.Panel>
              <Tabs.Panel value="lieferung"><LinksPanel orderId={termOrder} /><DeliveryPanel orderId={termOrder} onChanged={() => void load()} /></Tabs.Panel>
              <Tabs.Panel value="notizen"><RecordPanel entity="Order" entityId={termOrder} /></Tabs.Panel>
            </Tabs>
          )}
        </>
      )}
    </>
  );
}

// Stammdaten-360° je Kunde (Paket 1): Rechnungsadresse, USt-IdNr./Steuernr.,
// Zahlungs-/Lieferbedingungen, Kreditlimit, Notiz — Anzeige + Inline-Bearbeitung.
type CompanyDetail = NonNullable<Awaited<ReturnType<typeof trpc.companies.overview.query>>>["company"];
interface SDForm {
  street: string; zip: string; city: string; country: string; vatId: string; taxNumber: string;
  skontoPercent: string; skontoDays: string; paymentMethod: string; lieferbedingung: string; kreditEuro: string; notiz: string;
}
function CompanyStammdaten({ company, onSaved }: { company: CompanyDetail; onSaved: () => void }): JSX.Element {
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const init = (): SDForm => ({
    street: company.street ?? "", zip: company.zip ?? "", city: company.city ?? "", country: company.country ?? "DE",
    vatId: company.vatId ?? "", taxNumber: company.taxNumber ?? "",
    skontoPercent: company.skontoPercent?.toString() ?? "", skontoDays: company.skontoDays?.toString() ?? "",
    paymentMethod: company.paymentMethod ?? "", lieferbedingung: company.lieferbedingung ?? "",
    kreditEuro: company.kreditlimitCents != null ? (company.kreditlimitCents / 100).toString() : "", notiz: company.notiz ?? "",
  });
  const [f, setF] = useState<SDForm>(init);
  const set = (k: keyof SDForm) => (v: string): void => setF((s) => ({ ...s, [k]: v }));
  const numOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));

  const save = async (): Promise<void> => {
    setBusy(true); setErr(null);
    try {
      await trpc.companies.update.mutate({
        id: company.id,
        street: f.street.trim() || null, zip: f.zip.trim() || null, city: f.city.trim() || null, country: f.country.trim() || "DE",
        vatId: f.vatId.trim() || null, taxNumber: f.taxNumber.trim() || null,
        skontoPercent: numOrNull(f.skontoPercent), skontoDays: numOrNull(f.skontoDays),
        paymentMethod: (f.paymentMethod || null) as "UEBERWEISUNG" | "LASTSCHRIFT" | "BAR" | null,
        lieferbedingung: f.lieferbedingung.trim() || null,
        kreditlimitCents: f.kreditEuro.trim() === "" ? null : Math.round(Number(f.kreditEuro) * 100),
        notiz: f.notiz.trim() || null,
      });
      setEdit(false); onSaved();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  if (!edit) {
    const addr = [company.street, [company.zip, company.city].filter(Boolean).join(" "), company.country].filter(Boolean).join(", ");
    const skonto = company.skontoPercent != null ? `${company.skontoPercent} % / ${company.skontoDays ?? "?"} T` : "—";
    return (
      <Box mt="sm" p="xs" style={{ background: "var(--mantine-color-gray-0)", borderRadius: 6 }}>
        <Group justify="space-between" mb={4}><Text size="xs" fw={700} tt="uppercase" c="dimmed">Stammdaten</Text>
          <Button size="compact-xs" variant="subtle" onClick={() => { setF(init()); setEdit(true); }}>Bearbeiten</Button></Group>
        <Group gap="lg" wrap="wrap">
          <Text size="sm">Rechnungsadresse: <b>{addr || "—"}</b></Text>
          <Text size="sm">USt-IdNr.: <b>{company.vatId || "—"}</b></Text>
          <Text size="sm">Steuernr.: <b>{company.taxNumber || "—"}</b></Text>
          <Text size="sm">Skonto: <b>{skonto}</b></Text>
          <Text size="sm">Zahlart: <b>{company.paymentMethod || "—"}</b></Text>
          <Text size="sm">Lieferbedingung: <b>{company.lieferbedingung || "—"}</b></Text>
          <Text size="sm">Kreditlimit: <b>{company.kreditlimitCents != null ? euro(company.kreditlimitCents) : "—"}</b></Text>
        </Group>
        {company.notiz ? <Text size="sm" mt={4}>Notiz: {company.notiz}</Text> : null}
      </Box>
    );
  }
  return (
    <Box mt="sm" p="xs" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 6 }}>
      {err && <Alert color="red" mb="xs">{err}</Alert>}
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>Stammdaten bearbeiten</Text>
      <Group gap="xs" align="end" wrap="wrap">
        <TextInput size="xs" label="Straße" w={220} value={f.street} onChange={(e) => set("street")(e.currentTarget.value)} />
        <TextInput size="xs" label="PLZ" w={80} value={f.zip} onChange={(e) => set("zip")(e.currentTarget.value)} />
        <TextInput size="xs" label="Ort" w={160} value={f.city} onChange={(e) => set("city")(e.currentTarget.value)} />
        <TextInput size="xs" label="Land" w={70} value={f.country} onChange={(e) => set("country")(e.currentTarget.value)} />
      </Group>
      <Group gap="xs" align="end" wrap="wrap" mt={6}>
        <TextInput size="xs" label="USt-IdNr." w={160} value={f.vatId} onChange={(e) => set("vatId")(e.currentTarget.value)} />
        <TextInput size="xs" label="Steuernummer" w={150} value={f.taxNumber} onChange={(e) => set("taxNumber")(e.currentTarget.value)} />
        <NumberInput size="xs" label="Skonto %" w={90} min={0} max={100} value={f.skontoPercent === "" ? "" : Number(f.skontoPercent)} onChange={(v) => set("skontoPercent")(v === "" ? "" : String(v))} />
        <NumberInput size="xs" label="Skonto-Tage" w={100} min={0} max={180} value={f.skontoDays === "" ? "" : Number(f.skontoDays)} onChange={(v) => set("skontoDays")(v === "" ? "" : String(v))} />
        <Select size="xs" label="Zahlart" w={150} clearable data={["UEBERWEISUNG", "LASTSCHRIFT", "BAR"]} value={f.paymentMethod || null} onChange={(v) => set("paymentMethod")(v ?? "")} />
      </Group>
      <Group gap="xs" align="end" wrap="wrap" mt={6}>
        <TextInput size="xs" label="Lieferbedingung" w={220} value={f.lieferbedingung} onChange={(e) => set("lieferbedingung")(e.currentTarget.value)} />
        <NumberInput size="xs" label="Kreditlimit (€)" w={140} min={0} value={f.kreditEuro === "" ? "" : Number(f.kreditEuro)} onChange={(v) => set("kreditEuro")(v === "" ? "" : String(v))} />
        <TextInput size="xs" label="Notiz" w={280} value={f.notiz} onChange={(e) => set("notiz")(e.currentTarget.value)} />
      </Group>
      <Group gap="xs" mt="sm">
        <Button size="compact-xs" loading={busy} onClick={() => void save()}>Speichern</Button>
        <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setEdit(false)}>Abbrechen</Button>
      </Group>
    </Box>
  );
}

// Kunden-Detail + Historie (klickbar im Kundenstamm): Stammdaten, offene Summe und
// die verknüpften Belege (Aufträge, Angebote, Rechnungen, Muster-Leihgut).
function CompanyDetailPanel({ companyId, onNavigate }: { companyId: string; onNavigate?: (k: string) => void }): JSX.Element {
  const [ov, setOv] = useState<Awaited<ReturnType<typeof trpc.companies.overview.query>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => { void trpc.companies.overview.query({ companyId }).then(setOv).catch((e) => setErr(errMsg(e))); }, [companyId]);
  useEffect(() => { reload(); }, [reload]);
  if (err) return <Alert color="red" mt="md">{err}</Alert>;
  if (!ov) return <Text size="sm" c="dimmed" mt="md">lädt…</Text>;
  const d = (x: string | Date): string => new Date(x).toLocaleDateString("de-DE");
  const histGroup = (title: string, navKey: string, items: { id: string; label: string; sub?: string }[]): JSX.Element => (
    <Box miw={230}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={4}>{title} ({items.length})</Text>
      {items.length === 0 ? <Text size="sm" c="dimmed">—</Text> : items.slice(0, 8).map((i) => (
        <Group key={i.id} gap={6} mb={2} wrap="nowrap" style={{ cursor: onNavigate ? "pointer" : undefined }} onClick={() => onNavigate?.(navKey)}>
          <Text size="sm">{i.label}</Text>{i.sub ? <Text size="xs" c="dimmed">· {i.sub}</Text> : null}
        </Group>
      ))}
    </Box>
  );
  return (
    <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
      <Group justify="space-between">
        <Text fw={600}>{ov.company.name}</Text>
        <Group gap="xs">
          {ov.company.fromLead ? <Badge size="xs" color="grape" variant="light">aus Lead</Badge> : null}
          <Badge size="xs" variant="light">{ov.company.priceGroupKind}</Badge>
          <Badge size="xs" variant="light" color="gray">Zahlungsziel {ov.company.zahlungszielTage} T</Badge>
          {ov.openCents > 0 ? <Badge size="xs" color="orange">offen {euro(ov.openCents)}</Badge> : <Badge size="xs" color="teal">keine offenen Posten</Badge>}
          {ov.company.mahnsperre ? <Badge size="xs" color="red">Mahnsperre</Badge> : null}
        </Group>
      </Group>
      <Text size="xs" c="dimmed" mt={2}>{ov.company.branche ?? "—"} · {ov.contactsCount} Kontakt(e)</Text>
      <Group gap="md" mt="sm" wrap="wrap">
        <Box style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 6, padding: "6px 12px" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">Umsatz gesamt</Text><Text fz={20} fw={700}>{euro(ov.metrics.revenueGrossCents)}</Text>
        </Box>
        <Box style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 6, padding: "6px 12px" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">Umsatz {new Date().getFullYear()}</Text><Text fz={20} fw={700}>{euro(ov.metrics.revenueYtdGrossCents)}</Text>
        </Box>
        <Box style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 6, padding: "6px 12px" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">Ø Rechnung</Text><Text fz={20} fw={700}>{euro(ov.metrics.avgInvoiceGrossCents)}</Text>
        </Box>
        <Box style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 6, padding: "6px 12px" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">Aufträge / Rechnungen</Text><Text fz={20} fw={700}>{ov.metrics.orderCount} / {ov.metrics.invoiceCount}</Text>
        </Box>
      </Group>
      <CompanyStammdaten company={ov.company} onSaved={reload} />
      <Group align="flex-start" gap="lg" mt="sm" wrap="wrap">
        {histGroup("Aufträge", "orders", ov.orders.map((o) => ({ id: o.id, label: o.number, sub: o.status })))}
        {histGroup("Angebote", "quotes", ov.quotes.map((q) => ({ id: q.id, label: q.number, sub: q.status })))}
        {histGroup("Rechnungen", "dunning", ov.invoices.map((i) => ({ id: i.id, label: i.number, sub: euro(i.grossCents) })))}
        {histGroup("Muster-Leihgut", "samples", ov.sampleLoans.map((s) => ({ id: s.id, label: d(s.ausgegebenAm), sub: s.status })))}
      </Group>
    </Box>
  );
}

// Personen & Verknüpfungen einer Firma (CRM-Dynamic-Link): zeigt Stammkontakte +
// zusätzlich verknüpfte Personen; erlaubt das Verknüpfen einer Person mit einer
// weiteren Firma (Person ↔ mehrere Parteien).
function CompanyContactsPanel({ companyId, companies }: { companyId: string; companies: Array<{ id: string; name: string }> }): JSX.Element {
  const [people, setPeople] = useState<Awaited<ReturnType<typeof trpc.contacts.forEntity.query>>>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setPeople(await trpc.contacts.forEntity.query({ entity: "Company", entityId: companyId })); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
      <Text fw={600}>Personen &amp; Verknüpfungen</Text>
      {err && <Alert color="red" mt="xs">{err}</Alert>}
      {people.length === 0 ? <Text size="sm" c="dimmed" mt="xs">Keine Personen.</Text> : (
        <Table mt="xs"><Table.Tbody>
          {people.map((p) => (
            <Table.Tr key={p.contactId}>
              <Table.Td><Badge size="xs" variant="light" color={p.primary ? "blue" : "grape"}>{p.primary ? "Stamm" : "Verknüpft"}</Badge></Table.Td>
              <Table.Td>{p.name}{p.role ? <Text span size="xs" c="dimmed"> · {p.role}</Text> : null}</Table.Td>
              <Table.Td><Text size="xs" c="dimmed">{p.email ?? p.phone ?? ""}</Text></Table.Td>
              <Table.Td>
                <Select size="xs" placeholder="mit Firma verknüpfen…" w={200} searchable
                  data={companies.filter((c) => c.id !== companyId).map((c) => ({ value: c.id, label: c.name }))}
                  onChange={async (target) => {
                    if (!target) return;
                    setErr(null);
                    try { await trpc.contacts.link.mutate({ contactId: p.contactId, entity: "Company", entityId: target }); await load(); }
                    catch (e) { setErr(errMsg(e)); }
                  }} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody></Table>
      )}
    </Box>
  );
}

export function CompaniesPage({ focusId }: { focusId?: string } = {}): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [branche, setBranche] = useState("");
  const [kind, setKind] = useState("STANDARD");
  const [ziel, setZiel] = useState(14);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openCompany, setOpenCompany] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows((await trpc.companies.list.query()) as Row[]); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Direkter Sprung aus der globalen Suche: Detailpanel des gesuchten Kunden öffnen.
  useEffect(() => { if (focusId) setOpenCompany(focusId); }, [focusId]);

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
      <AutoTable rows={rows} onRowClick={(r) => setOpenCompany((c) => c === String(r.id) ? null : String(r.id))} action={(r) => (
        <Group gap={4} justify="flex-end" wrap="nowrap">
          <Button size="compact-xs" variant={openCompany === String(r.id) ? "filled" : "subtle"} onClick={() => setOpenCompany((c) => c === String(r.id) ? null : String(r.id))}>Details</Button>
          <Button size="compact-xs" variant="light" color={r.mahnsperre ? "teal" : "orange"} onClick={async () => {
            try { await trpc.companies.update.mutate({ id: String(r.id), mahnsperre: !r.mahnsperre }); await load(); }
            catch (e) { setErr(errMsg(e)); }
          }}>{r.mahnsperre ? "Mahnsperre aufheben" : "Mahnsperre setzen"}</Button>
        </Group>
      )} />
      {openCompany && <CompanyDetailPanel companyId={openCompany} />}
      {openCompany && <CompanyContactsPanel companyId={openCompany} companies={rows.map((r) => ({ id: String(r.id), name: String(r.name ?? r.id) }))} />}
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

export function LeadsPage({ focusId }: { focusId?: string } = {}): JSX.Element {
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
      <AutoTable rows={rows} hide={["note", "convertedCompanyId"]} highlightId={focusId} action={actionsFor} />
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
      {orderId && <ComplaintsPanel orderId={orderId} reloadKey={reload} />}
    </>
  );
};

// Reklamationsliste mit Folgevorgang-Auslösung (B11): je Reklamation „→ Gutschrift" bzw.
// „→ Nachproduktion" (aus dem hinterlegten followUp), ruft reklamation.executeFollowUp.
function ComplaintsPanel({ orderId, reloadKey }: { orderId: string; reloadKey: number }): JSX.Element {
  const [items, setItems] = useState<Awaited<ReturnType<typeof trpc.reklamation.listByOrder.query>>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setItems(await trpc.reklamation.listByOrder.query({ orderId })); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, [orderId]);
  useEffect(() => { void load(); }, [load, reloadKey]);

  const followLabel = (f: string): string | null =>
    f === "GUTSCHRIFT" ? "→ Gutschrift erstellen" : (f === "NACHPRODUKTION" || f === "EXPRESS_NACHPRODUKTION") ? "→ Nachproduktion anlegen" : null;

  const run = async (id: string): Promise<void> => {
    setBusy(id); setMsg(null); setErr(null);
    try {
      const r = await trpc.reklamation.executeFollowUp.mutate({ complaintId: id });
      setMsg(r.type === "CREDIT_NOTE" ? `Gutschrift ${r.number} über ${euro(r.amountCents)} erstellt.`
        : r.type === "REPRODUCTION" ? `Nachproduktions-Auftrag ${r.number} angelegt${r.express ? " (Express)" : ""}.`
        : "Kein Folgevorgang hinterlegt.");
      await load();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(null); }
  };

  return (
    <Box mt="lg">
      <Title order={5}>Reklamationen zu {orderId}</Title>
      {msg && <Alert color="green" mt="xs">{msg}</Alert>}
      {err && <Alert color="red" mt="xs">{err}</Alert>}
      <Table mt="xs" striped withTableBorder verticalSpacing="xs" fz="sm">
        <Table.Thead><Table.Tr>
          <Table.Th>Position</Table.Th><Table.Th>Ursache</Table.Th><Table.Th>Kostenträger</Table.Th>
          <Table.Th>Folgevorgang</Table.Th><Table.Th ta="right">Kosten</Table.Th><Table.Th></Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {items.map((c) => {
            const label = followLabel(c.followUp);
            return (
              <Table.Tr key={c.id}>
                <Table.Td><Text size="xs" ff="monospace">{c.orderLineId}</Text></Table.Td>
                <Table.Td>{c.cause}</Table.Td>
                <Table.Td><Badge variant="light">{c.costBearer}</Badge></Table.Td>
                <Table.Td>{c.followUp}</Table.Td>
                <Table.Td ta="right">{euro(c.costCents)}</Table.Td>
                <Table.Td>{label && <Button size="compact-xs" loading={busy === c.id} onClick={() => void run(c.id)}>{label}</Button>}</Table.Td>
              </Table.Tr>
            );
          })}
          {items.length === 0 && <Table.Tr><Table.Td colSpan={6}><Text size="sm" c="dimmed">Keine Reklamationen.</Text></Table.Td></Table.Tr>}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

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

// EAN-Listen-Import (B18): Massenimport Artikelstammdaten mit automatischem Abgleich
// (EAN, sonst SKU). Vorschau zeigt Treffer/Nicht-Treffer; Optionen steuern, was geschrieben
// wird (Anlegen, PIM, EK/Lieferant, VK je Preisgruppe über Aufschlag).
const EAN_PRICE_GROUPS = ["STANDARD", "TOP", "PREMIUM", "WIEDERVERKAEUFER", "AGENTUR"] as const;
const EAN_MATCH_COLOR: Record<string, string> = { EAN: "green", SKU: "blue", NONE: "gray" };
export function EanImportPage(): JSX.Element {
  const [csv, setCsv] = useState("");
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof trpc.eanImport.preview.mutate>> | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof trpc.eanImport.run.mutate>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Optionen
  const [createUnmatched, setCreateUnmatched] = useState(false);
  const [updatePim, setUpdatePim] = useState(true);
  const [updateGtinWeight, setUpdateGtinWeight] = useState(true);
  const [ekSupplier, setEkSupplier] = useState("");
  // VK-Aufschläge je Preisgruppe — Default = HAKRO-Aufschläge (editierbar je Import/Lieferant).
  const [vk, setVk] = useState<Record<string, { on: boolean; factor: number }>>({
    STANDARD: { on: false, factor: 1.80 }, TOP: { on: false, factor: 1.75 }, PREMIUM: { on: false, factor: 1.70 },
    WIEDERVERKAEUFER: { on: false, factor: 1.35 }, AGENTUR: { on: false, factor: 1.40 },
  });

  const buildOptions = () => {
    const groups = EAN_PRICE_GROUPS.filter((k) => vk[k]?.on).map((k) => ({ kind: k, factor: vk[k]!.factor }));
    return {
      createUnmatched, updatePim, updateGtinWeight,
      ...(ekSupplier ? { ek: { supplierId: ekSupplier } } : {}),
      ...(groups.length > 0 ? { vk: { groups } } : {}),
    };
  };

  const doPreview = async (): Promise<void> => {
    setErr(null); setSummary(null); setBusy(true);
    try { setPlan(await trpc.eanImport.preview.mutate({ csv })); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const doRun = async (): Promise<void> => {
    setErr(null); setBusy(true);
    try { setSummary(await trpc.eanImport.run.mutate({ csv, options: buildOptions() })); await doPreview(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const c = plan?.counts;
  return (
    <>
      <Title order={3}>EAN-Listen-Import</Title>
      <Text size="sm" c="dimmed" mt={4}>Massenimport von Artikelstammdaten mit automatischem Abgleich gegen den Bestand — primär per EAN/GTIN (Prüfziffer wird validiert), ersatzweise per Artikelnummer. Erst Vorschau, dann gezielt anwenden. Spalten: <b>EAN</b> (Pflicht), Artikelnummer, Bezeichnung, Marke, Material, Pflegehinweis, Zolltarifnummer, Ursprungsland, Gewicht (g), EK (EUR).</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      <Group gap="sm" mt="md">
        <input type="file" accept=".csv,text/csv" onChange={(e) => {
          const f = e.currentTarget.files?.[0]; if (!f) return;
          const reader = new FileReader();
          reader.onload = () => setCsv(String(reader.result ?? ""));
          reader.readAsText(f);
        }} />
      </Group>
      <Textarea label="…oder CSV einfügen" autosize minRows={4} maxRows={12} mt="xs" value={csv} onChange={(e) => setCsv(e.currentTarget.value)}
        placeholder="EAN;Artikelnummer;Bezeichnung;Marke;EK (EUR)&#10;4006381333931;POLO-001;Poloshirt;TEXMA;4,50" />
      <Button mt="sm" disabled={!csv.trim() || busy} onClick={() => void doPreview()}>Vorschau / Abgleich</Button>

      {c && (
        <>
          <Group mt="md" gap="xs">
            <Badge color="green" variant="light">EAN-Treffer: {c.matchedEan}</Badge>
            <Badge color="blue" variant="light">SKU-Treffer: {c.matchedSku}</Badge>
            <Badge color="gray" variant="light">Nicht-Treffer: {c.unmatched}</Badge>
            <Badge color={c.invalidGtin ? "orange" : "gray"} variant="light">Ungültige EAN: {c.invalidGtin}</Badge>
            <Badge variant="outline">Zeilen gesamt: {c.total}</Badge>
          </Group>

          <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, maxWidth: 720 }}>
            <Text fw={600} mb={6}>Was soll geschrieben werden?</Text>
            <Checkbox label="Stammdaten/PIM aus der Liste aktualisieren" checked={updatePim} onChange={(e) => setUpdatePim(e.currentTarget.checked)} mb={6} />
            <Checkbox label="EAN + Gewicht auf der Variante setzen (ergänzt fehlende EAN)" checked={updateGtinWeight} onChange={(e) => setUpdateGtinWeight(e.currentTarget.checked)} mb={6} />
            <Checkbox label={`Nicht-Treffer als neuen Artikel + Variante anlegen (${c.unmatched})`} checked={createUnmatched} onChange={(e) => setCreateUnmatched(e.currentTarget.checked)} mb={10} />
            <Group align="end" gap="xs" mb={10}>
              <SupplierPicker label="EK + Lieferant aus Liste (optional)" value={ekSupplier} onChange={setEkSupplier} w={260} />
              {ekSupplier && <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setEkSupplier("")}>EK abwählen</Button>}
            </Group>
            <Text fw={600} mt={6} mb={4}>VK-Preise aus EK über Aufschlag generieren</Text>
            <Text size="xs" c="dimmed" mb={6}>Gewählte Preisgruppen werden bei Bedarf angelegt. VK = EK × Aufschlag.</Text>
            {EAN_PRICE_GROUPS.map((k) => (
              <Group key={k} gap="xs" mb={4}>
                <Checkbox label={k} checked={vk[k]?.on ?? false} w={200}
                  onChange={(e) => setVk((s) => ({ ...s, [k]: { on: e.currentTarget.checked, factor: s[k]?.factor ?? 1.88 } }))} />
                <NumberInput size="xs" w={120} step={0.01} min={0.1} decimalScale={2} disabled={!vk[k]?.on}
                  value={vk[k]?.factor ?? 1.88} onChange={(v) => setVk((s) => ({ ...s, [k]: { on: s[k]?.on ?? false, factor: Number(v) || 1 } }))} />
                <Text size="xs" c="dimmed">× Aufschlag</Text>
              </Group>
            ))}
            <Button mt="md" color="navy" disabled={busy} onClick={() => void doRun()}>Importieren / Anwenden</Button>
          </Box>

          {summary && (
            <Alert color={summary.errors.length > 0 ? "yellow" : "green"} mt="md" title="Import-Ergebnis">
              <Text size="sm">Aktualisiert: {summary.matchedUpdated} · Neu angelegt: {summary.created} · Übersprungen: {summary.skipped} · PIM: {summary.pimUpdated} · EK: {summary.ekUpdated} · VK-Preise: {summary.pricesWritten} · Fehler: {summary.errors.length}</Text>
              {summary.errors.slice(0, 10).map((e, i) => <Text key={i} size="xs" c="dimmed">Zeile {e.row}: {e.message}</Text>)}
            </Alert>
          )}

          <Title order={5} mt="lg">Abgleich-Vorschau ({plan.rows.length})</Title>
          <Table mt="xs" striped withTableBorder>
            <Table.Thead><Table.Tr>
              <Table.Th>EAN</Table.Th><Table.Th>Artikelnr.</Table.Th><Table.Th>Bezeichnung</Table.Th>
              <Table.Th>Abgleich</Table.Th><Table.Th>Treffer</Table.Th><Table.Th ta="right">EK</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {plan.rows.slice(0, 200).map((r) => (
                <Table.Tr key={r.line}>
                  <Table.Td><Text size="xs" ff="monospace" c={r.gtinValid ? undefined : "orange"}>{r.gtin}{r.gtinValid ? "" : " ⚠"}</Text></Table.Td>
                  <Table.Td>{r.sku}</Table.Td>
                  <Table.Td>{r.fields.name}</Table.Td>
                  <Table.Td><Badge size="xs" variant="light" color={EAN_MATCH_COLOR[r.match]}>{r.match === "NONE" ? "neu" : r.match}</Badge></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{r.matchLabel ?? "—"}</Text></Table.Td>
                  <Table.Td ta="right">{r.fields.ekCents != null ? `${(r.fields.ekCents / 100).toFixed(2)} €` : "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </>
  );
}

// Finanz-Reporting (B19, Kap. 29): OP-Aging (Fälligkeits-Buckets) + DSO über die offenen
// Posten. Reine Auswertung (G1, keine Buchung). Nur Büro/Buchhaltung/Admin.
export function FinanceReportingPage(): JSX.Element {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(yearStart);
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<Awaited<ReturnType<typeof trpc.financeReport.agingWithDso.query>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      setData(await trpc.financeReport.agingWithDso.query({ from: `${from}T00:00:00.000Z`, asOf: `${asOf}T23:59:59.999Z` }));
    } catch (e) { setErr(errMsg(e)); }
  }, [from, asOf]);
  useEffect(() => { void load(); }, [load]);

  const buckets: Array<{ label: string; key: keyof NonNullable<typeof data>; color: string }> = [
    { label: "Nicht fällig", key: "notDue", color: "var(--mantine-color-teal-6)" },
    { label: "0–30 T überfällig", key: "d0_30", color: "var(--mantine-color-yellow-6)" },
    { label: "31–60 T", key: "d31_60", color: "var(--mantine-color-orange-6)" },
    { label: "61–90 T", key: "d61_90", color: "var(--mantine-color-red-6)" },
    { label: "> 90 T", key: "d90plus", color: "var(--mantine-color-red-9)" },
  ];
  const total = data?.total ?? 0;
  const overdue = data ? data.d0_30 + data.d31_60 + data.d61_90 + data.d90plus : 0;

  const exportCsv = (): void => {
    if (!data) return;
    const lines = ["Bucket;Betrag (EUR)", ...buckets.map((b) => `${b.label};${(Number(data[b.key]) / 100).toFixed(2)}`), `Gesamt;${(total / 100).toFixed(2)}`];
    downloadText(`op-aging-${asOf}.csv`, "﻿" + lines.join("\n"), "text/csv");
  };

  const card = (label: string, value: string, hint?: string, color?: string): JSX.Element => (
    <Box style={{ flex: "1 1 200px", minWidth: 180, border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, padding: 16 }}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed">{label}</Text>
      <Text fz={28} fw={700} mt={4} c={color}>{value}</Text>
      {hint && <Text size="xs" c="dimmed" mt={2}>{hint}</Text>}
    </Box>
  );

  return (
    <>
      <Title order={3}>Finanz-Reporting — Offene Posten</Title>
      <Text size="sm" c="dimmed" mt={4}>OP-Aging (Fälligkeits-Buckets) und DSO (durchschnittliche Forderungslaufzeit) über die offenen Rechnungen. Auswertung, keine Buchung (G1). DSO bezieht den Umsatz im gewählten Zeitraum ein.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      <Group align="end" gap="sm" mt="md">
        <TextInput label="Umsatz-Zeitraum ab (für DSO)" type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
        <TextInput label="Stichtag" type="date" value={asOf} onChange={(e) => setAsOf(e.currentTarget.value)} />
        <Button variant="default" onClick={() => void load()}>Aktualisieren</Button>
        <Button variant="light" disabled={!data} onClick={exportCsv}>CSV</Button>
      </Group>

      {data && (
        <>
          <Group mt="md" gap="md" wrap="wrap">
            {card("Gesamt offen", euro(total))}
            {card("Davon überfällig", euro(overdue), total > 0 ? `${Math.round((overdue / total) * 100)} % der offenen Posten` : undefined, overdue > 0 ? "red.7" : undefined)}
            {card("DSO", `${Math.round(data.dsoDays)} Tage`, "Ø Forderungslaufzeit")}
          </Group>

          <Box mt="lg" style={{ maxWidth: 560 }}>
            {buckets.map((b) => {
              const v = Number(data[b.key]);
              const pct = total > 0 ? (v / total) * 100 : 0;
              return (
                <Group key={b.key} gap="sm" mb={6} wrap="nowrap">
                  <Text size="sm" w={130} style={{ flexShrink: 0 }}>{b.label}</Text>
                  <Box style={{ flex: 1, background: "var(--mantine-color-gray-1)", borderRadius: 4, height: 22, position: "relative" }}>
                    <Box style={{ width: `${pct}%`, background: b.color, height: "100%", borderRadius: 4, minWidth: v > 0 ? 2 : 0 }} />
                  </Box>
                  <Text size="sm" w={110} ta="right" style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{euro(v)}</Text>
                </Group>
              );
            })}
          </Box>
        </>
      )}
    </>
  );
}

// Wareneingang gegen Bestellung (Kap. 6.3 / T-05): offene Bestellungen, Mengen je Position
// buchen, Status BESTELLT → teilweise → vollständig; plus Produktionsstart-Gate (T-05).
function WareneingangPo({ po, onBooked, onErr }: {
  po: Awaited<ReturnType<typeof trpc.goodsReceipts.listOpen.query>>[number];
  onBooked: (msg: string) => void; onErr: (msg: string) => void;
}): JSX.Element {
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(po.lines.map((l) => [l.variantId, Math.max(0, l.orderedQty - l.receivedQty)])));
  const [busy, setBusy] = useState(false);
  const statusColor = po.status === "TEILWEISE_ERHALTEN" ? "yellow" : po.status === "ERHALTEN" ? "teal" : "blue";

  const book = async (): Promise<void> => {
    const lines = po.lines.map((l) => ({ variantId: l.variantId, receivedQty: qty[l.variantId] ?? 0 })).filter((l) => l.receivedQty > 0);
    if (lines.length === 0) { onErr("Keine Eingangsmenge erfasst."); return; }
    setBusy(true);
    try {
      const r = await trpc.goodsReceipts.record.mutate({ purchaseOrderId: po.id, lines });
      onBooked(`Wareneingang gebucht — ${po.number}: Status ${r.status}.`);
    } catch (e) { onErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
      <Group justify="space-between">
        <Text fw={600}>{po.number} · {po.supplierName}{po.productionId ? ` · PA ${po.productionId}` : ""}</Text>
        <Badge variant="light" color={statusColor}>{po.status}</Badge>
      </Group>
      <Table mt="xs" withTableBorder verticalSpacing="xs" fz="sm">
        <Table.Thead><Table.Tr>
          <Table.Th>Artikel</Table.Th><Table.Th ta="right">Bestellt</Table.Th><Table.Th ta="right">Erhalten</Table.Th>
          <Table.Th ta="right">Offen</Table.Th><Table.Th>Jetzt erhalten</Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {po.lines.map((l) => {
            const open = Math.max(0, l.orderedQty - l.receivedQty);
            return (
              <Table.Tr key={l.variantId}>
                <Table.Td>{l.label}</Table.Td>
                <Table.Td ta="right">{l.orderedQty}</Table.Td>
                <Table.Td ta="right">{l.receivedQty}</Table.Td>
                <Table.Td ta="right" c={open > 0 ? "orange" : "dimmed"}>{open}</Table.Td>
                <Table.Td>
                  <NumberInput size="xs" w={100} min={0} value={qty[l.variantId] ?? 0}
                    onChange={(v) => setQty((s) => ({ ...s, [l.variantId]: Number(v) || 0 }))} />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Button mt="sm" size="xs" loading={busy} onClick={() => void book()}>Wareneingang buchen</Button>
    </Box>
  );
}

function ProductionStartGate(): JSX.Element {
  const [pid, setPid] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof trpc.procurement.productionStartStatus.query>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const check = async (): Promise<void> => {
    setErr(null);
    try { setData(await trpc.procurement.productionStartStatus.query({ productionId: pid.trim() })); }
    catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Box mt="xl">
      <Title order={4}>Produktionsstart-Gate (T-05)</Title>
      <Text size="sm" c="dimmed" mt={4}>Prüft, ob alle benötigten Komponenten eines Produktionsauftrags vollständig im Wareneingang gebucht sind (Multi-Lieferant-Gate, Kap. 5.6).</Text>
      <Group align="end" gap="xs" mt="xs">
        <TextInput label="Produktionsauftrags-ID" value={pid} onChange={(e) => setPid(e.currentTarget.value)} w={240} placeholder="pa-1" />
        <Button variant="default" disabled={!pid.trim()} onClick={() => void check()}>Prüfen</Button>
      </Group>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      {data && (
        <>
          <Alert color={data.canStart ? "green" : "orange"} mt="sm">
            {data.canStart ? "Produktionsstart frei — alle Komponenten vollständig im Wareneingang." : "Noch nicht startklar — Komponenten unvollständig."}
          </Alert>
          <Table mt="xs" withTableBorder verticalSpacing="xs" fz="sm" w="auto">
            <Table.Thead><Table.Tr>
              <Table.Th>Variante</Table.Th><Table.Th ta="right">Benötigt</Table.Th><Table.Th ta="right">Erhalten</Table.Th><Table.Th>Vollständig</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {data.components.map((c) => (
                <Table.Tr key={`${c.variantId}-${c.supplierId}`}>
                  <Table.Td><Text size="xs" ff="monospace">{c.variantId}</Text></Table.Td>
                  <Table.Td ta="right">{c.requiredQty}</Table.Td>
                  <Table.Td ta="right">{c.receivedQty}</Table.Td>
                  <Table.Td>{c.complete ? "✓" : <Text span c="orange">offen</Text>}</Table.Td>
                </Table.Tr>
              ))}
              {data.components.length === 0 && <Table.Tr><Table.Td colSpan={4}><Text size="sm" c="dimmed">Keine Komponenten für diesen Produktionsauftrag.</Text></Table.Td></Table.Tr>}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Box>
  );
}

export function WareneingangPage(): JSX.Element {
  const [pos, setPos] = useState<Awaited<ReturnType<typeof trpc.goodsReceipts.listOpen.query>>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setPos(await trpc.goodsReceipts.listOpen.query()); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Title order={3}>Wareneingang</Title>
      <Text size="sm" c="dimmed" mt={4}>Eingegangene Mengen je Bestellposition buchen (Kap. 6.3). Der Bestellstatus läuft BESTELLT → teilweise → vollständig; erst bei vollständigem Eingang aller benötigten Komponenten ist der Produktionsstart frei (T-05).</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      {msg && <Alert color="green" mt="sm">{msg}</Alert>}
      {pos.length === 0 && <Text c="dimmed" mt="md">Keine offenen Bestellungen.</Text>}
      {pos.map((po) => <WareneingangPo key={po.id} po={po} onBooked={(m) => { setMsg(m); setErr(null); void load(); }} onErr={(m) => { setErr(m); setMsg(null); }} />)}
      <ProductionStartGate />
    </>
  );
}

// Manuelle Zahlungserfassung (Kap. 9.4): offene Posten + Zahlungseingang von Hand buchen
// (Teil-/Voll-/Überzahlung), ergänzend zum automatischen CAMT-Bankabgleich (T-13).
function ZahlungZeile({ oi, onBooked, onErr }: {
  oi: Awaited<ReturnType<typeof trpc.payments.listOpen.query>>[number];
  onBooked: (msg: string) => void; onErr: (msg: string) => void;
}): JSX.Element {
  const [euroVal, setEuroVal] = useState<number>(oi.openCents / 100);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const overdue = new Date(oi.dueDate).getTime() < Date.now();

  const book = async (): Promise<void> => {
    const amountCents = Math.round(euroVal * 100);
    if (amountCents <= 0) { onErr("Betrag muss größer 0 sein."); return; }
    setBusy(true);
    try {
      const r = await trpc.payments.record.mutate({ openItemId: oi.id, amountCents, reference: reference || undefined });
      onBooked(r.fullyPaid ? `${oi.invoiceNumber} vollständig bezahlt.` : `${oi.invoiceNumber}: Teilzahlung gebucht, offen ${euro(r.newOpenCents)}.`);
    } catch (e) { onErr(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <Table.Tr>
      <Table.Td>{oi.invoiceNumber}</Table.Td>
      <Table.Td>{oi.companyName}</Table.Td>
      <Table.Td ta="right">{euro(oi.grossCents)}</Table.Td>
      <Table.Td ta="right" fw={600}>{euro(oi.openCents)}</Table.Td>
      <Table.Td c={overdue ? "red" : undefined}>{new Date(oi.dueDate).toLocaleDateString("de-DE")}{oi.dunningLevel > 0 ? ` · M${oi.dunningLevel}` : ""}</Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap" justify="flex-end">
          <NumberInput size="xs" w={110} min={0} step={0.01} decimalScale={2} value={euroVal} onChange={(v) => setEuroVal(Number(v) || 0)} />
          <TextInput size="xs" w={130} placeholder="Verwendungszweck" value={reference} onChange={(e) => setReference(e.currentTarget.value)} />
          <Button size="compact-xs" loading={busy} onClick={() => void book()}>Buchen</Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

export function ZahlungenPage(): JSX.Element {
  const [items, setItems] = useState<Awaited<ReturnType<typeof trpc.payments.listOpen.query>>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setItems(await trpc.payments.listOpen.query()); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const totalOpen = items.reduce((s, i) => s + i.openCents, 0);
  return (
    <>
      <Title order={3}>Zahlungseingänge erfassen</Title>
      <Text size="sm" c="dimmed" mt={4}>Offene Posten und manuelle Zahlungsbuchung (Kap. 9.4) — für Barzahlung oder Zahlungen, die der automatische Bankabgleich (T-13) nicht zuordnet. Teil-, Voll- und Überzahlung möglich; bei 0 € gilt die Rechnung als bezahlt.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      {msg && <Alert color="green" mt="sm">{msg}</Alert>}
      <Text size="sm" mt="md">Offene Posten: <b>{items.length}</b> · Summe offen: <b>{euro(totalOpen)}</b></Text>
      <Table mt="xs" striped withTableBorder verticalSpacing="xs" fz="sm">
        <Table.Thead><Table.Tr>
          <Table.Th>Rechnung</Table.Th><Table.Th>Kunde</Table.Th><Table.Th ta="right">Brutto</Table.Th>
          <Table.Th ta="right">Offen</Table.Th><Table.Th>Fällig</Table.Th><Table.Th ta="right">Zahlung erfassen</Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {items.map((oi) => <ZahlungZeile key={oi.id} oi={oi} onBooked={(m) => { setMsg(m); setErr(null); void load(); }} onErr={(m) => { setErr(m); setMsg(null); }} />)}
          {items.length === 0 && <Table.Tr><Table.Td colSpan={6}><Text size="sm" c="dimmed">Keine offenen Posten.</Text></Table.Td></Table.Tr>}
        </Table.Tbody>
      </Table>
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

// Admin-Portal: zentrale Einstellungen (Briefkopf, Freigabeschwellen, Aufschlag).
export function AdminPage(): JSX.Element {
  const [briefkopf, setBriefkopf] = useState("");
  const [maxDiscount, setMaxDiscount] = useState<number | "">("");
  const [maxOrderValue, setMaxOrderValue] = useState<number | "">("");
  const [markup, setMarkup] = useState<number>(1.88);
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await trpc.settings.get.query();
      setBriefkopf(s.briefkopf.join("\n"));
      setMaxDiscount(s.maxDiscountPct ?? "");
      setMaxOrderValue(s.maxOrderValueEuro ?? "");
      setMarkup(s.markupFactor);
      setErr(null);
    } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Title order={3}>Einstellungen (Admin)</Title>
      <Text size="sm" c="dimmed" mt={4}>Nur Geschäftsleitung. Briefkopf erscheint auf Lieferschein/Rechnung-PDFs; Freigabeschwellen steuern das Freigabe-Gate; Aufschlagsfaktor (Kap. 4.4).</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      {msg && <Alert color="green" mt="sm">{msg}</Alert>}

      <Textarea label="Briefkopf (eine Zeile je Adresszeile)" value={briefkopf} onChange={(e) => setBriefkopf(e.currentTarget.value)} autosize minRows={3} mt="md" w={460}
        placeholder={"TEXMA Textilveredelung GmbH\nMusterstraße 1 · 00000 Musterstadt\ninfo@texma-gmbh.de"} />

      <Group gap="md" align="end" mt="md" wrap="wrap">
        <NumberInput label="Max. Rabatt ohne Freigabe (%)" value={maxDiscount} onChange={(v) => setMaxDiscount(v === "" ? "" : Number(v))} min={0} max={100} w={220} />
        <NumberInput label="Max. Auftragswert ohne Freigabe (€)" value={maxOrderValue} onChange={(v) => setMaxOrderValue(v === "" ? "" : Number(v))} min={0} w={260} />
        <NumberInput label="Aufschlagsfaktor" value={markup} onChange={(v) => setMarkup(Number(v) || 1.88)} min={0.01} step={0.01} decimalScale={2} w={160} />
      </Group>

      <Button mt="lg" onClick={async () => {
        setErr(null); setMsg(null);
        try {
          await trpc.settings.update.mutate({
            briefkopf: briefkopf.split("\n").map((l) => l.trim()).filter(Boolean),
            maxDiscountPct: maxDiscount === "" ? null : maxDiscount,
            maxOrderValueEuro: maxOrderValue === "" ? null : maxOrderValue,
            markupFactor: markup,
          });
          setMsg("Einstellungen gespeichert."); await load();
        } catch (e) { setErr(errMsg(e)); }
      }}>Speichern</Button>

      <Title order={4} mt="xl">E-Mail-Versand (SMTP / IONOS)</Title>
      <Text size="sm" c="dimmed" mt={4}>
        Server-Umgebungsvariablen: <code>SMTP_USER</code> (volle E-Mail-Adresse), <code>SMTP_PASS</code>,
        optional <code>SMTP_HOST</code> (Default smtp.ionos.de), <code>SMTP_PORT</code> (587 STARTTLS / 465 SSL), <code>SMTP_FROM</code>.
        Ohne Zugangsdaten wird nur protokolliert.
      </Text>
      <Group gap="xs" align="end" mt="xs">
        <TextInput label="Testmail an" value={testTo} onChange={(e) => setTestTo(e.currentTarget.value)} w={260} placeholder="empfaenger@example.de" />
        <Button disabled={!testTo.includes("@")} onClick={async () => {
          setErr(null); setMsg(null);
          try { await trpc.mail.sendTest.mutate({ to: testTo }); setMsg(`Testmail an ${testTo} ausgelöst (bei konfiguriertem SMTP).`); }
          catch (e) { setErr(errMsg(e)); }
        }}>Testmail senden</Button>
      </Group>

      <UserAdmin onError={setErr} onMsg={setMsg} />
    </>
  );
}

// Benutzerverwaltung (nur ADMIN): Mitarbeiter-Konten @texma-gmbh.de anlegen, mit 2FA.
function UserAdmin({ onError, onMsg }: { onError: (s: string | null) => void; onMsg: (s: string | null) => void }): JSX.Element {
  const [users, setUsers] = useState<Awaited<ReturnType<typeof trpc.auth.listUsers.query>>>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("BUERO");
  const [pw, setPw] = useState("");

  const load = useCallback(async () => {
    try { setUsers(await trpc.auth.listUsers.query()); } catch (e) { onError(errMsg(e)); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Title order={4} mt="xl">Benutzerverwaltung (Login + 2FA)</Title>
      <Text size="sm" c="dimmed" mt={4}>Mitarbeiter-Konten für den ERP-Login. E-Mail muss auf <code>@texma-gmbh.de</code> enden. Jede:r richtet 2FA selbst unter „Mein Konto" ein.</Text>
      <Group gap="xs" align="end" mt="xs" wrap="wrap">
        <TextInput label="E-Mail" value={email} onChange={(e) => setEmail(e.currentTarget.value)} w={230} placeholder="vorname@texma-gmbh.de" />
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} w={170} />
        <Select label="Rolle" value={role} onChange={(v) => v && setRole(v)} w={160} data={[
          { value: "ADMIN", label: "Geschäftsleitung" }, { value: "BUERO", label: "Büro/Vertrieb" },
          { value: "BUCHHALTUNG", label: "Buchhaltung" }, { value: "PRODUKTION", label: "Produktion" }]} />
        <TextInput label="Start-Passwort (min. 8)" value={pw} onChange={(e) => setPw(e.currentTarget.value)} w={180} type="password" />
        <Button disabled={!email.includes("@") || !name.trim() || pw.length < 8} onClick={async () => {
          onError(null); onMsg(null);
          try { await trpc.auth.createUser.mutate({ email, name, role: role as "BUERO", password: pw }); onMsg(`Konto ${email} angelegt.`); setEmail(""); setName(""); setPw(""); await load(); }
          catch (e) { onError(errMsg(e)); }
        }}>Konto anlegen</Button>
      </Group>
      <Table mt="sm" withTableBorder withColumnBorders>
        <Table.Thead><Table.Tr><Table.Th>E-Mail</Table.Th><Table.Th>Name</Table.Th><Table.Th>Rolle</Table.Th><Table.Th>2FA</Table.Th><Table.Th>Status</Table.Th><Table.Th>Aktion</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {users.map((u) => (
            <Table.Tr key={u.id}>
              <Table.Td>{u.email}</Table.Td><Table.Td>{u.name}</Table.Td><Table.Td>{u.role}</Table.Td>
              <Table.Td>{u.totpEnabled ? <Badge color="green" variant="light">aktiv</Badge> : <Badge color="gray" variant="light">aus</Badge>}</Table.Td>
              <Table.Td>{u.active ? "aktiv" : "gesperrt"}</Table.Td>
              <Table.Td>
                <Button size="compact-xs" variant="light" color={u.active ? "red" : "green"} onClick={async () => {
                  onError(null); try { await trpc.auth.setUserActive.mutate({ userId: u.id, active: !u.active }); await load(); } catch (e) { onError(errMsg(e)); }
                }}>{u.active ? "Sperren" : "Entsperren"}</Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}

// Schlanke Lagerhaltung + Inventur (F4-Ledger): Bestand je Lager, Zugang/Abgang,
// Inventur-Zählung (bucht Differenz). Showroom + Transferdrucke als eigene Lager.
const LAGER = [
  { value: "HAUPT", label: "Hauptlager" },
  { value: "MUSTER", label: "Muster" },
  { value: "SHOWROOM", label: "Showroom" },
  { value: "TRANSFERDRUCK", label: "Transferdrucke" },
] as const;

export function LagerPage(): JSX.Element {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof trpc.stock.list.query>>>([]);
  const [variantId, setVariantId] = useState("");
  const [lager, setLager] = useState<string>("TRANSFERDRUCK");
  const [delta, setDelta] = useState(0);
  const [countVariant, setCountVariant] = useState("");
  const [countLager, setCountLager] = useState<string>("SHOWROOM");
  const [counted, setCounted] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await trpc.stock.list.query()); setErr(null); } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Title order={3}>Lager & Inventur</Title>
      <Text size="sm" c="dimmed" mt={4}>Schlanke Lagerführung über Bewegungen (F4): Bestand = Summe der Buchungen. Showroom + Transferdrucke als eigene Lager. Inventur bucht die Differenz (Ist − Soll) als Korrektur.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      {msg && <Alert color="green" mt="sm">{msg}</Alert>}

      <Group gap="md" mt="md" align="end" wrap="wrap">
        <Box p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
          <Text size="sm" fw={600}>Zugang / Abgang (Transferdrucke etc.)</Text>
          <Group gap="xs" align="end" mt="xs">
            <TextInput label="Varianten-ID" value={variantId} onChange={(e) => setVariantId(e.currentTarget.value)} w={170} />
            <Select label="Lager" value={lager} onChange={(v) => v && setLager(v)} data={LAGER.map((l) => ({ value: l.value, label: l.label }))} w={150} />
            <NumberInput label="Menge (+/−)" value={delta} onChange={(v) => setDelta(Number(v) || 0)} w={120} />
            <Button disabled={!variantId.trim() || delta === 0} onClick={async () => {
              setErr(null); setMsg(null);
              try { await trpc.stock.move.mutate({ variantId, deltaQty: delta, lager: lager as "HAUPT", grund: delta > 0 ? "WARENEINGANG" : "VERBRAUCH" }); setMsg("Bewegung gebucht."); setDelta(0); await load(); }
              catch (e) { setErr(errMsg(e)); }
            }}>Buchen</Button>
          </Group>
        </Box>

        <Box p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
          <Text size="sm" fw={600}>Inventur (Showroom)</Text>
          <Group gap="xs" align="end" mt="xs">
            <TextInput label="Varianten-ID" value={countVariant} onChange={(e) => setCountVariant(e.currentTarget.value)} w={170} />
            <Select label="Lager" value={countLager} onChange={(v) => v && setCountLager(v)} data={LAGER.map((l) => ({ value: l.value, label: l.label }))} w={150} />
            <NumberInput label="Gezählt" value={counted} onChange={(v) => setCounted(Number(v) || 0)} min={0} w={110} />
            <Button disabled={!countVariant.trim()} onClick={async () => {
              setErr(null); setMsg(null);
              try { const r = await trpc.stock.inventur.mutate({ variantId: countVariant, countedQty: counted, lager: countLager as "SHOWROOM" }); setMsg(r.corrected ? `Korrektur gebucht: Delta ${r.delta}.` : "Keine Abweichung — keine Korrektur nötig."); await load(); }
              catch (e) { setErr(errMsg(e)); }
            }}>Zählung erfassen</Button>
          </Group>
        </Box>
      </Group>

      <Title order={4} mt="xl">Bestandsübersicht</Title>
      {rows.length === 0 ? <Text size="sm" c="dimmed" mt="xs">Noch keine Lagerbewegungen.</Text> : (
        <Table mt="xs" withTableBorder withColumnBorders>
          <Table.Thead><Table.Tr>
            <Table.Th>SKU</Table.Th><Table.Th>Artikel</Table.Th>
            {LAGER.map((l) => <Table.Th key={l.value} ta="right">{l.label}</Table.Th>)}
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.variantId}>
                <Table.Td>{r.sku}</Table.Td><Table.Td>{r.name}</Table.Td>
                {LAGER.map((l) => <Table.Td key={l.value} ta="right">{r.balances[l.value]}</Table.Td>)}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}

// Personalwesen (HR, nur GL/ADMIN): Mitarbeiter + Urlaubsanträge.
export function HrPage(): JSX.Element {
  const [emps, setEmps] = useState<Awaited<ReturnType<typeof trpc.hr.employees.query>>>([]);
  const [vacs, setVacs] = useState<Awaited<ReturnType<typeof trpc.hr.vacations.query>>>([]);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [position, setPosition] = useState(""); const [urlaub, setUrlaub] = useState(30);
  const [vacEmp, setVacEmp] = useState<string | null>(null); const [von, setVon] = useState(""); const [bis, setBis] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setEmps(await trpc.hr.employees.query()); setVacs(await trpc.hr.vacations.query()); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (fn: () => Promise<unknown>): Promise<void> => { setErr(null); try { await fn(); await load(); } catch (e) { setErr(errMsg(e)); } };
  const d = (x: unknown): string => new Date(String(x)).toLocaleDateString("de-DE");

  return (
    <>
      <Title order={3}>Personalwesen</Title>
      <Text size="sm" c="dimmed" mt={4}>Nur Geschäftsleitung. Mitarbeiter-Stammdaten, Urlaubsanträge (Werktage automatisch), Genehmigung → geteilter Kalendereintrag.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      <Title order={4} mt="md">Mitarbeiter</Title>
      <Group gap="xs" align="end" mt="xs" wrap="wrap">
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} w={170} />
        <TextInput label="E-Mail" value={email} onChange={(e) => setEmail(e.currentTarget.value)} w={200} />
        <TextInput label="Position" value={position} onChange={(e) => setPosition(e.currentTarget.value)} w={150} />
        <NumberInput label="Urlaubstage/Jahr" value={urlaub} onChange={(v) => setUrlaub(Number(v) || 30)} min={0} w={140} />
        <Button disabled={!name.trim() || !email.includes("@")} onClick={() => void act(async () => { await trpc.hr.addEmployee.mutate({ name, email, position: position || undefined, urlaubstageJahr: urlaub }); setName(""); setEmail(""); setPosition(""); })}>Anlegen</Button>
      </Group>
      <Table mt="sm" withTableBorder withColumnBorders>
        <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>E-Mail</Table.Th><Table.Th>Position</Table.Th><Table.Th ta="right">Anspruch</Table.Th><Table.Th ta="right">Genommen</Table.Th><Table.Th ta="right">Rest</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {emps.map((e) => (
            <Table.Tr key={e.id}><Table.Td>{e.name}</Table.Td><Table.Td>{e.email}</Table.Td><Table.Td>{e.position}</Table.Td>
              <Table.Td ta="right">{e.urlaubstageJahr}</Table.Td><Table.Td ta="right">{e.genehmigteTage}</Table.Td><Table.Td ta="right"><b>{e.resturlaub}</b></Table.Td></Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Title order={4} mt="xl">Urlaubsantrag</Title>
      <Group gap="xs" align="end" mt="xs" wrap="wrap">
        <Select label="Mitarbeiter" value={vacEmp} onChange={setVacEmp} data={emps.map((e) => ({ value: e.id, label: e.name }))} w={180} />
        <TextInput label="Von" type="date" value={von} onChange={(e) => setVon(e.currentTarget.value)} w={160} />
        <TextInput label="Bis" type="date" value={bis} onChange={(e) => setBis(e.currentTarget.value)} w={160} />
        <Button disabled={!vacEmp || !von || !bis} onClick={() => void act(async () => { const r = await trpc.hr.requestVacation.mutate({ employeeId: vacEmp!, vonDatum: new Date(von).toISOString(), bisDatum: new Date(bis).toISOString() }); window.alert(`${r.tage} Werktage beantragt.`); setVon(""); setBis(""); })}>Beantragen</Button>
      </Group>
      <Table mt="sm" withTableBorder withColumnBorders>
        <Table.Thead><Table.Tr><Table.Th>Mitarbeiter</Table.Th><Table.Th>Von</Table.Th><Table.Th>Bis</Table.Th><Table.Th ta="right">Tage</Table.Th><Table.Th>Status</Table.Th><Table.Th>Aktion</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {vacs.map((v) => (
            <Table.Tr key={v.id}><Table.Td>{v.employeeName}</Table.Td><Table.Td>{d(v.vonDatum)}</Table.Td><Table.Td>{d(v.bisDatum)}</Table.Td><Table.Td ta="right">{v.tage}</Table.Td>
              <Table.Td><Badge color={v.status === "GENEHMIGT" ? "green" : v.status === "ABGELEHNT" ? "red" : "yellow"} variant="light">{v.status}</Badge></Table.Td>
              <Table.Td>{v.status === "BEANTRAGT" ? (
                <Group gap={4}>
                  <Button size="compact-xs" color="green" onClick={() => void act(() => trpc.hr.decideVacation.mutate({ id: v.id, approve: true }))}>Genehmigen</Button>
                  <Button size="compact-xs" color="red" variant="light" onClick={() => void act(() => trpc.hr.decideVacation.mutate({ id: v.id, approve: false }))}>Ablehnen</Button>
                </Group>
              ) : <Text size="xs" c="dimmed">—</Text>}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}

// Connector-Plattform (Integrations-Registry, nur ADMIN): Katalog aller Fremdsystem-
// Anbindungen mit Status; portal-pflegbare konfigurieren + Slack testen.
export function IntegrationsPage(): JSX.Element {
  const [list, setList] = useState<Awaited<ReturnType<typeof trpc.integrations.list.query>>>([]);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const l = await trpc.integrations.list.query();
      setList(l);
      setDrafts(Object.fromEntries(l.map((c) => [c.kind, { ...c.config }])));
      setEnabled(Object.fromEntries(l.map((c) => [c.kind, c.enabled])));
      setErr(null);
    } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Title order={3}>Schnittstellen (Connector-Plattform)</Title>
      <Text size="sm" c="dimmed" mt={4}>Zentrale Registry aller Anbindungen. Portal-pflegbare (Brevo, HubSpot, Slack, CalDAV) hier konfigurieren; Shop/Versand/Lieferanten laufen über die Worker-/ENV-Konfiguration.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      {msg && <Alert color="green" mt="sm">{msg}</Alert>}

      <Group mt="md" gap="md" align="stretch" wrap="wrap">
        {list.map((c) => (
          <Box key={c.kind} p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, width: 340 }}>
            <Group justify="space-between">
              <Text fw={700}>{c.name}</Text>
              <Badge color={c.configured ? "green" : "gray"} variant="light">{c.configured ? "konfiguriert" : "offen"}</Badge>
            </Group>
            <Text size="xs" c="dimmed" mt={2}>{c.category} · {c.description}</Text>
            {c.portalConfigurable ? (
              <>
                {c.fields.map((f) => (
                  <TextInput key={f.key} label={f.label} size="xs" mt={6} type={f.secret ? "password" : "text"}
                    value={drafts[c.kind]?.[f.key] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [c.kind]: { ...d[c.kind], [f.key]: e.currentTarget.value } }))} />
                ))}
                <Group mt="sm" gap="xs">
                  <Switch label="Aktiv" checked={enabled[c.kind] ?? false} onChange={(e) => setEnabled((x) => ({ ...x, [c.kind]: e.currentTarget.checked }))} />
                  <Button size="compact-xs" onClick={async () => {
                    setErr(null); setMsg(null);
                    try { await trpc.integrations.configure.mutate({ kind: c.kind, enabled: enabled[c.kind] ?? false, config: drafts[c.kind] ?? {} }); setMsg(`${c.name} gespeichert.`); await load(); }
                    catch (e) { setErr(errMsg(e)); }
                  }}>Speichern</Button>
                  {c.kind === "SLACK" && (
                    <Button size="compact-xs" variant="light" onClick={async () => {
                      setErr(null); setMsg(null);
                      try { const r = await trpc.integrations.test.mutate({ kind: "SLACK" }); setMsg(r.message); }
                      catch (e) { setErr(errMsg(e)); }
                    }}>Testen</Button>
                  )}
                </Group>
              </>
            ) : <Text size="xs" c="dimmed" mt="sm">Konfiguration über Worker/ENV.</Text>}
          </Box>
        ))}
      </Group>
    </>
  );
}

// Mein Konto / Sicherheit: TOTP-2FA selbst einrichten (für jede:n angemeldete:n Nutzer:in).
export function SecurityPage({ userName, onProfileUpdated }: { userName?: string; onProfileUpdated?: () => void } = {}): JSX.Element {
  const [setup, setSetup] = useState<{ secret: string; keyUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Profil (Name)
  const [name, setName] = useState(userName ?? "");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  // Passwort ändern
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  return (
    <>
      <Title order={3}>Mein Konto</Title>

      <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, maxWidth: 560 }}>
        <Text fw={600}>Profil</Text>
        <Text size="sm" c="dimmed" mt={2}>Eigenen Anzeigenamen ändern.</Text>
        {profileErr && <Alert color="red" mt="sm">{profileErr}</Alert>}
        {profileMsg && <Alert color="green" mt="sm">{profileMsg}</Alert>}
        <Group gap="xs" align="end" mt="xs">
          <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} w={300} />
          <Button disabled={!name.trim()} onClick={async () => {
            setProfileErr(null); setProfileMsg(null);
            try { await trpc.auth.updateProfile.mutate({ name }); setProfileMsg("Name gespeichert."); onProfileUpdated?.(); }
            catch (e) { setProfileErr(errMsg(e)); }
          }}>Speichern</Button>
        </Group>
      </Box>

      <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, maxWidth: 560 }}>
        <Text fw={600}>Passwort ändern</Text>
        <Text size="sm" c="dimmed" mt={2}>Mindestens 8 Zeichen. Das aktuelle Passwort ist zur Bestätigung erforderlich.</Text>
        {pwErr && <Alert color="red" mt="sm">{pwErr}</Alert>}
        {pwMsg && <Alert color="green" mt="sm">{pwMsg}</Alert>}
        <TextInput type="password" label="Aktuelles Passwort" value={oldPw} onChange={(e) => setOldPw(e.currentTarget.value)} mt="xs" w={300} />
        <TextInput type="password" label="Neues Passwort" value={newPw} onChange={(e) => setNewPw(e.currentTarget.value)} mt="xs" w={300} />
        <TextInput type="password" label="Neues Passwort (Wiederholung)" value={newPw2} onChange={(e) => setNewPw2(e.currentTarget.value)} mt="xs" w={300} />
        <Button mt="sm" disabled={!oldPw || newPw.length < 8 || newPw !== newPw2} onClick={async () => {
          setPwErr(null); setPwMsg(null);
          if (newPw !== newPw2) { setPwErr("Die neuen Passwörter stimmen nicht überein."); return; }
          try { await trpc.auth.changePassword.mutate({ oldPassword: oldPw, newPassword: newPw }); setPwMsg("Passwort geändert."); setOldPw(""); setNewPw(""); setNewPw2(""); }
          catch (e) { setPwErr(errMsg(e)); }
        }}>Passwort ändern</Button>
      </Box>

      <Title order={4} mt="xl">2FA-Sicherheit</Title>
      <Text size="sm" c="dimmed" mt={4}>Zwei-Faktor-Authentifizierung (TOTP) mit einer Authenticator-App (z. B. Google Authenticator, Authy) einrichten.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      {msg && <Alert color="green" mt="sm">{msg}</Alert>}

      {!setup ? (
        <Button mt="md" onClick={async () => {
          setErr(null); setMsg(null);
          try { setSetup(await trpc.auth.setupTotp.mutate()); } catch (e) { setErr(errMsg(e)); }
        }}>2FA einrichten</Button>
      ) : (
        <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, maxWidth: 560 }}>
          <Text size="sm" fw={600}>1. In der Authenticator-App hinzufügen</Text>
          <Text size="sm" mt={4}>Geheimschlüssel (manuell eingeben):</Text>
          <Text ff="monospace" size="sm" style={{ wordBreak: "break-all" }} c="blue">{setup.secret}</Text>
          <Text size="xs" c="dimmed" mt={4} style={{ wordBreak: "break-all" }}>otpauth-URL: {setup.keyUri}</Text>
          <Text size="sm" fw={600} mt="md">2. 6-stelligen Code bestätigen</Text>
          <Group gap="xs" align="end" mt="xs">
            <TextInput label="Code" value={code} onChange={(e) => setCode(e.currentTarget.value)} w={140} />
            <Button disabled={code.length < 6} onClick={async () => {
              setErr(null); setMsg(null);
              try { await trpc.auth.enableTotp.mutate({ code }); setMsg("2FA aktiviert. Beim nächsten Login wird der Code abgefragt."); setSetup(null); setCode(""); }
              catch (e) { setErr(errMsg(e)); }
            }}>Aktivieren</Button>
          </Group>
        </Box>
      )}
    </>
  );
}

const BELEGARTEN = ["RECHNUNG", "GUTSCHRIFT", "EINGANGSRECHNUNG", "BUCHUNGSBELEG", "LIEFERSCHEIN", "AUFTRAGSBESTAETIGUNG", "ANGEBOT", "GESCHAEFTSBRIEF", "LOGO", "SONSTIGES"] as const;

// GoBD-Belegarchiv (Kap. 10): unveränderbare WORM-Ablage + GDPdU-„Z3"-Export. Nur
// Büro/Buchhaltung/Admin (finanzrelevant). Export nur Admin/Buchhaltung.
export function ArchivePage({ role }: { role?: string } = {}): JSX.Element {
  const [docs, setDocs] = useState<Awaited<ReturnType<typeof trpc.archive.list.query>>>([]);
  const [belegart, setBelegart] = useState<string>("RECHNUNG");
  const [sourceEntity, setSourceEntity] = useState("Invoice");
  const [sourceId, setSourceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const canExport = role === "ADMIN" || role === "BUCHHALTUNG";

  const refresh = useCallback(async () => {
    try { setDocs(await trpc.archive.list.query({ limit: 100 })); } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const archive = async () => {
    setErr(null); setMsg(null);
    if (!file || !sourceId.trim()) { setErr("Datei und Quell-ID sind erforderlich."); return; }
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = ""; for (const b of buf) bin += String.fromCharCode(b);
      await trpc.archive.archive.mutate({
        belegart: belegart as (typeof BELEGARTEN)[number], sourceEntity: sourceEntity.trim(), sourceId: sourceId.trim(),
        fileName: file.name, contentType: file.type || "application/octet-stream", dataBase64: btoa(bin),
      });
      setMsg(`„${file.name}" archiviert (WORM).`); setFile(null); setSourceId(""); await refresh();
    } catch (e) { setErr(errMsg(e)); }
  };

  const download = async (id: string, fileName: string, contentType: string) => {
    try { const r = await trpc.archive.get.query({ id }); downloadBase64(fileName, r.dataBase64, contentType); }
    catch (e) { setErr(errMsg(e)); }
  };

  const gobdExport = async () => {
    setErr(null);
    try {
      const exp = await trpc.archive.gobdExport.query();
      downloadText("index.xml", exp.indexXml, "application/xml");
      downloadText("manifest.csv", exp.manifestCsv, "text/csv");
      setMsg(`GoBD-Z3-Export: ${exp.count} Beleg(e) (index.xml + manifest.csv).`);
    } catch (e) { setErr(errMsg(e)); }
  };

  const fmtDate = (d: string | Date): string => new Date(d).toLocaleDateString("de-DE");

  return (
    <>
      <Title order={3}>GoBD-Belegarchiv</Title>
      <Text size="sm" c="dimmed" mt={4}>Unveränderbare (WORM) Ablage finalisierter Belege — inhaltsadressiert (SHA-256), mit gesetzlicher Aufbewahrungsfrist (6/10 Jahre) und GDPdU-„Z3"-Export für die Betriebsprüfung (Kap. 10).</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      {msg && <Alert color="green" mt="sm">{msg}</Alert>}

      <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, maxWidth: 640 }}>
        <Text fw={600}>Beleg archivieren</Text>
        <Group mt="xs" align="end" gap="xs">
          <Select label="Belegart" data={BELEGARTEN as unknown as string[]} value={belegart} onChange={(v) => setBelegart(v ?? "RECHNUNG")} w={200} />
          <TextInput label="Quelle" value={sourceEntity} onChange={(e) => setSourceEntity(e.currentTarget.value)} w={140} />
          <TextInput label="Quell-ID (z. B. RE-2026-0001)" value={sourceId} onChange={(e) => setSourceId(e.currentTarget.value)} w={220} />
        </Group>
        <input type="file" style={{ marginTop: 10 }} onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
        <Group mt="sm">
          <Button onClick={() => void archive()} disabled={!file || !sourceId.trim()}>Archivieren (WORM)</Button>
          {canExport && <Button variant="default" onClick={() => void gobdExport()}>GoBD-Z3-Export</Button>}
        </Group>
      </Box>

      <Title order={5} mt="lg">Archivierte Belege ({docs.length})</Title>
      <Table mt="xs" striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Belegart</Table.Th><Table.Th>Quelle</Table.Th><Table.Th>Datei</Table.Th>
            <Table.Th>Ver.</Table.Th><Table.Th>Aufbewahrung bis</Table.Th><Table.Th>SHA-256</Table.Th><Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {docs.map((d) => (
            <Table.Tr key={d.id}>
              <Table.Td><Badge variant="light">{d.belegart}</Badge></Table.Td>
              <Table.Td>{d.sourceEntity} · {d.sourceId}</Table.Td>
              <Table.Td>{d.fileName}</Table.Td>
              <Table.Td>{d.version}</Table.Td>
              <Table.Td>{fmtDate(d.earliestDeletion)}{d.legalHold ? " 🔒" : ""}</Table.Td>
              <Table.Td><Text size="xs" ff="monospace" c="dimmed">{d.sha256.slice(0, 12)}…</Text></Table.Td>
              <Table.Td><Button size="compact-xs" variant="subtle" onClick={() => void download(d.id, d.fileName, d.contentType)}>Laden</Button></Table.Td>
            </Table.Tr>
          ))}
          {docs.length === 0 && <Table.Tr><Table.Td colSpan={7}><Text size="sm" c="dimmed">Noch keine Belege archiviert.</Text></Table.Td></Table.Tr>}
        </Table.Tbody>
      </Table>
    </>
  );
}

// Audit-Log-Viewer (GoBD, Kap. 10): „wer hat wann was geändert" — read-only, Admin.
// Filter nach Entität/Beleg/Aktion/Nutzer/Zeitraum; Zeile aufklappen zeigt before→after.
const AUDIT_ACTION_COLOR: Record<string, string> = { CREATE: "green", UPDATE: "blue", FINALIZE: "violet", STORNO: "red", DELETE: "red" };
export function AuditLogPage(): JSX.Element {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof trpc.auditLog.list.query>>>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [entity, setEntity] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [userEmail, setUserEmail] = useState("");
  const [entityId, setEntityId] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      setRows(await trpc.auditLog.list.query({
        entity: entity || undefined, action: action || undefined,
        userEmail: userEmail.trim() || undefined, entityId: entityId.trim() || undefined, limit: 200,
      }));
    } catch (e) { setErr(errMsg(e)); }
  }, [entity, action, userEmail, entityId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void trpc.auditLog.entities.query().then(setEntities).catch(() => undefined); }, []);

  const fmt = (d: string | Date): string => new Date(d).toLocaleString("de-DE");
  const json = (v: unknown): string => (v == null ? "—" : JSON.stringify(v, null, 2));

  return (
    <>
      <Title order={3}>Audit-Protokoll</Title>
      <Text size="sm" c="dimmed" mt={4}>Unveränderbares Änderungsprotokoll (GoBD, Kap. 10): wer hat wann welchen Beleg angelegt, geändert, finalisiert oder storniert. Nur lesbar. Zeile anklicken zeigt vorher → nachher.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}

      <Group mt="md" align="end" gap="xs">
        <Select label="Entität" placeholder="alle" clearable data={entities} value={entity || null} onChange={(v) => setEntity(v ?? "")} w={170} />
        <Select label="Aktion" placeholder="alle" clearable data={["CREATE", "UPDATE", "FINALIZE", "STORNO", "DELETE"]} value={action || null} onChange={(v) => setAction(v ?? "")} w={140} />
        <TextInput label="Nutzer (E-Mail)" placeholder="enthält…" value={userEmail} onChange={(e) => setUserEmail(e.currentTarget.value)} w={200} />
        <TextInput label="Beleg-ID" placeholder="z. B. RE-2026-0001" value={entityId} onChange={(e) => setEntityId(e.currentTarget.value)} w={200} />
        <Button variant="default" onClick={() => void refresh()}>Aktualisieren</Button>
      </Group>

      <Title order={5} mt="lg">Einträge ({rows.length})</Title>
      <Table mt="xs" striped withTableBorder highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Zeitpunkt</Table.Th><Table.Th>Nutzer</Table.Th><Table.Th>Entität</Table.Th>
            <Table.Th>Beleg-ID</Table.Th><Table.Th>Aktion</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Fragment key={r.id}>
              <Table.Tr style={{ cursor: "pointer" }} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <Table.Td>{fmt(r.createdAt)}</Table.Td>
                <Table.Td>{r.userEmail ?? <Text size="xs" c="dimmed">System</Text>}</Table.Td>
                <Table.Td>{r.entity}</Table.Td>
                <Table.Td><Text size="xs" ff="monospace">{r.entityId}</Text></Table.Td>
                <Table.Td><Badge variant="light" color={AUDIT_ACTION_COLOR[r.action] ?? "gray"}>{r.action}</Badge></Table.Td>
              </Table.Tr>
              {expanded === r.id && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Group align="start" gap="lg" wrap="nowrap">
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="xs" fw={700} c="dimmed">Vorher</Text>
                        <Text component="pre" size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{json(r.before)}</Text>
                      </Box>
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="xs" fw={700} c="dimmed">Nachher</Text>
                        <Text component="pre" size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{json(r.after)}</Text>
                      </Box>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              )}
            </Fragment>
          ))}
          {rows.length === 0 && <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="dimmed">Keine Einträge für diesen Filter.</Text></Table.Td></Table.Tr>}
        </Table.Tbody>
      </Table>
    </>
  );
}

// Regel-Engine (Event → Bedingung → Aktion): Admin konfiguriert Automationen ohne Code.
export function AutomationPage(): JSX.Element {
  const [meta, setMeta] = useState<{ triggers: readonly string[]; actions: string[] }>({ triggers: [], actions: [] });
  const [rules, setRules] = useState<Awaited<ReturnType<typeof trpc.automation.list.query>>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Formular
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("order.status.changed");
  const [condField, setCondField] = useState("status");
  const [condOp, setCondOp] = useState("eq");
  const [condVal, setCondVal] = useState("VERSENDET");
  const [actionType, setActionType] = useState("notify");
  const [pTo, setPTo] = useState("");
  const [pTitle, setPTitle] = useState("Auftrag {{orderId}} → {{status}}");
  const [pBody, setPBody] = useState("");

  const load = useCallback(async () => {
    try {
      setMeta(await trpc.automation.meta.query());
      setRules(await trpc.automation.list.query());
      setErr(null);
    } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setErr(null); setMsg(null);
    try {
      const params: Record<string, string> = {};
      if (actionType === "notify") { params.to = pTo; params.title = pTitle; params.body = pBody; }
      else if (actionType === "email") { params.to = pTo; params.subject = pTitle; params.body = pBody; }
      await trpc.automation.create.mutate({
        name, triggerEvent: trigger,
        conditions: condField.trim() ? [{ field: condField, op: condOp as "eq", value: condVal }] : [],
        actions: [{ type: actionType, params }],
      });
      setMsg(`Regel „${name}" angelegt.`); setName(""); await load();
    } catch (e) { setErr(errMsg(e)); }
  };

  return (
    <>
      <Title order={3}>Automationen (Regel-Engine)</Title>
      <Text size="sm" c="dimmed" mt={4}>„Wenn Event X und Bedingung Y, dann Aktion Z" — native Automation im ERP, ohne zweite Datenschicht. Platzhalter <Text span ff="monospace">{"{{feld}}"}</Text> aus dem Event-Payload.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      {msg && <Alert color="green" mt="sm">{msg}</Alert>}

      <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, maxWidth: 720 }}>
        <Text fw={600}>Neue Regel</Text>
        <Group mt="xs" gap="xs" align="end">
          <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} w={220} />
          <Select label="Trigger (Event)" data={meta.triggers as string[]} value={trigger} onChange={(v) => setTrigger(v ?? trigger)} w={220} />
        </Group>
        <Text size="xs" fw={700} c="dimmed" mt="sm">BEDINGUNG (optional)</Text>
        <Group gap="xs" align="end">
          <TextInput label="Feld" value={condField} onChange={(e) => setCondField(e.currentTarget.value)} w={140} />
          <Select label="Operator" data={["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in"]} value={condOp} onChange={(v) => setCondOp(v ?? "eq")} w={110} />
          <TextInput label="Wert" value={condVal} onChange={(e) => setCondVal(e.currentTarget.value)} w={160} />
        </Group>
        <Text size="xs" fw={700} c="dimmed" mt="sm">AKTION</Text>
        <Group gap="xs" align="end">
          <Select label="Typ" data={meta.actions} value={actionType} onChange={(v) => setActionType(v ?? "notify")} w={120} />
          <TextInput label="An (E-Mail)" value={pTo} onChange={(e) => setPTo(e.currentTarget.value)} w={200} placeholder="{{userEmail}}" />
          <TextInput label="Titel/Betreff" value={pTitle} onChange={(e) => setPTitle(e.currentTarget.value)} w={260} />
        </Group>
        <Textarea label="Text" value={pBody} onChange={(e) => setPBody(e.currentTarget.value)} mt="xs" autosize minRows={2} />
        <Button mt="sm" disabled={!name.trim()} onClick={() => void create()}>Regel anlegen</Button>
      </Box>

      <Title order={5} mt="lg">Regeln ({rules.length})</Title>
      <Table mt="xs" striped withTableBorder>
        <Table.Thead><Table.Tr>
          <Table.Th>Aktiv</Table.Th><Table.Th>Name</Table.Th><Table.Th>Trigger</Table.Th>
          <Table.Th>Bedingungen</Table.Th><Table.Th>Aktionen</Table.Th><Table.Th>Zuletzt</Table.Th><Table.Th></Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {rules.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td><Switch checked={r.active} onChange={async (e) => { await trpc.automation.setActive.mutate({ id: r.id, active: e.currentTarget.checked }); await load(); }} /></Table.Td>
              <Table.Td>{r.name}</Table.Td>
              <Table.Td><Badge variant="light">{r.triggerEvent}</Badge></Table.Td>
              <Table.Td><Text size="xs">{r.conditions.map((c) => `${c.field} ${c.op} ${String(c.value)}`).join(" & ") || "—"}</Text></Table.Td>
              <Table.Td><Text size="xs">{r.actions.map((a) => a.type).join(", ")}</Text></Table.Td>
              <Table.Td><Text size="xs" c="dimmed">{r.lastFiredAt ? new Date(r.lastFiredAt).toLocaleString("de-DE") : "nie"}</Text></Table.Td>
              <Table.Td><Button size="compact-xs" variant="subtle" color="red" onClick={async () => { await trpc.automation.remove.mutate({ id: r.id }); await load(); }}>Löschen</Button></Table.Td>
            </Table.Tr>
          ))}
          {rules.length === 0 && <Table.Tr><Table.Td colSpan={7}><Text size="sm" c="dimmed">Noch keine Regeln.</Text></Table.Td></Table.Tr>}
        </Table.Tbody>
      </Table>
    </>
  );
}

// Meine Aufgaben (Arbeitsliste, ERPNext „Assigned To/ToDo"): offene Aufgaben der
// angemeldeten Person, Erledigen/Neuzuweisen, Sprung zum verknüpften Beleg.
export function TasksPage({ onNavigate }: { onNavigate?: (k: string) => void } = {}): JSX.Element {
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof trpc.tasks.mine.query>>>([]);
  const [showDone, setShowDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setTasks(await trpc.tasks.mine.query({ includeDone: showDone })); setErr(null); }
    catch (e) { setErr(errMsg(e)); }
  }, [showDone]);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Title order={3}>Meine Aufgaben</Title>
      <Text size="sm" c="dimmed" mt={4}>Persönliche Arbeitsliste — zugewiesene Vorgänge, optional an einen Beleg gekoppelt.</Text>
      {err && <Alert color="red" mt="sm">{err}</Alert>}
      <Switch mt="sm" label="Erledigte anzeigen" checked={showDone} onChange={(e) => setShowDone(e.currentTarget.checked)} />
      <Table mt="xs" striped withTableBorder>
        <Table.Thead><Table.Tr>
          <Table.Th>Status</Table.Th><Table.Th>Titel</Table.Th><Table.Th>Beleg</Table.Th><Table.Th>Fällig</Table.Th><Table.Th></Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {tasks.map((t) => (
            <Table.Tr key={t.id}>
              <Table.Td><Badge size="xs" color={t.status === "ERLEDIGT" ? "gray" : "blue"} variant="light">{t.status}</Badge></Table.Td>
              <Table.Td>{t.title}{t.description ? <Text size="xs" c="dimmed">{t.description}</Text> : null}</Table.Td>
              <Table.Td>{t.entity ? <Button size="compact-xs" variant="subtle" disabled={!t.navKey || !onNavigate} onClick={() => t.navKey && onNavigate?.(t.navKey)}>{t.entity} {t.entityId?.slice(0, 8)}</Button> : <Text size="xs" c="dimmed">—</Text>}</Table.Td>
              <Table.Td><Text size="xs" c="dimmed">{t.dueDate ? new Date(t.dueDate).toLocaleDateString("de-DE") : "—"}</Text></Table.Td>
              <Table.Td>
                {t.status === "OFFEN"
                  ? <Button size="compact-xs" onClick={async () => { await trpc.tasks.complete.mutate({ id: t.id }); await load(); }}>Erledigt</Button>
                  : <Button size="compact-xs" variant="subtle" onClick={async () => { await trpc.tasks.reopen.mutate({ id: t.id }); await load(); }}>Wieder öffnen</Button>}
              </Table.Td>
            </Table.Tr>
          ))}
          {tasks.length === 0 && <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="dimmed">Keine Aufgaben.</Text></Table.Td></Table.Tr>}
        </Table.Tbody>
      </Table>
    </>
  );
}

// Aufgabe zu einem Beleg zuweisen (inline, z. B. auf der Auftragsseite).
export function AssignTaskBox({ entity, entityId, navKey }: { entity: string; entityId: string; navKey?: string }): JSX.Element {
  const [title, setTitle] = useState("");
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Box mt="md" p="md" style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8 }}>
      <Text fw={600}>Aufgabe zuweisen</Text>
      {err && <Alert color="red" mt="xs">{err}</Alert>}
      {msg && <Alert color="green" mt="xs">{msg}</Alert>}
      <Group gap="xs" align="end" mt="xs">
        <TextInput label="Aufgabe" value={title} onChange={(e) => setTitle(e.currentTarget.value)} w={260} placeholder="z. B. Druckdaten prüfen" />
        <TextInput label="An (E-Mail)" value={to} onChange={(e) => setTo(e.currentTarget.value)} w={220} placeholder="kollege@texma-gmbh.de" />
        <Button disabled={!title.trim() || !to.trim()} onClick={async () => {
          setErr(null); setMsg(null);
          try { await trpc.tasks.create.mutate({ title, assigneeEmail: to, entity, entityId, navKey }); setMsg("Aufgabe zugewiesen."); setTitle(""); }
          catch (e) { setErr(errMsg(e)); }
        }}>Zuweisen</Button>
      </Group>
    </Box>
  );
}

// ERPNext-artige Home-Workspace: KPI-Kacheln + Schnellzugriffe mit Zählern + gruppierte
// „Berichte & Stammdaten"-Sprungkarten. Zähler clientseitig aus den vorhandenen Listen.
// Schnellzugriff-Definitionen (key, Label, Zielmodul, optional Zähler-Feld).
const HOME_SHORTCUTS: ReadonlyArray<{ key: string; label: string; nav: string; countKey?: string }> = [
  { key: "companies", label: "Firmen/Kunden", nav: "companies", countKey: "companies" },
  { key: "orders", label: "Aufträge", nav: "orders", countKey: "orders" },
  { key: "quotes", label: "Angebote", nav: "quotes", countKey: "quotes" },
  { key: "leads", label: "Leads", nav: "leads", countKey: "leads" },
  { key: "invoices", label: "Rechnungen", nav: "dunning", countKey: "invoices" },
  { key: "suppliers", label: "Lieferanten", nav: "suppliers", countKey: "suppliers" },
  { key: "articles", label: "Artikel", nav: "products", countKey: "articles" },
  { key: "archive", label: "GoBD-Archiv", nav: "archive" },
  { key: "tasks", label: "Meine Aufgaben", nav: "tasks", countKey: "tasks" },
  { key: "calendar", label: "Kalender", nav: "calendar" },
  { key: "automation", label: "Automationen", nav: "automation" },
];
const HOME_LAYOUT_KEY = "texma.home.shortcuts.v1"; // localStorage-Cache (sofortige Anzeige)
const HOME_LAYOUT_PREF_KEY = "home.shortcuts.v1"; // Server-Schlüssel (geräteübergreifend)
interface HomeLayout { order: string[]; hidden: string[] }
const defaultHomeLayout = (): HomeLayout => ({ order: HOME_SHORTCUTS.map((s) => s.key), hidden: [] });
function isHomeLayout(v: unknown): v is HomeLayout {
  return !!v && typeof v === "object" && Array.isArray((v as HomeLayout).order) && Array.isArray((v as HomeLayout).hidden);
}
function loadHomeLayout(): HomeLayout {
  try { const raw = localStorage.getItem(HOME_LAYOUT_KEY); if (raw) { const v = JSON.parse(raw) as unknown; if (isHomeLayout(v)) return v; } } catch { /* ignore */ }
  return defaultHomeLayout();
}

export function HomePage({ userName, onNavigate }: { userName?: string; onNavigate: (k: string) => void }): JSX.Element {
  const [n, setN] = useState<Record<string, number>>({});
  const [openOrders, setOpenOrders] = useState(0);
  const [openQuotes, setOpenQuotes] = useState(0);
  const [tasks, setTasks] = useState(0);
  const [layout, setLayout] = useState<HomeLayout>(() => (typeof localStorage !== "undefined" ? loadHomeLayout() : defaultHomeLayout()));
  const [edit, setEdit] = useState(false);
  // Layout speichern: lokaler Cache (sofort) + serverseitig je Nutzer (geräteübergreifend).
  const saveLayout = (l: HomeLayout): void => {
    setLayout(l);
    try { localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(l)); } catch { /* ignore */ }
    void trpc.preferences.set.mutate({ key: HOME_LAYOUT_PREF_KEY, value: l }).catch(() => undefined);
  };
  // Beim Laden das serverseitige Layout holen; vorhanden → übernehmen (+ Cache),
  // sonst den lokalen Cache einmalig auf den Server migrieren.
  useEffect(() => {
    void (async () => {
      try {
        const remote = await trpc.preferences.get.query({ key: HOME_LAYOUT_PREF_KEY });
        if (isHomeLayout(remote)) {
          setLayout(remote);
          try { localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(remote)); } catch { /* ignore */ }
        } else {
          const local = typeof localStorage !== "undefined" ? loadHomeLayout() : defaultHomeLayout();
          await trpc.preferences.set.mutate({ key: HOME_LAYOUT_PREF_KEY, value: local });
        }
      } catch { /* offline/kein Login → lokaler Cache bleibt */ }
    })();
  }, []);
  useEffect(() => {
    void (async () => {
      const safe = async <T,>(p: Promise<T>, f: T): Promise<T> => { try { return await p; } catch { return f; } };
      const [companies, orders, quotes, leads, invoices, suppliers, articles, taskCount] = await Promise.all([
        safe(trpc.companies.list.query(), [] as unknown[]),
        safe(trpc.shopOrders.list.query({ limit: 200 }), [] as { status?: string }[]),
        safe(trpc.quotes.list.query(), [] as { status?: string }[]),
        safe(trpc.leads.list.query(), [] as unknown[]),
        safe(trpc.invoices.list.query(), [] as unknown[]),
        safe(trpc.suppliers.listAll.query(), [] as unknown[]),
        safe(trpc.products.listArticles.query(), [] as unknown[]),
        safe(trpc.tasks.openCount.query(), 0),
      ]);
      setN({ companies: companies.length, orders: orders.length, quotes: quotes.length, leads: leads.length, invoices: invoices.length, suppliers: suppliers.length, articles: articles.length });
      setOpenOrders(orders.filter((o) => !["ABGESCHLOSSEN", "STORNIERT"].includes(String(o.status))).length);
      setOpenQuotes(quotes.filter((q) => !["ANGENOMMEN", "ABGELEHNT", "VERWORFEN"].includes(String(q.status))).length);
      setTasks(taskCount);
    })();
  }, []);

  const kpi = (label: string, value: number | string, color: string, navKey: string): JSX.Element => (
    <Box onClick={() => onNavigate(navKey)} style={{ flex: "1 1 180px", minWidth: 160, cursor: "pointer", border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, padding: 16 }}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed">{label}</Text>
      <Text fz={28} fw={700} c={color} mt={4}>{value}</Text>
    </Box>
  );
  const counts: Record<string, number> = { ...n, tasks };
  // Sichtbare Schnellzugriffe in gespeicherter Reihenfolge; unbekannte Keys ignorieren.
  const ordered = layout.order.map((k) => HOME_SHORTCUTS.find((s) => s.key === k)).filter((s): s is (typeof HOME_SHORTCUTS)[number] => !!s);
  const visible = ordered.filter((s) => !layout.hidden.includes(s.key));
  const hiddenDefs = HOME_SHORTCUTS.filter((s) => layout.hidden.includes(s.key));
  const move = (key: string, dir: -1 | 1): void => {
    const order = [...layout.order];
    const i = order.indexOf(key); const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    saveLayout({ ...layout, order });
  };
  const hide = (key: string): void => saveLayout({ ...layout, hidden: [...layout.hidden, key] });
  const show = (key: string): void => saveLayout({ ...layout, hidden: layout.hidden.filter((k) => k !== key) });
  const card = (title: string, items: { label: string; navKey: string }[]): JSX.Element => (
    <Box style={{ flex: "1 1 240px", minWidth: 220 }}>
      <Text size="sm" fw={700} mb={6}>{title}</Text>
      {items.map((i) => (
        <Text key={i.navKey + i.label} size="sm" mb={3} c="blue" style={{ cursor: "pointer" }} onClick={() => onNavigate(i.navKey)}>↗ {i.label}</Text>
      ))}
    </Box>
  );

  return (
    <>
      <Title order={3}>Willkommen{userName ? `, ${userName}` : ""}</Title>
      <Text size="sm" c="dimmed" mt={4}>Startübersicht — zentrale Kennzahlen, Schnellzugriffe und Sprungbretter in alle Module.</Text>

      <Group mt="md" gap="sm" align="stretch" wrap="wrap">
        {kpi("Offene Aufträge", openOrders, "navy", "orders")}
        {kpi("Offene Angebote", openQuotes, "teal", "quotes")}
        {kpi("Kunden", n.companies ?? 0, "blue", "companies")}
        {kpi("Meine Aufgaben", tasks, tasks > 0 ? "orange" : "gray", "tasks")}
      </Group>

      <Group mt="xl" justify="space-between">
        <Title order={5}>Schnellzugriffe</Title>
        <Button size="compact-xs" variant={edit ? "filled" : "subtle"} onClick={() => setEdit((e) => !e)}>{edit ? "Fertig" : "Bearbeiten"}</Button>
      </Group>
      <Group mt="xs" gap="xs" wrap="wrap">
        {visible.map((s) => (
          <Group key={s.key} gap={2} wrap="nowrap" style={{ border: edit ? "1px dashed var(--mantine-color-gray-4)" : undefined, borderRadius: 8, padding: edit ? 2 : 0 }}>
            <Button variant="default" onClick={() => !edit && onNavigate(s.nav)} rightSection={s.countKey ? <Badge size="sm" variant="light">{counts[s.countKey] ?? 0}</Badge> : null}>{s.label}</Button>
            {edit && <>
              <Button size="compact-xs" variant="subtle" px={4} onClick={() => move(s.key, -1)}>←</Button>
              <Button size="compact-xs" variant="subtle" px={4} onClick={() => move(s.key, 1)}>→</Button>
              <Button size="compact-xs" variant="subtle" color="red" px={4} onClick={() => hide(s.key)}>✕</Button>
            </>}
          </Group>
        ))}
      </Group>
      {edit && hiddenDefs.length > 0 && (
        <Group mt="xs" gap="xs" wrap="wrap">
          <Text size="xs" c="dimmed">Ausgeblendet:</Text>
          {hiddenDefs.map((s) => <Button key={s.key} size="compact-xs" variant="light" onClick={() => show(s.key)}>+ {s.label}</Button>)}
        </Group>
      )}

      <Title order={5} mt="xl">Berichte &amp; Stammdaten</Title>
      <Group mt="xs" gap="xl" align="flex-start" wrap="wrap">
        {card("Vertrieb", [{ label: "Firmen/Kunden", navKey: "companies" }, { label: "Leads", navKey: "leads" }, { label: "Verkaufschancen", navKey: "opportunities" }, { label: "Angebote", navKey: "quotes" }, { label: "Aufträge", navKey: "orders" }])}
        {card("Beschaffung", [{ label: "Lieferanten", navKey: "suppliers" }, { label: "Eingangsrechnungen", navKey: "incoming" }, { label: "Nachbestellung", navKey: "reorder" }, { label: "Muster-Leihgut", navKey: "samples" }, { label: "Lager & Inventur", navKey: "lager" }])}
        {card("Finanzen", [{ label: "Mahnwesen", navKey: "dunning" }, { label: "Banking", navKey: "banking" }, { label: "Auswertungen", navKey: "reporting" }, { label: "GoBD-Archiv", navKey: "archive" }, { label: "Kostenstellen", navKey: "costcenters" }])}
        {card("Produktion & System", [{ label: "Produktions-Reporting", navKey: "prodreport" }, { label: "Fremdvergabe", navKey: "subproduction" }, { label: "Automationen", navKey: "automation" }, { label: "Einstellungen", navKey: "admin" }, { label: "Personalwesen", navKey: "hr" }])}
      </Group>
    </>
  );
}
