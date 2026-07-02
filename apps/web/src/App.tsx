// Navigations-Gerüst: Auth-Gate + AppShell mit gruppierter Sidebar über ALLE Module
// (alles durchklickbar). Jede Sektion ist eine Seite gegen die echten tRPC-Endpunkte.
import { useCallback, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ActionIcon, AppShell, Badge, Box, Button, Collapse, Group, HoverCard, Kbd, Loader, Menu, Modal, Paper, ScrollArea, Stack, Tabs, Text, TextInput, Tooltip, UnstyledButton, VisuallyHidden } from "@mantine/core";
import { Chevron, NavIcon, SidebarToggleIcon, type NavIconName } from "./nav-icons.js";
import { Login } from "./Login.js";
import { Dashboard } from "./Dashboard.js";
import { StatusAmpelPage } from "./StatusAmpel.js";
import { EmptyState, DocListHeader } from "./doc-layout.js";

/** Konsolidierter Zahlungsabgleich (IA): Kontoumsatz → OP-Zuordnung → manuelle Zahlung
 *  als EIN Tab-Workflow statt drei getrennter Top-Level-Module (#banking/#finance/#zahlungen). */
function ZahlungsabgleichPage({ role, onOpen }: { role: string; onOpen?: (k: string, id: string) => void }): ReactNode {
  return (
    <>
      <DocListHeader module="Buchhaltung" title="Zahlungsabgleich"
        hint="Ein gemeinsames Abgleich-Datenmodell über alle Quellen: Übersicht (Herkunft + Status + Fälligkeitsstaffel) → Kontoumsatz importieren → ggf. manuell zuordnen." />
      <Tabs defaultValue="overview" mt="md" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="overview">Übersicht</Tabs.Tab>
          <Tabs.Tab value="banking">Kontoumsätze</Tabs.Tab>
          <Tabs.Tab value="op">Offene Posten (Fälligkeitsstaffel)</Tabs.Tab>
          <Tabs.Tab value="erfassen">Zahlung erfassen</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview" pt="md"><ZahlungsabgleichOverview onOpen={onOpen} /></Tabs.Panel>
        <Tabs.Panel value="banking" pt="md"><Banking role={role} /></Tabs.Panel>
        <Tabs.Panel value="op" pt="md"><FinanceReportingPage /></Tabs.Panel>
        <Tabs.Panel value="erfassen" pt="md"><ZahlungenPage /></Tabs.Panel>
      </Tabs>
    </>
  );
}
import { SammelbestellungPage } from "./Sammelbestellung.js";
import { Reporting } from "./Reporting.js";
import { Banking } from "./Banking.js";
import {
  CompaniesPage, CallLogsPage, CostCentersPage, DunningPage, InquiriesPage, IncomingInvoicesPage, LeadsPage, CrmPipelinePage, MailAccountsPage, OrdersPage, ProcurementPage, ProductionReportingPage,
  ProductsPage, MatrixStammPage, PricingPage, PricingCenterPage, EmailTemplatesPage, DashboardsPage, DataIoPage, EanImportPage, FinanceReportingPage, WareneingangPage, ZahlungenPage, ZahlungsabgleichOverview, NewsletterPage, OpportunitiesPage, CalendarPage, MessagesPage, AdminPage, ArchivePage, AuditLogPage, AutomationPage, TasksPage, HomePage, LagerPage, HrPage, IntegrationsPage, SecurityPage, QuotesPage, ReklamationPage, ReorderPage, SampleLoansPage, ShipmentsPage, SubproductionPage, SuppliersPage,
  LogosPage, AufschlagPage, AusschreibungenPage, NachkalkulationPage, GuVReportPage, GutscheinePage,
  InvoicesPage, StockJournalPage,
} from "./pages.js";
import { ImportMapperPage } from "./import-mapper.js";
import { trpc } from "./trpc.js";

interface AuthUser { id: string; email: string; name: string; role: string; totpEnabled: boolean; }

// Modul-Navigation nach ERPNext/Frappe-Taxonomie (Workspaces als Sektionen): Start,
// CRM, Vertrieb, Einkauf, Lager, Fertigung, Buchhaltung, Personalwesen, Einstellungen.
// Jede Sektion ist einzeln aufklappbar; die ganze Leiste klappt zur Icon-Schiene ein.
const NAV: ReadonlyArray<{ group: string; icon: NavIconName; items: ReadonlyArray<{ key: string; label: string }> }> = [
  { group: "Start", icon: "uebersicht", items: [{ key: "home", label: "Start" }, { key: "dashboard", label: "Termin-Ampel" }, { key: "statusampel", label: "Status-Ampel" }, { key: "dashboards", label: "Meine Dashboards" }, { key: "calendar", label: "Kalender" }, { key: "tasks", label: "Meine Aufgaben" }, { key: "messages", label: "Nachrichten" }] },
  // CRM-Funnel konsolidiert (Enh E): Lead → Anfrage → Verkaufschance laufen in der einen
  // Vertriebs-Pipeline (eine Entität, eine Statusmaschine). Die Einzelseiten bleiben per
  // Deep-Link/Hash erreichbar (Page-Switch unten), erscheinen aber NICHT mehr im Menü.
  { group: "CRM", icon: "crm", items: [{ key: "pipeline", label: "Vertriebs-Pipeline" }, { key: "calllogs", label: "Anrufliste" }, { key: "newsletter", label: "Newsletter" }] },
  { group: "Vertrieb", icon: "vertrieb", items: [{ key: "companies", label: "Kunden" }, { key: "quotes", label: "Angebote" }, { key: "orders", label: "Aufträge" }, { key: "sammelbestellungen", label: "Sammelbestellungen" }, { key: "preiscenter", label: "Preis-Center" }, { key: "pricing", label: "Preise/Staffel" }, { key: "reklamation", label: "Reklamation" }] },
  { group: "Einkauf", icon: "beschaffung", items: [
    { key: "suppliers", label: "Lieferanten" }, { key: "procurement", label: "Beschaffung" },
    { key: "reorder", label: "Nachbestellung" }, { key: "incoming", label: "Eingangsrechnungen" },
  ] },
  { group: "Lager", icon: "lager", items: [
    // Matrix-Stamm ist Tab „Farben & Größen" in Artikel/Varianten (IA-Konsolidierung wie
    // Banking/CRM); der Direkt-Hash #matrixstamm bleibt über den Page-Switch erreichbar.
    { key: "products", label: "Artikel/Varianten" }, { key: "lager", label: "Lager & Inventur" },
    { key: "stockmoves", label: "Bestandsbewegungen" },
    { key: "wareneingang", label: "Wareneingang" }, { key: "samples", label: "Muster-Leihgut" }, { key: "shipments", label: "Versand" },
    { key: "importmapper", label: "Import-Mapper" }, { key: "eanimport", label: "EAN-Listen-Import" },
  ] },
  // Veredelungs-Strang gebündelt (IA): Logo-Stammdaten → Ausschreibung an Veredler →
  // Fremdvergabe-Ausführung → Reporting → Aufschlagsfaktoren je Veredelungsart.
  { group: "Veredelung", icon: "produktion", items: [
    { key: "logos", label: "Logos & Stickerei" }, { key: "ausschreibungen", label: "Stickerei-Ausschreibungen" },
    { key: "subproduction", label: "Fremdvergabe" }, { key: "prodreport", label: "Produktions-Auswertung" },
    { key: "aufschlag", label: "Aufschlagsfaktoren" },
  ] },
  { group: "Buchhaltung", icon: "finanzen", items: [
    { key: "guv", label: "Gewinn- und Verlustrechnung" },
    { key: "invoices", label: "Rechnungen" },
    // Zahlungseingänge / OP-Aging / Banking sind Tabs im konsolidierten „Zahlungsabgleich"
    // (IA) — daher KEINE eigenen Sidebar-Einträge mehr. Direkt-Hashes (#zahlungen/#finance/
    // #banking) bleiben über die Page-Routen erreichbar (Rückwärtskompatibilität).
    { key: "zahlungsabgleich", label: "Zahlungsabgleich" },
    { key: "dunning", label: "Mahnwesen" },
    { key: "costcenters", label: "Kostenstellen" }, { key: "nachkalkfin", label: "Nachkalkulation" }, { key: "gutscheine", label: "Gutscheine" }, { key: "reporting", label: "Auswertungen" },
  ] },
  { group: "Personalwesen", icon: "hr", items: [{ key: "hr", label: "Personalwesen" }] },
  { group: "Einstellungen", icon: "einstellungen", items: [{ key: "admin", label: "Einstellungen" }, { key: "automation", label: "Automationen" }, { key: "mailaccounts", label: "E-Mail-Konten" }, { key: "emailtemplates", label: "E-Mail-Vorlagen" }, { key: "dataio", label: "Import/Export" }, { key: "archive", label: "GoBD-Archiv" }, { key: "auditlog", label: "Audit-Protokoll" }, { key: "integrations", label: "Schnittstellen" }, { key: "security", label: "Mein Konto (2FA)" }] },
];
// Modulfarben der Sidebar-Kacheln (TEXMA OS, docs/texma-os-design-spec.md) — reine Optik,
// die NAV-Inhalte (Keys/Labels/Gruppen) bleiben unverändert.
const GROUP_COLOR: Record<string, string> = {
  Start: "#0E1C36", CRM: "#C77700", Vertrieb: "#6741D9", Einkauf: "#2563EB", Lager: "#0C8599",
  Veredelung: "#E8590C", Buchhaltung: "#386A4E", Personalwesen: "#7A5AF8", Einstellungen: "#495057",
};
const groupColor = (g: string): string => GROUP_COLOR[g] ?? "#0E1C36";

const ALL_KEYS = NAV.flatMap((g) => g.items.map((i) => i.key));
const hashKey = (): string => {
  const h = typeof location !== "undefined" ? location.hash.replace("#", "") : "";
  if (h === "") return "home";
  // Unbekannter Hash bleibt erhalten (statt still auf „home" zu fallen) → echte 404-Seite.
  return ALL_KEYS.includes(h) ? h : h;
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
      {/* Suchfeld-Trigger im TEXMA-OS-Look: h36, r9, Fläche #F5F6F8, ⌘K-Pille rechts. */}
      <Box role="search" style={{ flex: "1 1 240px", maxWidth: 440, minWidth: 170 }}>
        <Button variant="default" size="xs" fullWidth justify="space-between" onClick={() => setOpen(true)}
          rightSection={<Kbd size="xs">⌘K</Kbd>} fw={400} aria-label="Globale Suche öffnen (Strg+K)"
          styles={{
            root: { height: 36, borderRadius: 9, background: "#F5F6F8", borderColor: "#E2E5EA", color: "#7A828F", fontSize: 13 },
            label: { fontWeight: 400 },
          }}>
          Suchen — Aufträge, Kunden, Belege …
        </Button>
      </Box>
      <Modal opened={open} onClose={() => setOpen(false)} withCloseButton={false} size="lg" yOffset={80} padding={0}
        radius="xl" shadow="xl" overlayProps={{ backgroundOpacity: 0.34, blur: 3 }} transitionProps={{ duration: 120 }}>
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
// Optik nach TEXMA OS: farbige 24px-Modul-Kacheln je Gruppe, 13px-Einträge mit
// 3px-Gruppenfarb-Balken im aktiven Zustand; Rail = 38px-Kacheln mit Hover-Flyout.

/** Farbige Modul-Kachel (Sidebar-Gruppenkopf bzw. Rail). */
function GroupTile({ group, icon, size = 24 }: { group: string; icon: NavIconName; size?: number }): JSX.Element {
  return (
    <Box aria-hidden style={{
      width: size, height: size, borderRadius: size >= 34 ? 10 : 7, flexShrink: 0,
      background: groupColor(group), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 1px 2px rgba(14,28,54,.16)",
    }}>
      <NavIcon name={icon} size={size >= 34 ? 18 : 14} />
    </Box>
  );
}

/** Einzelner Navigations-Eintrag (TEXMA OS): 13px, Einzug unter der Kachel, aktiver
 *  Zustand mit 3px-Balken in der Gruppenfarbe + dezenter Navy-Fläche. */
function NavItem({ label, active, color, indent = true, onClick }: {
  label: string; active: boolean; color: string; indent?: boolean; onClick: () => void;
}): JSX.Element {
  return (
    <UnstyledButton onClick={onClick} className="erp-nav-item" aria-current={active ? "page" : undefined}
      style={{
        position: "relative", display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: indent ? "7px 10px 7px 34px" : "7px 10px", borderRadius: 8,
        fontSize: 13, color: "#0E1C36", textAlign: "left",
        background: active ? "rgba(14,28,54,.055)" : undefined,
      }}>
      {active && indent && (
        <Box aria-hidden style={{ position: "absolute", left: 13, top: 8, bottom: 8, width: 3, borderRadius: 3, background: color }} />
      )}
      <Text component="span" size="sm" style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 13 }}>{label}</Text>
    </UnstyledButton>
  );
}

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
    // Icon-Schiene: farbige Modul-Kachel je Sektion; Hover blendet die Einträge als Flyout ein.
    return (
      <ScrollArea type="scroll" px={4} style={{ overflow: "visible" }}>
        <Stack gap={6} align="center" py={8}>
          {NAV.map((g) => (
            <HoverCard key={g.group} position="right-start" offset={8} openDelay={40} closeDelay={120} shadow="lg" radius="md" withinPortal>
              <HoverCard.Target>
                <UnstyledButton className="erp-rail-tile" aria-label={g.group}
                  onClick={() => { if (g.items[0]) onNavigate(g.items[0].key); }}
                  style={{ position: "relative", display: "flex", padding: 0 }}>
                  {activeGroup === g.group && (
                    <Box aria-hidden style={{ position: "absolute", left: -7, top: "50%", width: 3, height: 20, borderRadius: 3, background: "#0E1C36", transform: "translateY(-50%)" }} />
                  )}
                  <GroupTile group={g.group} icon={g.icon} size={38} />
                </UnstyledButton>
              </HoverCard.Target>
              <HoverCard.Dropdown p={7} style={{ border: "1px solid #E2E5EA" }}>
                <Text size="xs" fw={600} tt="uppercase" px={9} pt={4} pb={6}
                  style={{ letterSpacing: "0.06em", fontSize: 10, color: "#9AA1AD" }}>{g.group}</Text>
                <Box miw={198}>
                  {g.items.map((i) => (
                    <NavItem key={i.key} label={i.label} active={active === i.key} color={groupColor(g.group)} indent={false}
                      onClick={() => onNavigate(i.key)} />
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
      <Stack gap={0} py={2} px={2}>
        {NAV.map((g) => {
          const open = !closed.has(g.group);
          return (
            <Box key={g.group}>
              {/* Klick auf den Gruppenkopf navigiert zum ersten Eintrag (und klappt auf);
                  der Chevron ist ein separater Auf-/Zuklapp-Schalter (QA: Kopf wirkte
                  klickbar, klappte aber nur ein). */}
              <UnstyledButton onClick={() => { if (g.items[0]) onNavigate(g.items[0].key); if (closed.has(g.group)) toggleGroup(g.group); }}
                aria-expanded={open} aria-controls={`grp-${g.group.replace(/\W+/g, "-")}`}
                style={{ display: "block", width: "100%", borderRadius: 8, padding: "9px 8px 5px" }}
                className="erp-nav-group">
                <Group gap={10} wrap="nowrap">
                  <GroupTile group={g.group} icon={g.icon} />
                  <Text component="span" fw={600} tt="uppercase"
                    style={{ letterSpacing: "0.06em", fontSize: 10.5, color: "#7A828F", flex: 1, textAlign: "left" }}>{g.group}</Text>
                  <Box c="dimmed" style={{ display: "inline-flex", cursor: "pointer" }} role="button" aria-label={open ? "Gruppe einklappen" : "Gruppe ausklappen"}
                    onClick={(e) => { e.stopPropagation(); toggleGroup(g.group); }}><Chevron open={open} size={13} /></Box>
                </Group>
              </UnstyledButton>
              <Collapse in={open} id={`grp-${g.group.replace(/\W+/g, "-")}`}>
                <Box pt={1} pb={3}>
                  {g.items.map((i) => (
                    <NavItem key={i.key} label={i.label} active={active === i.key} color={groupColor(g.group)}
                      onClick={() => onNavigate(i.key)} />
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

// Tabellendichte (Xentral-Parität): kompakt/standard/komfortabel, persistent je Nutzer.
// Setzt data-density am <html>; die eigentliche Zeilenhöhe steuert index.css.
function DensityMenu(): JSX.Element {
  const [d, setD] = useState<string>(() => { try { return localStorage.getItem("erp.density") ?? "standard"; } catch { return "standard"; } });
  useEffect(() => {
    document.documentElement.dataset.density = d;
    try { localStorage.setItem("erp.density", d); } catch { /* ignore */ }
  }, [d]);
  const opts: Array<[string, string]> = [["kompakt", "Kompakt"], ["standard", "Standard"], ["komfortabel", "Komfortabel"]];
  return (
    <Menu shadow="md" width={180} position="bottom-end" withinPortal>
      <Menu.Target>
        <Tooltip label="Tabellendichte" openDelay={300}>
          <ActionIcon variant="subtle" color="navy" size="md" aria-label="Tabellendichte einstellen">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
              <line x1="2.5" y1="4" x2="13.5" y2="4" /><line x1="2.5" y1="8" x2="13.5" y2="8" /><line x1="2.5" y1="12" x2="13.5" y2="12" />
            </svg>
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Tabellendichte</Menu.Label>
        {opts.map(([val, lab]) => (
          <Menu.Item key={val} onClick={() => setD(val)} fw={d === val ? 700 : 400}>{lab}{d === val ? "  ✓" : ""}</Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
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

  // Genau eine <h1> je Route: Die meisten Seiten liefern sie über DocListHeader/DocFormShell
  // (sichtbarer Titel = h1). Seiten ohne diese Primitive bekommen eine unsichtbare Fallback-h1
  // mit dem Bereichsnamen — selbstheilend per DOM-Prüfung, ohne Dopplung auf den Header-Seiten.
  const [needsFallbackH1, setNeedsFallbackH1] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const id = requestAnimationFrame(() =>
      setNeedsFallbackH1(!document.querySelector("#main-content h1:not([data-fallback-h1])")));
    return () => cancelAnimationFrame(id);
  }, [active]);

  // Initialen für die Nutzer-Kachel im Sidebar-Fuß (TEXMA OS: 34px-Navy-Kachel).
  const initials = user.name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";

  return (
    <>
    {/* Skip-Link (Tastatur/Screenreader): springt die Navigation über, direkt zum Inhalt. */}
    <a href="#main-content" className="skip-link">Zum Inhalt springen</a>
    <AppShell header={{ height: 62 }} navbar={{ width: navCollapsed ? 66 : 256, breakpoint: "xs" }} padding="lg">
      {/* Schlanke Glas-Topbar (TEXMA OS): Breadcrumb · globale Suche ⌘K · Statusdienste. */}
      <AppShell.Header style={{ background: "rgba(255,255,255,0.66)", backdropFilter: "saturate(180%) blur(26px)", WebkitBackdropFilter: "saturate(180%) blur(26px)", borderBottom: "1px solid rgba(14,28,54,.06)" }}>
        <Group h="100%" px={28} gap={14} wrap="nowrap">
          {/* Breadcrumb: TEXMA ERP / aktiver Bereich (der Seitentitel bleibt H1 im Content). */}
          <Group gap={8} wrap="nowrap" visibleFrom="sm" style={{ whiteSpace: "nowrap" }}>
            <Text size="sm" fw={500} style={{ fontSize: 12.5, color: "#0E1C36" }}>TEXMA ERP</Text>
            <Text size="sm" style={{ fontSize: 12.5, color: "#7A828F", opacity: 0.5 }}>/</Text>
            <Text size="sm" style={{ fontSize: 12.5, color: "#7A828F" }}>{activeLabel(active) || "Übersicht"}</Text>
            <Badge size="sm" color="amber">Demo</Badge>
          </Group>
          <Box style={{ flex: 1 }} />
          <GlobalSearch onSelect={goToHit} />
          <Group gap="sm" wrap="nowrap">
            <DensityMenu />
            <TaskBadge onOpen={() => setActive("tasks")} />
            <NotificationBell onNavigate={setActive} />
          </Group>
        </Group>
      </AppShell.Header>

      {/* Sidebar als Glasfläche (TEXMA OS): Logo-Kopf, Modul-Navigation, Nutzer-Fuß. */}
      <AppShell.Navbar p={0}
        style={{ background: "rgba(252,252,253,0.72)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)", borderRight: "1px solid rgba(14,28,54,.07)" }}
        aria-label="Hauptnavigation">
        {/* Logo-Kopf: TEXMA-Wortmarke + „ERP"-Miniatur + Einklapp-Schalter. */}
        <Group gap={10} wrap="nowrap" px={navCollapsed ? 0 : 16} pt={18} pb={15}
          justify={navCollapsed ? "center" : undefined} style={{ flexShrink: 0 }}>
          {!navCollapsed && (
            <>
              <img src="/texma-logo.png" alt="TEXMA" style={{ height: 23, width: "auto", display: "block", flexShrink: 0 }} />
              <Text component="span" fw={500}
                style={{ fontSize: 9.5, color: "#7A828F", letterSpacing: "0.14em", paddingLeft: 9, borderLeft: "1px solid #E2E5EA" }}>ERP</Text>
            </>
          )}
          <Tooltip label={navCollapsed ? "Menü ausklappen" : "Menü einklappen"} openDelay={300}>
            <ActionIcon variant="default" size={26} radius={8} onClick={toggleNav} ml={navCollapsed ? 0 : "auto"}
              aria-label={navCollapsed ? "Menü ausklappen" : "Menü einklappen"} aria-pressed={navCollapsed}
              style={{ borderColor: "#E2E5EA", color: "#5B6473" }}>
              <SidebarToggleIcon size={15} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Box style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }} px={navCollapsed ? 0 : 8}>
          <SideNav active={active} collapsed={navCollapsed} onNavigate={setActive} />
        </Box>
        {/* Nutzer-Fuß: Avatar-Kachel + Name/Rolle + Abmelden. */}
        <Group gap={10} wrap="nowrap" p={12} justify={navCollapsed ? "center" : undefined}
          style={{ borderTop: "1px solid #E2E5EA", flexShrink: 0 }}>
          {/* Eingeklappt bleibt Abmelden über das Avatar-Menü erreichbar. */}
          <Menu shadow="md" width={180} position="right-end" withinPortal disabled={!navCollapsed}>
            <Menu.Target>
              <UnstyledButton aria-label={`${user.name} · ${user.role}`} style={{
                width: 34, height: 34, borderRadius: 9, background: "#0E1C36", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 12.5, flexShrink: 0,
                cursor: navCollapsed ? "pointer" : "default",
              }}>{initials}</UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{user.name} · {user.role}</Menu.Label>
              <Menu.Item onClick={() => void onLogout()}>Abmelden</Menu.Item>
            </Menu.Dropdown>
          </Menu>
          {!navCollapsed && (
            <>
              <Box style={{ minWidth: 0, flex: 1, lineHeight: 1.25 }}>
                <Text truncate style={{ fontSize: 12.5, fontWeight: 500, color: "#0E1C36" }}>{user.name}</Text>
                <Text style={{ fontSize: 11, color: "#7A828F" }}>Rolle: {user.role}</Text>
              </Box>
              <Button variant="default" size="compact-xs" onClick={() => void onLogout()}
                styles={{ root: { borderColor: "#E2E5EA", color: "#5B6473", fontWeight: 500 } }}>Abmelden</Button>
            </>
          )}
        </Group>
      </AppShell.Navbar>

      <AppShell.Main id="main-content">
        {/* Fallback-h1 nur, wenn die Seite selbst keine sichtbare h1 rendert (s. o.). */}
        {needsFallbackH1 && <VisuallyHidden component="h1" data-fallback-h1>{activeLabel(active)}</VisuallyHidden>}
        <Page k={active} role={user.role} userName={user.name} onNavigate={setActive} onOpen={openEntity}
          focusId={focus && focus.navKey === active ? focus.id : undefined} />
      </AppShell.Main>
    </AppShell>
    </>
  );
}

function Page({ k, role, userName, onNavigate, onOpen, focusId }: { k: string; role: string; userName: string; onNavigate: (k: string) => void; onOpen: (navKey: string, id: string) => void; focusId?: string }): ReactNode {
  switch (k) {
    case "home": return <HomePage userName={userName} onNavigate={onNavigate} />;
    case "dashboard": return <Dashboard />;
    case "statusampel": return <StatusAmpelPage onOpen={onOpen} />;
    case "sammelbestellungen": return <SammelbestellungPage />;
    case "dashboards": return <DashboardsPage />;
    case "orders": return <OrdersPage role={role} focusId={focusId} onOpen={onOpen} />;
    case "companies": return <CompaniesPage focusId={focusId} onNavigate={onNavigate} onOpen={onOpen} />;
    case "pipeline": return <CrmPipelinePage onNavigate={onNavigate} onOpen={onOpen} />;
    case "leads": return <LeadsPage focusId={focusId} onOpen={onOpen} />;
    case "calllogs": return <CallLogsPage />;
    case "mailaccounts": return <MailAccountsPage />;
    case "inquiries": return <InquiriesPage />;
    case "quotes": return <QuotesPage focusId={focusId} onOpen={onOpen} />;
    case "reklamation": return <ReklamationPage />;
    case "suppliers": return <SuppliersPage focusId={focusId} />;
    case "incoming": return <IncomingInvoicesPage onOpen={onOpen} />;
    case "procurement": return <ProcurementPage />;
    case "reorder": return <ReorderPage onOpen={onOpen} />;
    case "wareneingang": return <WareneingangPage />;
    case "samples": return <SampleLoansPage onOpen={onOpen} />;
    case "products": return <ProductsPage focusId={focusId} />;
    case "matrixstamm": return <MatrixStammPage />;
    case "importmapper": return <ImportMapperPage />;
    case "pricing": return <PricingPage />;
    case "preiscenter": return <PricingCenterPage />;
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
    case "stockmoves": return <StockJournalPage />;
    case "hr": return <HrPage />;
    case "integrations": return <IntegrationsPage />;
    case "logos": return <LogosPage />;
    case "aufschlag": return <AufschlagPage />;
    case "ausschreibungen": return <AusschreibungenPage />;
    case "guv": return <GuVReportPage />;
    case "gutscheine": return <GutscheinePage />;
    case "nachkalkfin": return <NachkalkulationPage />;
    case "subproduction": return <SubproductionPage onOpen={onOpen} focusId={focusId} />;
    case "prodreport": return <ProductionReportingPage />;
    case "shipments": return <ShipmentsPage onOpen={onOpen} />;
    case "dunning": return <DunningPage />;
    case "invoices": return <InvoicesPage onOpen={onOpen} />;
    case "zahlungsabgleich": return <ZahlungsabgleichPage role={role} onOpen={onOpen} />;
    case "banking": return <Banking role={role} />;
    case "zahlungen": return <ZahlungenPage />;
    case "costcenters": return <CostCentersPage />;
    case "reporting": return <Reporting role={role} />;
    case "finance": return <FinanceReportingPage />;
    default: return (
      <EmptyState icon="🧭" title="Seite nicht gefunden"
        hint={`Die Route „#${k}" existiert nicht (Tippfehler oder veralteter Link). Über die Navigation links geht es weiter.`}
        actionLabel="Zur Startseite" onAction={() => onNavigate("home")} />
    );
  }
}
