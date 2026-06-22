// Navigations-Gerüst: Auth-Gate + AppShell mit gruppierter Sidebar über ALLE Module
// (alles durchklickbar). Jede Sektion ist eine Seite gegen die echten tRPC-Endpunkte.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppShell, Badge, Box, Button, Group, Loader, NavLink, Paper, ScrollArea, Text, TextInput, Title } from "@mantine/core";
import { Login } from "./Login.js";
import { Dashboard } from "./Dashboard.js";
import { Reporting } from "./Reporting.js";
import { Differentiators } from "./Differentiators.js";
import { Banking } from "./Banking.js";
import {
  CompaniesPage, CostCentersPage, DunningPage, InquiriesPage, IncomingInvoicesPage, LeadsPage, OrdersPage, ProcurementPage, ProductionReportingPage,
  ProductsPage, PricingPage, QuotesPage, ReklamationPage, ReorderPage, SampleLoansPage, ShipmentsPage, SubproductionPage, SuppliersPage,
} from "./pages.js";
import { trpc } from "./trpc.js";

interface AuthUser { id: string; email: string; name: string; role: string; totpEnabled: boolean; }

const NAV: ReadonlyArray<{ group: string; items: ReadonlyArray<{ key: string; label: string }> }> = [
  { group: "Übersicht", items: [{ key: "dashboard", label: "Dashboard" }] },
  { group: "Vertrieb", items: [{ key: "companies", label: "Firmen/Kunden" }, { key: "leads", label: "Leads" }, { key: "inquiries", label: "Anfragen" }, { key: "quotes", label: "Angebote" }, { key: "orders", label: "Aufträge" }, { key: "reklamation", label: "Reklamation" }] },
  { group: "Beschaffung", items: [
    { key: "suppliers", label: "Lieferanten" }, { key: "incoming", label: "Eingangsrechnungen" },
    { key: "procurement", label: "Beschaffung" }, { key: "reorder", label: "Nachbestellung" },
    { key: "samples", label: "Muster-Leihgut" },
  ] },
  { group: "Stammdaten", items: [{ key: "products", label: "Artikel/Varianten" }, { key: "pricing", label: "Preise/Staffel" }] },
  { group: "Produktion", items: [{ key: "differentiators", label: "Differenzierer" }, { key: "subproduction", label: "Fremdvergabe" }, { key: "prodreport", label: "Produktions-Reporting" }] },
  { group: "Logistik & Finanzen", items: [
    { key: "shipments", label: "Versand" }, { key: "dunning", label: "Mahnwesen" },
    { key: "banking", label: "Banking" }, { key: "costcenters", label: "Kostenstellen" },
    { key: "reporting", label: "Auswertungen" },
  ] },
];
const ALL_KEYS = NAV.flatMap((g) => g.items.map((i) => i.key));
const hashKey = (): string => {
  const h = typeof location !== "undefined" ? location.hash.replace("#", "") : "";
  return ALL_KEYS.includes(h) ? h : "dashboard";
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

const activeLabel = (k: string): string => NAV.flatMap((g) => g.items).find((i) => i.key === k)?.label ?? "";

// Globale Suche (G-6): entitätsübergreifende Suchbox im Header; Treffer navigieren
// zum jeweiligen Modul (navKey). Ab 2 Zeichen.
function GlobalSearch({ onNavigate }: { onNavigate: (k: string) => void }): JSX.Element {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof trpc.search.global.query>>>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    let cancelled = false;
    void trpc.search.global.query({ query: q }).then((r) => { if (!cancelled) { setHits(r); setOpen(true); } }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [q]);
  return (
    <Box style={{ position: "relative", width: 340 }}>
      <TextInput size="xs" placeholder="Suche: Firma, Auftrag, Artikel, Lead…" value={q}
        onChange={(e) => setQ(e.currentTarget.value)} onFocus={() => hits.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && hits.length > 0 && (
        <Paper shadow="md" withBorder style={{ position: "absolute", top: 32, left: 0, right: 0, zIndex: 300, maxHeight: 340, overflowY: "auto" }}>
          {hits.map((h) => (
            <Box key={`${h.entity}-${h.id}`} px="sm" py={6} style={{ cursor: "pointer" }}
              onMouseDown={(e) => { e.preventDefault(); onNavigate(h.navKey); setOpen(false); setQ(""); }}>
              <Text size="sm"><Badge size="xs" variant="light" mr={6}>{h.entity}</Badge>{h.label}
                {h.sub ? <Text span c="dimmed" size="xs"> · {h.sub}</Text> : null}</Text>
            </Box>
          ))}
        </Paper>
      )}
    </Box>
  );
}

function Shell({ user, onLogout }: { user: AuthUser; onLogout: () => Promise<void> }): JSX.Element {
  const [active, setActiveState] = useState<string>(hashKey);
  const setActive = useCallback((k: string) => {
    setActiveState(k);
    if (typeof location !== "undefined") location.hash = k;
  }, []);

  // Genauer Seitentitel je Bereich (Web Interface Guidelines: accurate page titles).
  useEffect(() => {
    if (typeof document !== "undefined") document.title = `TEXMA ERP · ${activeLabel(active)}`;
  }, [active]);

  return (
    <AppShell header={{ height: 52 }} navbar={{ width: 240, breakpoint: "xs" }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Box w={22} h={22} style={{ borderRadius: 6, background: "var(--erp-focus)" }} aria-hidden />
            <Title order={4}>TEXMA&nbsp;ERP</Title>
            <Badge size="sm" color="amber">Demo</Badge>
          </Group>
          <GlobalSearch onNavigate={setActive} />
          <Group gap="sm">
            <Text size="sm" c="dimmed">{user.name} · {user.role}</Text>
            <Button variant="default" size="xs" onClick={() => void onLogout()}>Abmelden</Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs" style={{ background: "var(--erp-surface)" }}>
        <ScrollArea type="scroll">
          {NAV.map((g) => (
            <Box key={g.group} mb={6}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="xs" mt="sm" mb={4} style={{ letterSpacing: 0.4 }}>{g.group}</Text>
              {g.items.map((i) => (
                <NavLink key={i.key} label={i.label} active={active === i.key} variant="light" color="navy"
                  onClick={() => setActive(i.key)} style={{ borderRadius: 6 }} />
              ))}
            </Box>
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
    case "dashboard": return <Dashboard />;
    case "orders": return <OrdersPage role={role} />;
    case "companies": return <CompaniesPage />;
    case "leads": return <LeadsPage />;
    case "inquiries": return <InquiriesPage />;
    case "quotes": return <QuotesPage />;
    case "reklamation": return <ReklamationPage />;
    case "suppliers": return <SuppliersPage />;
    case "incoming": return <IncomingInvoicesPage />;
    case "procurement": return <ProcurementPage />;
    case "reorder": return <ReorderPage />;
    case "samples": return <SampleLoansPage />;
    case "products": return <ProductsPage />;
    case "pricing": return <PricingPage />;
    case "differentiators": return <Differentiators role={role} />;
    case "subproduction": return <SubproductionPage />;
    case "prodreport": return <ProductionReportingPage />;
    case "shipments": return <ShipmentsPage />;
    case "dunning": return <DunningPage />;
    case "banking": return <Banking role={role} />;
    case "costcenters": return <CostCentersPage />;
    case "reporting": return <Reporting role={role} />;
    default: return <Text>Unbekannter Bereich.</Text>;
  }
}
