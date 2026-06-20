// Bank-Anbindung (Kap. 9): EBICS/PSD2-Verbindungen verwalten, Kontoauszüge abrufen (AIS →
// Matching-Pipeline) und SEPA-Überweisungen auslösen (PIS, pain.001). Eine Provider-
// Abstraktion im Backend kapselt die Unterschiede; hier die Bedienoberfläche dazu.
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Group, NumberInput, Select, Table, Text, TextInput, Title } from "@mantine/core";
import { ibanIsValid } from "@texma/shared/pain001";
import { trpc } from "./trpc.js";
import { euro, numTd } from "./theme.js";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Consent = { ok: boolean; note: string; validUntil: string | null };
type Connection = {
  id: string; name: string; kind: "EBICS" | "PSD2"; iban: string; bic: string | null;
  debtorName: string; consent: Consent; lastSyncAt: string | null; createdAt: string;
};
type Transfer = { creditorName: string; creditorIban: string; creditorBic?: string | null; amountCents: number; remittance: string };
type Order = {
  id: string; connectionId: string; connectionName: string; messageId: string;
  status: "DRAFT" | "SUBMITTED" | "EXECUTED" | "REJECTED"; totalCents: number;
  requestedExecutionDate: string; providerRef: string | null; submittedAt: string | null; createdAt: string;
  transfers: Transfer[];
};
type Payable = { id: string; number: string; supplierName: string; creditorIban: string | null; creditorBic: string | null; grossCents: number };

const fmtDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString("de-DE") : "—");
const ORDER_COLOR: Record<Order["status"], string> = { DRAFT: "gray", SUBMITTED: "blue", EXECUTED: "teal", REJECTED: "red" };

export function Banking({ role }: { role: string }): JSX.Element {
  if (role === "PRODUKTION") {
    return (
      <Card withBorder mt="md" padding="md">
        <Title order={3}>Banking (Kap. 9)</Title>
        <Text size="sm" c="dimmed" mt="xs">
          Bank-Anbindung und Zahlungsverkehr sind finanz-sensibel und für die Rolle PRODUKTION ausgeblendet.
        </Text>
      </Card>
    );
  }
  return (
    <>
      <Title order={3} mt="md">Banking — Bank-Anbindung (Kap. 9)</Title>
      <Text size="sm" c="dimmed">
        Zwei Wege hinter einer Abstraktion: <b>EBICS</b> (zertifikatsbasiert, CAMT.053, keine
        90-Tage-Re-Auth) und <b>PSD2/XS2A</b> (Transaktions-API, 90-Tage-SCA). Beide speisen den
        Auszugs-Abgleich; Überweisungen gehen als pain.001 (PIS) hinaus.
      </Text>
      <Connections />
      <Payments />
    </>
  );
}

// ── Bank-Verbindungen: anlegen + Auszüge abrufen (AIS) ──────────────────────────
function Connections(): JSX.Element {
  const [conns, setConns] = useState<Connection[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"EBICS" | "PSD2">("EBICS");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [debtorName, setDebtorName] = useState("");
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      setConns(await trpc.banking.connections.list.query());
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  const create = useCallback(async () => {
    setErr("");
    setStatus("");
    try {
      await trpc.banking.connections.create.mutate({ name, kind, iban, bic: bic || undefined, debtorName });
      await load();
      setStatus(`Verbindung „${name}" angelegt.`);
      setName(""); setIban(""); setBic(""); setDebtorName("");
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [name, kind, iban, bic, debtorName, load]);

  const sync = useCallback(async (id: string) => {
    setErr("");
    setStatus("");
    try {
      const res = await trpc.banking.connections.sync.mutate({ connectionId: id });
      const r = res.result;
      setStatus(`Sync „${res.connection.name}": ${r.imported} importiert, ${r.matched} zugeordnet, ${r.clarified} zur Klärung, ${r.skipped} übersprungen.`);
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [load]);

  const ibanOk = iban === "" || ibanIsValid(iban);

  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>Bank-Verbindungen</Title>
      <Table withTableBorder mt="sm" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Bezeichnung</Table.Th>
            <Table.Th>Art</Table.Th>
            <Table.Th>IBAN</Table.Th>
            <Table.Th>Zustimmung</Table.Th>
            <Table.Th>Letzter Sync</Table.Th>
            <Table.Th ta="right">Aktion</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {conns.map((c) => (
            <Table.Tr key={c.id}>
              <Table.Td>{c.name}</Table.Td>
              <Table.Td><Badge variant="light" color={c.kind === "EBICS" ? "indigo" : "grape"}>{c.kind}</Badge></Table.Td>
              <Table.Td><Text size="xs" ff="monospace">{c.iban}</Text></Table.Td>
              <Table.Td>
                <Badge variant="light" color={c.consent.ok ? "teal" : "red"} title={c.consent.note}>
                  {c.consent.ok ? "gültig" : "abgelaufen"}
                </Badge>
                {c.consent.validUntil && <Text span size="xs" c="dimmed"> bis {fmtDate(c.consent.validUntil)}</Text>}
              </Table.Td>
              <Table.Td>{fmtDate(c.lastSyncAt)}</Table.Td>
              <Table.Td ta="right">
                <Button size="compact-xs" variant="default" onClick={() => void sync(c.id)} disabled={!c.consent.ok}>Auszug abrufen</Button>
              </Table.Td>
            </Table.Tr>
          ))}
          {conns.length === 0 && (
            <Table.Tr><Table.Td colSpan={6}><Text size="sm" c="dimmed">Noch keine Verbindungen.</Text></Table.Td></Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Group align="end" gap="sm" mt="md">
        <TextInput label="Bezeichnung" w={170} value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <Select label="Art" w={110} data={["EBICS", "PSD2"]} value={kind} onChange={(v) => setKind((v as "EBICS" | "PSD2") ?? "EBICS")} />
        <TextInput label="IBAN (eigenes Konto)" w={230} value={iban} onChange={(e) => setIban(e.currentTarget.value)}
          error={!ibanOk && "IBAN ungültig"} />
        <TextInput label="BIC" w={120} value={bic} onChange={(e) => setBic(e.currentTarget.value)} />
        <TextInput label="Kontoinhaber" w={170} value={debtorName} onChange={(e) => setDebtorName(e.currentTarget.value)} />
        <Button onClick={() => void create()} disabled={!name || !iban || !debtorName || !ibanOk}>Verbindung anlegen</Button>
      </Group>
      {status && <Text size="sm" c="dimmed" mt="xs">{status}</Text>}
      {err && <Text c="red" size="sm" mt="xs">Fehler: {err}</Text>}
    </Card>
  );
}

// ── SEPA-Überweisungen (PIS): Auftrag erfassen + einreichen ─────────────────────
interface TransferRow { creditorName: string; creditorIban: string; amountEuro: number; remittance: string }

function Payments(): JSX.Element {
  const [conns, setConns] = useState<Connection[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [execDate, setExecDate] = useState(new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10));
  const [rows, setRows] = useState<TransferRow[]>([{ creditorName: "", creditorIban: "", amountEuro: 0, remittance: "" }]);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, o, p] = await Promise.all([
        trpc.banking.connections.list.query(),
        trpc.banking.payments.list.query(),
        trpc.banking.payments.payableInvoices.query(),
      ]);
      setConns(c);
      setOrders(o);
      setPayables(p);
      setConnectionId((prev) => prev ?? c[0]?.id ?? null);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  const setRow = (i: number, patch: Partial<TransferRow>) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { creditorName: "", creditorIban: "", amountEuro: 0, remittance: "" }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const addPayable = (p: Payable) =>
    setRows((prev) => [...prev.filter((r) => r.creditorName || r.creditorIban || r.amountEuro || r.remittance),
      { creditorName: p.supplierName, creditorIban: p.creditorIban ?? "", amountEuro: p.grossCents / 100, remittance: p.number }]);

  const totalCents = rows.reduce((s, r) => s + Math.round((r.amountEuro || 0) * 100), 0);
  const allValid = rows.length > 0 && rows.every((r) => r.creditorName && ibanIsValid(r.creditorIban) && r.amountEuro > 0);

  const create = useCallback(async () => {
    setErr("");
    setStatus("");
    if (!connectionId) { setErr("Bitte eine Verbindung wählen."); return; }
    try {
      const order = await trpc.banking.payments.create.mutate({
        connectionId,
        requestedExecutionDate: execDate,
        transfers: rows.map((r) => ({ creditorName: r.creditorName, creditorIban: r.creditorIban, amountCents: Math.round(r.amountEuro * 100), remittance: r.remittance })),
      });
      setStatus(`Auftrag ${order.messageId} angelegt (${euro(order.totalCents)}).`);
      setRows([{ creditorName: "", creditorIban: "", amountEuro: 0, remittance: "" }]);
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [connectionId, execDate, rows, load]);

  const submit = useCallback(async (id: string) => {
    setErr("");
    setStatus("");
    try {
      const o = await trpc.banking.payments.submit.mutate({ orderId: id });
      setStatus(`Auftrag ${o.messageId}: ${o.status}${o.providerRef ? ` (${o.providerRef})` : ""}.`);
      await load();
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [load]);

  return (
    <Card withBorder mt="md" padding="md">
      <Title order={4}>SEPA-Überweisungen (PIS)</Title>
      <Text size="sm" c="dimmed">
        Überweisungen werden als pain.001 erzeugt und über die gewählte Verbindung (EBICS CCT /
        PSD2 PIS) eingereicht. Empfänger frei erfassen oder aus offenen, geprüften Rechnungen übernehmen.
      </Text>

      {payables.length > 0 && (
        <Group gap="xs" mt="xs">
          <Text size="sm" c="dimmed">Offene Rechnungen:</Text>
          {payables.map((p) => (
            <Button key={p.id} size="compact-xs" variant="light" onClick={() => addPayable(p)}>
              + {p.supplierName} {euro(p.grossCents)}
            </Button>
          ))}
        </Group>
      )}

      <Group align="end" gap="sm" mt="sm">
        <Select label="Verbindung" w={220} data={conns.map((c) => ({ value: c.id, label: `${c.name} (${c.kind})` }))}
          value={connectionId} onChange={setConnectionId} />
        <TextInput label="Ausführungsdatum" w={150} value={execDate} onChange={(e) => setExecDate(e.currentTarget.value)} placeholder="YYYY-MM-DD" />
      </Group>

      <Table withTableBorder mt="sm" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Empfänger</Table.Th>
            <Table.Th>IBAN</Table.Th>
            <Table.Th ta="right">Betrag (€)</Table.Th>
            <Table.Th>Verwendungszweck</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r, i) => {
            const ibanBad = r.creditorIban !== "" && !ibanIsValid(r.creditorIban);
            return (
              <Table.Tr key={i}>
                <Table.Td><TextInput size="xs" w={170} value={r.creditorName} onChange={(e) => setRow(i, { creditorName: e.currentTarget.value })} /></Table.Td>
                <Table.Td><TextInput size="xs" w={230} value={r.creditorIban} error={ibanBad} onChange={(e) => setRow(i, { creditorIban: e.currentTarget.value })} /></Table.Td>
                <Table.Td style={numTd}><NumberInput size="xs" w={110} hideControls min={0} step={0.01} decimalScale={2} value={r.amountEuro} onChange={(v) => setRow(i, { amountEuro: Number(v) || 0 })} /></Table.Td>
                <Table.Td><TextInput size="xs" w={180} value={r.remittance} onChange={(e) => setRow(i, { remittance: e.currentTarget.value })} /></Table.Td>
                <Table.Td ta="right"><Button size="compact-xs" variant="subtle" color="red" onClick={() => removeRow(i)}>✕</Button></Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Group mt="sm" justify="space-between">
        <Button size="xs" variant="default" onClick={addRow}>+ Empfänger</Button>
        <Group gap="sm">
          <Text size="sm">Summe: <b>{euro(totalCents)}</b></Text>
          <Button onClick={() => void create()} disabled={!connectionId || !allValid}>Auftrag anlegen</Button>
        </Group>
      </Group>
      {status && <Text size="sm" c="dimmed" mt="xs">{status}</Text>}
      {err && <Text c="red" size="sm" mt="xs">Fehler: {err}</Text>}

      <Title order={5} mt="lg">Zahlungsaufträge</Title>
      <Table withTableBorder mt="xs" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>MsgId</Table.Th>
            <Table.Th>Verbindung</Table.Th>
            <Table.Th ta="right">Posten</Table.Th>
            <Table.Th ta="right">Summe</Table.Th>
            <Table.Th>Ausführung</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th ta="right">Aktion</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {orders.map((o) => (
            <Table.Tr key={o.id}>
              <Table.Td><Text size="xs" ff="monospace">{o.messageId}</Text></Table.Td>
              <Table.Td>{o.connectionName}</Table.Td>
              <Table.Td ta="right">{o.transfers.length}</Table.Td>
              <Table.Td style={numTd}>{euro(o.totalCents)}</Table.Td>
              <Table.Td>{o.requestedExecutionDate}</Table.Td>
              <Table.Td>
                <Badge variant="light" color={ORDER_COLOR[o.status]} title={o.providerRef ?? ""}>{o.status}</Badge>
              </Table.Td>
              <Table.Td ta="right">
                {o.status === "DRAFT"
                  ? <Button size="compact-xs" onClick={() => void submit(o.id)}>Einreichen</Button>
                  : <Text size="xs" c="dimmed">{o.providerRef ?? "—"}</Text>}
              </Table.Td>
            </Table.Tr>
          ))}
          {orders.length === 0 && (
            <Table.Tr><Table.Td colSpan={7}><Text size="sm" c="dimmed">Noch keine Aufträge.</Text></Table.Td></Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Card>
  );
}
