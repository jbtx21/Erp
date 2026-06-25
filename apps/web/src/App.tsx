// Navigations-Gerüst: Auth-Gate + AppShell mit gruppierter Sidebar über ALLE Module
// (alles durchklickbar). Jede Sektion ist eine Seite gegen die echten tRPC-Endpunkte.
import { useCallback, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ActionIcon, AppShell, Badge, Box, Button, Collapse, Group, HoverCard, Kbd, Loader, Modal, NavLink, Paper, ScrollArea, Stack, Text, TextInput, Title, Tooltip, UnstyledButton } from "@mantine/core";
import { Chevron, NavIcon, SidebarToggleIcon, type NavIconName } from "./nav-icons.js";
import { Login } from "./Login.js";
import { Dashboard } from "./Dashboard.js";
import { StatusAmpelPage } from "./StatusAmpel.js";
import { SammelbestellungPage } from "./Sammelbestellung.js";
import { Reporting } from "./Reporting.js";
import { Banking } from "./Banking.js";
import {
  CompaniesPage, CallLogsPage, CostCentersPage, DunningPage, InquiriesPage, IncomingInvoicesPage, LeadsPage, MailAccountsPage, OrdersPage, ProcurementPage, ProductionReportingPage,
  ProductsPage, PricingPage, EmailTemplatesPage, DashboardsPage, DataIoPage, EanImportPage, FinanceReportingPage, WareneingangPage, ZahlungenPage, NewsletterPage, OpportunitiesPage, CalendarPage, MessagesPage, AdminPage, ArchivePage, AuditLogPage, AutomationPage, TasksPage, HomePage, LagerPage, HrPage, IntegrationsPage, SecurityPage, QuotesPage, ReklamationPage, ReorderPage, SampleLoansPage, ShipmentsPage, SubproductionPage, SuppliersPage,
  LogosPage, AufschlagPage, AusschreibungenPage, NachkalkulationPage, GuVReportPage, GutscheinePage,
} from "./pages.js";
import { trpc } from "./trpc.js";

interface AuthUser { id: string; email: string; name: string; role: string; totpEnabled: boolean; }

// Modul-Navigation nach ERPNext/Frappe-Taxonomie (Workspaces als Sektionen): Start,
// CRM, Vertrieb, Einkauf, Lager, Fertigung, Buchhaltung, Personalwesen, Einstellungen.
// Jede Sektion ist einzeln aufklappbar; die ganze Leiste klappt zur Icon-Schiene ein.
const NAV: ReadonlyArray<{ group: string; icon: NavIconName; items: ReadonlyArray<{ key: string; label: string }> }> = [
  { group: "Start", icon: "uebersicht", items: [{ key: "home", label: "Start" }, { key: "dashboard", label: "Termin-Ampel" }, { key: "statusampel", label: "Status-Ampel" }, { key: "dashboards", label: "Meine Dashboards" }, { key: "calendar", label: "Kalender" }, { key: "tasks", label: "Meine Aufgaben" }, { key: "messages", label: "Nachrichten" }] },
  { group: "CRM", icon: "crm", items: [{ key: "leads", label: "Leads" }, { key: "opportunities", label: "Verkaufschancen" }, { key: "calllogs", label: "Anrufliste" }, { key: "inquiries", label: "Anfragen" }, { key: "newsletter", label: "Newsletter" }] },
  { group: "Vertrieb", icon: "vertrieb", items: [{ key: "companies", label: "Kunden" }, { key: "quotes", label: "Angebote" }, { key: "orders", label: "Aufträge" }, { key: "sammelbestellungen", label: "Sammelbestellungen" }, { key: "pricing", label: "Preise/Staffel" }, { key: "reklamation", label: "Reklamation" }] },
  { group: "Einkauf", icon: "beschaffung", items: [
    { key: "suppliers", label: "Lieferanten" }, { key: "procurement", label: "Beschaffung" },
    { key: "reorder", label: "Nachbestellung" }, { key: "ausschreibungen", label: "Stickerei-Ausschreibungen" }, { key: "incoming", label: "Eingangsrechnungen" },
  ] },
  { group: "Lager", icon: "lager", items: [
    { key: "products", label: "Artikel/Varianten" }, { key: "logos", label: "Logos & Stickerei" }, { key: "lager", label: "Lager & Inventur" },
    { key: "wareneingang", label: "Wareneingang" }, { key: "samples", label: "Muster-Leihgut" }, { key: "shipments", label: "Versand" }, { key: "eanimport", label: "EAN-Listen-Import" },
  ] },
  { group: "Fertigung", icon: "produktion", items: [{ key: "subproduction", label: "Fremdvergabe" }, { key: "prodreport", label: "Produktions-Reporting" }] },
  { group: "Buchhaltung", icon: "finanzen", items: [
    { key: "guv", label: "Gewinn- und Verlustrechnung" },
    { key: "zahlungen", label: "Zahlungseingänge" }, { key: "banking", label: "Banking" },
    { key: "finance", label: "Offene Posten (OP-Aging)" }, { key: "dunning", label: "Mahnwesen" },
    { key: "costcenters", label: "Kostenstellen" }, { key: "nachkalkfin", label: "Nachkalkulation" }, { key: "gutscheine", label: "Gutscheine" }, { key: "reporting", label: "Auswertungen" },
  ] },
  { group: "Personalwesen", icon: "hr", items: [{ key: "hr", label: "Personalwesen" }] },
  { group: "Einstellungen", icon: "einstellungen", items: [{ key: "admin", label: "Einstellungen" }, { key: "aufschlag", label: "Aufschlagsfaktoren" }, { key: "automation", label: "Automationen" }, { key: "mailaccounts", label: "E-Mail-Konten" }, { key: "emailtemplates", label: "E-Mail-Vorlagen" }, { key: "dataio", label: "Import/Export" }, { key: "archive", label: "GoBD-Archiv" }, { key: "auditlog", label: "Audit-Protokoll" }, { key: "integrations", label: "Schnittstellen" }, { key: "security", label: "Mein Konto (2FA)" }] },
];
const ALL_KEYS = NAV.flatMap((g) => g.items.map((i) => i.key));
const hashKey = (): string => {
  const h = typeof location !== "undefined" ? location.hash.replace("#", "") : "";
  return ALL_KEYS.includes(h) ? h : "home";
};
/** Sektion, die den aktiven Bereich enthält (für Highlight im eingeklappten Modus). */
const groupOfKey = (k: string): string | undefined => NAV.find((g) => g.items.some((i) => i.key === k))?.group;

// Nav-Zustand (eingeklappt + zugeklappte Gruppen) überlebt Reload via localStorage.
const readFlag = (key: string, fallback: boolean): boolean => {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v === "1"; } catch { return fallback; }
};
const readSet = (key: string): Set<string> => {
  try { const v = localStorage.getItem(key); return new Set(v ? (JSON.parse(v) as string[]) : []); } catch { return new Set(); }
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

// Globale Suche (G-6) im Spotlight-Stil: ⌘K/Strg+K (oder Klick) öffnet ein Overlay,
// Tippen sucht entitätsübergreifend ab 2 Zeichen, ↑/↓ wählt, ⏎ springt direkt auf den
// Beleg (navKey + Fokus-ID), Esc schließt. Treffer nach Entität gruppiert.
type SearchHit = Awaited<ReturnType<typeof trpc.search.global.query>>[number];

function GlobalSearch({ onSelect }: { onSelect: (hit: SearchHit) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);

  // ⌘K / Strg+K öffnet die Suche von überall.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); setActive(0); return; }
    let cancelled = false;
    void trpc.search.global.query({ query: q }).then((r) => { if (!cancelled) { setHits(r); setActive(0); } }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [q]);

  const choose = (hit: SearchHit | undefined): void => {
    if (!hit) return;
    onSelect(hit);
    setOpen(false); setQ(""); setHits([]);
  };

  const onInputKey = (e: ReactKeyboardEvent): void => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(hits[active]); }
  };

  return (
    <>
      <Button variant="default" size="xs" w={340} justify="space-between" onClick={() => setOpen(true)}
        rightSection={<Kbd size="xs">⌘K</Kbd>} c="dimmed" fw={400}>
        Suche: Firma, Auftrag, Artikel, Lead…
      </Button>
      <Modal opened={open} onClose={() => setOpen(false)} withCloseButton={false} size="lg" yOffset={80} padding={0}
        overlayProps={{ backgroundOpacity: 0.35, blur: 1 }} transitionProps={{ duration: 120 }}>
        <TextInput size="md" variant="unstyled" px="md" autoFocus placeholder="Suchen… (Firma, Auftrag, Artikel, Lead, Lieferant)"
          value={q} onChange={(e) => setQ(e.currentTarget.value)} onKeyDown={onInputKey}
          styles={{ input: { borderBottom: "1px solid var(--mantine-color-gray-3)", height: 48 } }} />
        <ScrollArea.Autosize mah={400}>
          {hits.length === 0
            ? <Text size="sm" c="dimmed" p="md">{q.trim().length < 2 ? "Mindestens 2 Zeichen eingeben." : "Keine Treffer."}</Text>
            : <Stack gap={0} p={4}>
                {hits.map((h, i) => (
                  <Box key={`${h.entity}-${h.id}`} px="sm" py={8} style={{ cursor: "pointer", borderRadius: 6, background: i === active ? "var(--mantine-color-blue-0)" : undefined }}
                    onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(h); }}>
                    <Group gap={8} wrap="nowrap">
                      <Badge size="xs" variant="light">{h.entity}</Badge>
                      <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>{h.label}
                        {h.sub ? <Text span c="dimmed" size="xs"> · {h.sub}</Text> : null}</Text>
                    </Group>
                  </Box>
                ))}
              </Stack>}
        </ScrollArea.Autosize>
        <Group justify="space-between" px="md" py={6} style={{ borderTop: "1px solid var(--mantine-color-gray-2)" }}>
          <Text size="xs" c="dimmed"><Kbd size="xs">↑</Kbd> <Kbd size="xs">↓</Kbd> wählen · <Kbd size="xs">⏎</Kbd> öffnen · <Kbd size="xs">Esc</Kbd> schließen</Text>
        </Group>
      </Modal>
    </>
  );
}

// In-App-Benachrichtigungen (G-5): Glocke mit Ungelesen-Zähler + Dropdown; Treffer
// navigieren ins Modul und werden als gelesen markiert.
function NotificationBell({ onNavigate }: { onNavigate: (k: string) => void }): JSX.Element {
  const [items, setItems] = useState<Awaited<ReturnType<typeof trpc.notifications.list.query>>>([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const refresh = useCallback(async () => {
    try { setCount(await trpc.notifications.unreadCount.query()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 30000); return () => clearInterval(t); }, [refresh]);

  return (
    <Box style={{ position: "relative" }}>
      <Button variant="subtle" size="xs" color="navy"
        onClick={async () => { const n = !open; setOpen(n); if (n) { try { setItems(await trpc.notifications.list.query({})); } catch { /* ignore */ } } }}>
        🔔 {count > 0 ? <Badge size="xs" color="red" ml={4}>{count}</Badge> : null}
      </Button>
      {open && (
        <Paper shadow="md" withBorder style={{ position: "absolute", top: 34, right: 0, width: 320, zIndex: 300, maxHeight: 360, overflowY: "auto" }}>
          <Group justify="space-between" px="sm" py={6}>
            <Text size="xs" fw={700}>Benachrichtigungen</Text>
            <Button size="compact-xs" variant="subtle"
              onClick={async () => { await trpc.notifications.markAllRead.mutate(); setItems(await trpc.notifications.list.query({})); await refresh(); }}>Alle gelesen</Button>
          </Group>
          {items.length === 0
            ? <Text size="sm" c="dimmed" px="sm" pb="sm">Keine Benachrichtigungen.</Text>
            : items.map((n) => (
              <Box key={n.id} px="sm" py={6} style={{ cursor: "pointer", background: n.read ? undefined : "var(--erp-surface)" }}
                onClick={async () => { if (n.navKey) onNavigate(n.navKey); await trpc.notifications.markRead.mutate({ id: n.id }); setOpen(false); await refresh(); }}>
                <Text size="sm" fw={n.read ? 400 : 600}>{n.title}</Text>
                {n.body ? <Text size="xs" c="dimmed">{n.body}</Text> : null}
              </Box>
            ))}
        </Paper>
      )}
    </Box>
  );
}

// Aufgaben-Badge im Header: zeigt die Zahl offener eigener Aufgaben, öffnet die Arbeitsliste.
function TaskBadge({ onOpen }: { onOpen: () => void }): JSX.Element {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    try { setCount(await trpc.tasks.openCount.query()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 30000); return () => clearInterval(t); }, [refresh]);
  return (
    <Button variant="subtle" size="xs" color="navy" onClick={onOpen}>
      ✓ Aufgaben {count > 0 ? <Badge size="xs" color="blue" ml={4}>{count}</Badge> : null}
    </Button>
  );
}

// Linke Modul-Navigation: ganz einklappbar (Icon-Schiene) und je Sektion aufklappbar.
// Voll: Sektionskopf (Icon + Titel + Chevron) klappt seine Einträge auf/zu.
// Schiene: nur Sektions-Icons; Hover öffnet die Einträge als Flyout.
function SideNav({ active, collapsed, onNavigate }: { active: string; collapsed: boolean; onNavigate: (k: string) => void }): JSX.Element {
  const [closed, setClosed] = useState<Set<string>>(() => readSet("erp.nav.closedGroups"));
  const activeGroup = groupOfKey(active);
  const toggleGroup = useCallback((g: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      try { localStorage.setItem("erp.nav.closedGroups", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  if (collapsed) {
    // Icon-Schiene: je Sektion ein Icon; Hover blendet die Einträge ein.
    return (
      <ScrollArea type="scroll" px={4}>
        <Stack gap={4} align="center" py={4}>
          {NAV.map((g) => (
            <HoverCard key={g.group} position="right-start" offset={6} openDelay={40} closeDelay={120} shadow="md" withinPortal>
              <HoverCard.Target>
                <ActionIcon variant={activeGroup === g.group ? "light" : "subtle"} color="navy" size="lg" radius="md" aria-label={g.group}>
                  <NavIcon name={g.icon} />
                </ActionIcon>
              </HoverCard.Target>
              <HoverCard.Dropdown p={6}>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="xs" mb={4} style={{ letterSpacing: 0.4 }}>{g.group}</Text>
                <Box miw={190}>
                  {g.items.map((i) => (
                    <NavLink key={i.key} label={i.label} active={active === i.key} variant="light" color="navy"
                      onClick={() => onNavigate(i.key)} style={{ borderRadius: 6 }} />
                  ))}
                </Box>
              </HoverCard.Dropdown>
            </HoverCard>
          ))}
        </Stack>
      </ScrollArea>
    );
  }

  // Volle Leiste: aufklappbare Sektionen.
  return (
    <ScrollArea type="scroll">
      <Stack gap={2} py={2}>
        {NAV.map((g) => {
          const open = !closed.has(g.group);
          return (
            <Box key={g.group}>
              {/* Klick auf den Gruppenkopf navigiert zum ersten Eintrag (und klappt auf);
                  der Chevron ist ein separater Auf-/Zuklapp-Schalter (QA: Kopf wirkte
                  klickbar, klappte aber nur ein). */}
              <UnstyledButton onClick={() => { if (g.items[0]) onNavigate(g.items[0].key); if (closed.has(g.group)) toggleGroup(g.group); }} aria-expanded={open}
                style={{ display: "block", width: "100%", borderRadius: 6, padding: "6px 8px", marginTop: 4 }}
                className="erp-nav-group">
                <Group gap={8} wrap="nowrap">
                  <Box c={activeGroup === g.group ? "navy.9" : "dimmed"} style={{ display: "inline-flex" }}><NavIcon name={g.icon} /></Box>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4, flex: 1 }}>{g.group}</Text>
                  <Box c="dimmed" style={{ display: "inline-flex", cursor: "pointer" }} role="button" aria-label={open ? "Gruppe einklappen" : "Gruppe ausklappen"}
                    onClick={(e) => { e.stopPropagation(); toggleGroup(g.group); }}><Chevron open={open} /></Box>
                </Group>
              </UnstyledButton>
              <Collapse in={open}>
                <Box pl={6}>
                  {g.items.map((i) => (
                    <NavLink key={i.key} label={i.label} active={active === i.key} variant="light" color="navy"
                      onClick={() => onNavigate(i.key)} style={{ borderRadius: 6 }} />
                  ))}
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Stack>
    </ScrollArea>
  );
}

function Shell({ user, onLogout }: { user: AuthUser; onLogout: () => Promise<void> }): JSX.Element {
  const [active, setActiveState] = useState<string>(hashKey);
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => readFlag("erp.nav.collapsed", false));
  const toggleNav = useCallback(() => {
    setNavCollapsed((c) => { const next = !c; try { localStorage.setItem("erp.nav.collapsed", next ? "1" : "0"); } catch { /* ignore */ } return next; });
  }, []);
  // Fokus-Sprungziel aus der globalen Suche (navKey + Beleg-ID): die Zielseite öffnet
  // direkt den Beleg. Manuelle Navigation (Sidebar/Badges) löscht den Fokus.
  const [focus, setFocus] = useState<{ navKey: string; id: string } | null>(null);
  const setActive = useCallback((k: string) => {
    setActiveState(k);
    setFocus(null);
    if (typeof location !== "undefined") location.hash = k;
  }, []);
  const goToHit = useCallback((hit: SearchHit) => {
    setActiveState(hit.navKey);
    setFocus({ navKey: hit.navKey, id: hit.id });
    if (typeof location !== "undefined") location.hash = hit.navKey;
  }, []);
  // Hotlink/Direktlink in eine andere Maske mit Beleg-Fokus (z. B. Versand → Auftrag).
  const openEntity = useCallback((navKey: string, id: string) => {
    setActiveState(navKey);
    setFocus({ navKey, id });
    if (typeof location !== "undefined") location.hash = navKey;
  }, []);

  // Deep-Linking (P0): Hash ↔ Ansicht in BEIDE Richtungen synchron halten. Browser-
  // Zurück/Vor, Lesezeichen und manuelles Ändern des #hash wechseln die Ansicht — nicht
  // nur die Sidebar. (setActive schreibt den Hash; hier reagiert die Ansicht auf den Hash.)
  useEffect(() => {
    const onHash = (): void => { setActiveState(hashKey()); setFocus(null); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Genauer Seitentitel je Bereich (Web Interface Guidelines: accurate page titles).
  useEffect(() => {
    if (typeof document !== "undefined") document.title = `TEXMA ERP · ${activeLabel(active)}`;
  }, [active]);

  return (
    <AppShell header={{ height: 52 }} navbar={{ width: navCollapsed ? 64 : 248, breakpoint: "xs" }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Tooltip label={navCollapsed ? "Menü ausklappen" : "Menü einklappen"} openDelay={300}>
              <ActionIcon variant="subtle" color="navy" size="md" onClick={toggleNav}
                aria-label={navCollapsed ? "Menü ausklappen" : "Menü einklappen"} aria-pressed={navCollapsed}>
                <SidebarToggleIcon />
              </ActionIcon>
            </Tooltip>
            <Box w={22} h={22} style={{ borderRadius: 6, background: "var(--erp-focus)" }} aria-hidden />
            <Title order={4}>TEXMA&nbsp;ERP</Title>
            <Badge size="sm" color="amber">Demo</Badge>
          </Group>
          <GlobalSearch onSelect={goToHit} />
          <Group gap="sm">
            <TaskBadge onOpen={() => setActive("tasks")} />
            <NotificationBell onNavigate={setActive} />
            <Text size="sm" c="dimmed">{user.name} · {user.role}</Text>
            <Button variant="default" size="xs" onClick={() => void onLogout()}>Abmelden</Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p={navCollapsed ? 4 : "xs"} style={{ background: "var(--erp-surface)" }}>
        <SideNav active={active} collapsed={navCollapsed} onNavigate={setActive} />
      </AppShell.Navbar>

      <AppShell.Main>
        <Page k={active} role={user.role} userName={user.name} onNavigate={setActive} onOpen={openEntity}
          focusId={focus && focus.navKey === active ? focus.id : undefined} />
      </AppShell.Main>
    </AppShell>
  );
}

function Page({ k, role, userName, onNavigate, onOpen, focusId }: { k: string; role: string; userName: string; onNavigate: (k: string) => void; onOpen: (navKey: string, id: string) => void; focusId?: string }): ReactNode {
  switch (k) {
    case "home": return <HomePage userName={userName} onNavigate={onNavigate} />;
    case "dashboard": return <Dashboard />;
    case "statusampel": return <StatusAmpelPage onOpen={onOpen} />;
    case "sammelbestellungen": return <SammelbestellungPage />;
    case "dashboards": return <DashboardsPage />;
    case "orders": return <OrdersPage role={role} focusId={focusId} />;
    case "companies": return <CompaniesPage focusId={focusId} />;
    case "leads": return <LeadsPage focusId={focusId} />;
    case "calllogs": return <CallLogsPage />;
    case "mailaccounts": return <MailAccountsPage />;
    case "inquiries": return <InquiriesPage />;
    case "quotes": return <QuotesPage />;
    case "reklamation": return <ReklamationPage />;
    case "suppliers": return <SuppliersPage focusId={focusId} />;
    case "incoming": return <IncomingInvoicesPage />;
    case "procurement": return <ProcurementPage />;
    case "reorder": return <ReorderPage />;
    case "wareneingang": return <WareneingangPage />;
    case "samples": return <SampleLoansPage onOpen={onOpen} />;
    case "products": return <ProductsPage focusId={focusId} />;
    case "pricing": return <PricingPage />;
    case "emailtemplates": return <EmailTemplatesPage />;
    case "dataio": return <DataIoPage />;
    case "eanimport": return <EanImportPage />;
    case "newsletter": return <NewsletterPage />;
    case "opportunities": return <OpportunitiesPage />;
    case "calendar": return <CalendarPage />;
    case "messages": return <MessagesPage />;
    case "admin": return <AdminPage />;
    case "archive": return <ArchivePage role={role} />;
    case "auditlog": return <AuditLogPage />;
    case "automation": return <AutomationPage />;
    case "security": return <SecurityPage userName={userName} onProfileUpdated={() => { if (typeof location !== "undefined") location.reload(); }} />;
    case "tasks": return <TasksPage onNavigate={onNavigate} />;
    case "lager": return <LagerPage />;
    case "hr": return <HrPage />;
    case "integrations": return <IntegrationsPage />;
    case "logos": return <LogosPage />;
    case "aufschlag": return <AufschlagPage />;
    case "ausschreibungen": return <AusschreibungenPage />;
    case "guv": return <GuVReportPage />;
    case "gutscheine": return <GutscheinePage />;
    case "nachkalkfin": return <NachkalkulationPage />;
    case "subproduction": return <SubproductionPage />;
    case "prodreport": return <ProductionReportingPage />;
    case "shipments": return <ShipmentsPage onOpen={onOpen} />;
    case "dunning": return <DunningPage />;
    case "banking": return <Banking role={role} />;
    case "zahlungen": return <ZahlungenPage />;
    case "costcenters": return <CostCentersPage />;
    case "reporting": return <Reporting role={role} />;
    case "finance": return <FinanceReportingPage />;
    default: return <Text>Unbekannter Bereich.</Text>;
  }
}
