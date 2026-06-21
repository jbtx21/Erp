// Auth-Gate + Auftrags-Eingang (Slice T-01). Zeigt, dass Rolle PRODUKTION keine
// Preise/Kundendaten sieht (serverseitig redigiert). UI: Mantine (erp-ui-design).
import { useCallback, useEffect, useState } from "react";
import { Button, Container, Group, Loader, Table, Tabs, Text, Title } from "@mantine/core";
import { Login } from "./Login.js";
import { Reporting } from "./Reporting.js";
import { Differentiators } from "./Differentiators.js";
import { Banking } from "./Banking.js";
import { trpc } from "./trpc.js";
import { euro, numTd } from "./theme.js";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  totpEnabled: boolean;
}

interface OrderRow {
  id: string;
  number: string;
  companyId: string;
  externalNumber: string | null;
  employeeNote: string | null;
  totalNetCents: number | null;
}

export function App(): JSX.Element {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined); // undefined = lädt

  const loadMe = useCallback(async () => {
    try {
      setUser((await trpc.auth.me.query()) as AuthUser);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  if (user === undefined)
    return (
      <Container size="lg" py="md">
        <Group gap="xs"><Loader size="sm" /> <Text>lädt…</Text></Group>
      </Container>
    );
  if (!user) return <Login onAuthed={loadMe} />;
  return <Orders user={user} onLogout={async () => { await trpc.auth.logout.mutate(); setUser(null); }} />;
}

type Tab = "orders" | "differentiators" | "banking" | "reporting";
const TABS: readonly Tab[] = ["orders", "differentiators", "banking", "reporting"];
const hashTab = (): Tab => {
  const h = (typeof location !== "undefined" ? location.hash.replace("#", "") : "") as Tab;
  return TABS.includes(h) ? h : "orders";
};

function Orders({ user, onLogout }: { user: AuthUser; onLogout: () => Promise<void> }): JSX.Element {
  const [tab, setTabState] = useState<Tab>(hashTab);
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    if (typeof location !== "undefined") location.hash = t; // teilbarer Deep-Link je Tab
  }, []);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      setOrders((await trpc.shopOrders.list.query({ limit: 50 })) as OrderRow[]);
    } catch (err) {
      setStatus(`Fehler: ${(err as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Container size="lg" py="md">
      <Group justify="space-between" align="center">
        <Title order={2}>TEXMA ERP</Title>
        <Group gap="xs">
          <Text size="sm" c="dimmed">{user.name} ({user.role})</Text>
          <Button variant="subtle" size="xs" onClick={() => void onLogout()}>Abmelden</Button>
        </Group>
      </Group>

      <Tabs value={tab} onChange={(v) => v && setTab(v as Tab)} mt="sm">
        <Tabs.List>
          <Tabs.Tab value="orders">Aufträge</Tabs.Tab>
          <Tabs.Tab value="differentiators">Differenzierer</Tabs.Tab>
          <Tabs.Tab value="banking">Banking</Tabs.Tab>
          <Tabs.Tab value="reporting">Auswertungen</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {/* Nur den aktiven Tab mounten: inaktive Ansichten sollen keine Queries feuern
          (sonst batcht der tRPC-Client fremde Endpunkte mit — und ein Fehler reißt
          die ganze Antwort mit). */}
      <div style={{ paddingTop: "1rem" }}>
        {tab === "orders" && <OrdersTable orders={orders} status={status} role={user.role} onReload={load} />}
        {tab === "differentiators" && <Differentiators role={user.role} />}
        {tab === "banking" && <Banking role={user.role} />}
        {tab === "reporting" && <Reporting role={user.role} />}
      </div>
    </Container>
  );
}

function OrdersTable({ orders, status, role, onReload }: { orders: OrderRow[]; status: string; role: string; onReload: () => Promise<void> }): JSX.Element {
  return (
    <>
      <Title order={3}>Auftrags-Eingang</Title>
      <Text size="sm" c="dimmed" mb="xs">
        {role === "PRODUKTION"
          ? "Rolle PRODUKTION: Preise/Kundendaten sind serverseitig ausgeblendet (Kap. 12)."
          : "Shop-Bestellungen werden der Firma zugeordnet (T-01)."}
      </Text>
      <Button variant="default" size="xs" onClick={() => void onReload()}>Aktualisieren</Button>
      {status && <Text size="sm" mt="xs"><em>{status}</em></Text>}
      <Table striped highlightOnHover withTableBorder mt="sm" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Auftrag</Table.Th>
            <Table.Th>Shop-Nr.</Table.Th>
            <Table.Th>Firma</Table.Th>
            <Table.Th ta="right">Auftragswert</Table.Th>
            <Table.Th>Mitarbeiter (Vermerk)</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {orders.map((o) => (
            <Table.Tr key={o.id}>
              <Table.Td>{o.number}</Table.Td>
              <Table.Td>{o.externalNumber ?? "—"}</Table.Td>
              <Table.Td>{o.companyId}</Table.Td>
              <Table.Td style={numTd}>{euro(o.totalNetCents)}</Table.Td>
              <Table.Td>{o.employeeNote ?? "—"}</Table.Td>
            </Table.Tr>
          ))}
          {orders.length === 0 && (
            <Table.Tr><Table.Td colSpan={5}>Keine Aufträge.</Table.Td></Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </>
  );
}
