// Navigations-Gerüst: Auth-Gate + AppShell mit gruppierter Sidebar über ALLE Module
// (alles durchklickbar). Jede Sektion ist eine Seite gegen die echten tRPC-Endpunkte.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppShell, Badge, Button, Group, Loader, NavLink, ScrollArea, Text, Title } from "@mantine/core";
import { Login } from "./Login.js";
import { Reporting } from "./Reporting.js";
import { Differentiators } from "./Differentiators.js";
import { Banking } from "./Banking.js";
import {
  CostCentersPage, DunningPage, IncomingInvoicesPage, LeadsPage, ListPage, ProcurementPage, ProductionReportingPage,
  ReklamationPage, ReorderPage, ShipmentsPage, SuppliersPage,
} from "./pages.js";
import { trpc } from "./trpc.js";

interface AuthUser { id: string; email: string; name: string; role: string; totpEnabled: boolean; }

const NAV: ReadonlyArray<{ group: string; items: ReadonlyArray<{ key: string; label: string }> }> = [
  { group: "Vertrieb", items: [{ key: "leads", label: "Leads" }, { key: "orders", label: "Aufträge" }, { key: "reklamation", label: "Reklamation" }] },
  { group: "Beschaffung", items: [
    { key: "suppliers", label: "Lieferanten" }, { key: "incoming", label: "Eingangsrechnungen" },
    { key: "procurement", label: "Beschaffung" }, { key: "reorder", label: "Nachbestellung" },
  ] },
  { group: "Produktion", items: [{ key: "differentiators", label: "Differenzierer" }, { key: "prodreport", label: "Produktions-Reporting" }] },
  { group: "Logistik & Finanzen", items: [
    { key: "shipments", label: "Versand" }, { key: "dunning", label: "Mahnwesen" },
    { key: "banking", label: "Banking" }, { key: "costcenters", label: "Kostenstellen" },
    { key: "reporting", label: "Auswertungen" },
  ] },
];
const ALL_KEYS = NAV.flatMap((g) => g.items.map((i) => i.key));
const hashKey = (): string => {
  const h = typeof location !== "undefined" ? location.hash.replace("#", "") : "";
  return ALL_KEYS.includes(h) ? h : "orders";
};

export function App(): JSX.Element {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const loadMe = useCallback(async () => {
    try { setUser((await trpc.auth.me.query()) as AuthUser); } catch { setUser(null); }
  }, []);
  useEffect(() => { void loadMe(); }, [loadMe]);

  if (user === undefined) return <Group p="md" gap="xs"><Loader size="sm" /><Text>lädt…</Text></Group>;
  if (!user) return <Login onAuthed={loadMe} />;
  return <Shell user={user} onLogout={async () => { await trpc.auth.logout.mutate(); setUser(null); }} />;
}

function Shell({ user, onLogout }: { user: AuthUser; onLogout: () => Promise<void> }): JSX.Element {
  const [active, setActiveState] = useState<string>(hashKey);
  const setActive = useCallback((k: string) => {
    setActiveState(k);
    if (typeof location !== "undefined") location.hash = k;
  }, []);

  return (
    <AppShell header={{ height: 52 }} navbar={{ width: 230, breakpoint: "xs" }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs"><Title order={4}>TEXMA ERP</Title><Badge variant="light" size="sm">Demo</Badge></Group>
          <Group gap="xs">
            <Text size="sm" c="dimmed">{user.name} ({user.role})</Text>
            <Button variant="subtle" size="xs" onClick={() => void onLogout()}>Abmelden</Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <ScrollArea>
          {NAV.map((g) => (
            <div key={g.group} style={{ marginBottom: 8 }}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="xs" mt="xs" mb={2}>{g.group}</Text>
              {g.items.map((i) => (
                <NavLink key={i.key} label={i.label} active={active === i.key} onClick={() => setActive(i.key)} />
              ))}
            </div>
          ))}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
        <Page k={active} role={user.role} />
      </AppShell.Main>
    </AppShell>
  );
}

function Page({ k, role }: { k: string; role: string }): ReactNode {
  switch (k) {
    case "orders": return <ListPage title="Auftrags-Eingang"
      hint={role === "PRODUKTION" ? "Rolle PRODUKTION: Preise/Kundendaten ausgeblendet (Kap. 12)." : "Shop-Bestellungen der Firma zugeordnet (T-01)."}
      load={() => trpc.shopOrders.list.query({ limit: 100 }) as Promise<Record<string, unknown>[]>} hide={["rawPayload"]} />;
    case "leads": return <LeadsPage />;
    case "reklamation": return <ReklamationPage />;
    case "suppliers": return <SuppliersPage />;
    case "incoming": return <IncomingInvoicesPage />;
    case "procurement": return <ProcurementPage />;
    case "reorder": return <ReorderPage />;
    case "differentiators": return <Differentiators role={role} />;
    case "prodreport": return <ProductionReportingPage />;
    case "shipments": return <ShipmentsPage />;
    case "dunning": return <DunningPage />;
    case "banking": return <Banking role={role} />;
    case "costcenters": return <CostCentersPage />;
    case "reporting": return <Reporting role={role} />;
    default: return <Text>Unbekannter Bereich.</Text>;
  }
}
