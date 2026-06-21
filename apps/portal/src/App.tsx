// Kundenportal (B13): Login + read-only Auftragsstatus der eigenen Firma. Bewusst
// schlank — die Mandanten-Isolation erzwingt die API (companyId aus der Session).

import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  PasswordInput,
  Paper,
  Stack,
  Table,
  TextInput,
  Title,
} from "@mantine/core";
import { portal } from "./trpc.js";

interface Me {
  email: string;
  companyId: string;
}

type Order = Awaited<ReturnType<typeof portal.myOrders.query>>[number];

const fmtDate = (v: Order["zugesagterLiefertermin"]): string =>
  v ? new Date(v as unknown as string).toLocaleDateString("de-DE") : "—";

const statusColor = (s: string): string =>
  s === "VERSENDET" || s === "FAKTURIERT" || s === "ABGESCHLOSSEN"
    ? "green"
    : s === "STORNIERT"
      ? "red"
      : "blue";

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const m = await portal.me.query();
      setMe(m);
      setOrders(await portal.myOrders.query());
    } catch {
      setMe(null);
      setOrders(null);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (checking) {
    return (
      <Container py="xl">
        <Loader />
      </Container>
    );
  }

  if (!me) {
    return <LoginForm onSuccess={refresh} error={error} setError={setError} />;
  }

  return (
    <Container size="md" py="xl">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Meine Aufträge</Title>
        <Group>
          <span>{me.email}</span>
          <Button
            variant="light"
            onClick={async () => {
              await portal.logout.mutate();
              setMe(null);
              setOrders(null);
            }}
          >
            Abmelden
          </Button>
        </Group>
      </Group>

      {orders && orders.length === 0 && <Alert color="gray">Keine Aufträge vorhanden.</Alert>}
      {orders && orders.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Auftrag</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Zugesagter Liefertermin</Table.Th>
              <Table.Th>Sendungsverfolgung</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {orders.map((o) => (
              <Table.Tr key={o.number}>
                <Table.Td>{o.number}</Table.Td>
                <Table.Td>
                  <Badge color={statusColor(o.status)}>{o.status}</Badge>
                </Table.Td>
                <Table.Td>{fmtDate(o.zugesagterLiefertermin)}</Table.Td>
                <Table.Td>{o.trackingNumber ?? "—"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Container>
  );
}

function LoginForm({
  onSuccess,
  error,
  setError,
}: {
  onSuccess: () => Promise<void>;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Container size={420} py="xl">
      <Title order={2} ta="center" mb="lg">
        TEXMA Kundenportal
      </Title>
      <Paper withBorder shadow="sm" p="xl" radius="md">
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput label="E-Mail" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          <PasswordInput label="Passwort" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await portal.login.mutate({ email, password });
                await onSuccess();
              } catch {
                setError("Anmeldung fehlgeschlagen.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Anmelden
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
