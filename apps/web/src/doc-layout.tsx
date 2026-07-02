// Wiederverwendbare ERPNext/Frappe-Layout-Primitive für das einheitliche
// „List → Form"-Muster: Listenkopf (Titel + Aktion + Filterzeile), Formular-Hülle
// (Breadcrumb + Titel + Statusabzeichen + Aktionsleiste) und Status-Indikator-Punkt.
import { Badge, Box, Button, Group, Menu, Text, Title } from "@mantine/core";
import { Fragment, type ReactNode } from "react";
import { statusMantineColor, prettyStatus } from "./theme.js";

/**
 * Einheitliches Statusabzeichen (Skill SB-1): EINE Quelle für Status→Farbe + lesbares Label.
 * Überall, wo ein Enum-Status als Badge erscheint (Detailköpfe, Panels), statt Ad-hoc-`<Badge>`.
 */
export function StatusBadge({ status, size }: { status: string; size?: string }): JSX.Element {
  return (
    <Badge color={statusMantineColor[status] ?? "gray"} variant="light" size={size}>
      {prettyStatus(status)}
    </Badge>
  );
}

/**
 * Geführter Leerzustand (Onboarding): Symbol + Titel + erklärender Hinweis + optionale
 * Handlungsaufforderung. Ersetzt das nackte „Keine Daten" in Modulen ohne Datensätze
 * (P2.11), damit klar ist, was als Nächstes zu tun ist.
 */
/**
 * Eine Aktion im Beleg-Aktionsmenue. `group` fasst Items zu Abschnitten zusammen
 * (gleiche Strings -> ein Abschnitt mit Menu.Label); Reihenfolge = Eingabereihenfolge.
 * `color` fuer positive/destruktive Items (z. B. "green"/"red"); `disabled`+`title` fuer
 * gesperrte Folgeaktionen samt Begruendung.
 */
export interface DocAction {
  label: string;
  onClick: () => void;
  group?: string;
  color?: string;
  disabled?: boolean;
  title?: string;
  leftSection?: ReactNode;
}

/**
 * Xentral-Stil "Aktionsmenue am Beleg" (Skill AM-1): EIN gruppiertes Dropdown statt einer
 * ueberlaufenden Button-Reihe in Listenzeilen/Detailkoepfen. Aktionen werden nach `group`
 * zu Abschnitten (Menu.Label + Divider) gebuendelt. Klicks stoppen die Event-Propagation,
 * damit der Zeilen-Klick (Beleg oeffnen) nicht zusaetzlich ausloest. Leere Aktionsliste -> null.
 */
export function DocActionMenu({
  actions,
  label = "Aktionen",
  size = "compact-xs",
  variant = "default",
}: {
  actions: Array<DocAction | false | null | undefined>;
  label?: string;
  size?: string;
  variant?: string;
}): JSX.Element | null {
  const visible = actions.filter((a): a is DocAction => Boolean(a));
  if (visible.length === 0) return null;
  // Gruppen in Eingabereihenfolge sammeln (stabile Abschnittsfolge).
  const groups: string[] = [];
  for (const a of visible) { const g = a.group ?? ""; if (!groups.includes(g)) groups.push(g); }
  return (
    <Menu shadow="md" width={250} position="bottom-end" withinPortal>
      <Menu.Target>
        <Button size={size} variant={variant} onClick={(e) => e.stopPropagation()}>{label} ▾</Button>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        {groups.map((g, gi) => (
          <Fragment key={g || `g${gi}`}>
            {gi > 0 && <Menu.Divider />}
            {g && <Menu.Label>{g}</Menu.Label>}
            {visible.filter((a) => (a.group ?? "") === g).map((a, i) => (
              <Menu.Item
                key={`${g}-${i}`}
                color={a.color}
                disabled={a.disabled}
                title={a.title}
                leftSection={a.leftSection}
                onClick={(e) => { e.stopPropagation(); a.onClick(); }}
              >
                {a.label}
              </Menu.Item>
            ))}
          </Fragment>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

export function EmptyState({
  icon = "📭",
  title,
  hint,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}): JSX.Element {
  return (
    <Box ta="center" py="xl" px="md" mt="sm"
      style={{ border: "2px dashed #D6DAE1", borderRadius: 14, background: "#FAFBFC" }}>
      <Text fz={32} aria-hidden>{icon}</Text>
      <Text fw={600} mt={4}>{title}</Text>
      {hint && <Text size="sm" c="dimmed" mt={4} maw={440} mx="auto">{hint}</Text>}
      {actionLabel && onAction && <Button mt="md" size="sm" onClick={onAction}>{actionLabel}</Button>}
    </Box>
  );
}

/** Kopf einer Listenansicht: Modul-Breadcrumb, Titel, optionaler Hinweis, Primär-Aktion, Filterzeile. */
export function DocListHeader({
  module,
  title,
  hint,
  action,
  filters,
}: {
  module?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
  filters?: ReactNode;
}): JSX.Element {
  return (
    <>
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <Box>
          {module && <Text size="xs" style={{ color: "#7A828F" }}>{module}</Text>}
          {/* Seitentitel = einzige <h1> der Route (Screenreader-Einstieg, WCAG page-has-heading-one). */}
          <Title order={1}>{title}</Title>
          {/* Untertitel im TEXMA-OS-Maß: 13.5px, Text-3. */}
          {hint && <Text mt={5} style={{ fontSize: 13.5, color: "#7A828F" }}>{hint}</Text>}
        </Box>
        {action && <Group gap="xs">{action}</Group>}
      </Group>
      {filters && <Group gap="sm" mt="sm" wrap="wrap">{filters}</Group>}
    </>
  );
}

/** Hülle einer Formular-/Detailansicht: Breadcrumb, Titel + Statusabzeichen, rechtsbündige Aktionsleiste. */
export function DocFormShell({
  breadcrumb,
  title,
  status,
  statusColor = "gray",
  actions,
  children,
}: {
  breadcrumb: string;
  title: string;
  status?: string;
  statusColor?: string;
  actions?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Box>
          <Text size="xs" c="dimmed">{breadcrumb}</Text>
          <Group gap="sm" align="center">
            {/* Beleg-Titel = einzige <h1> der Detail-Route (siehe DocListHeader). */}
            <Title order={1}>{title}</Title>
            {status && <Badge color={statusColor} variant="light">{prettyStatus(status)}</Badge>}
          </Group>
        </Box>
        {actions && <Group gap="xs">{actions}</Group>}
      </Group>
      {children}
    </>
  );
}

/** Status-Indikator wie in ERPNext-Listen: farbiger Punkt + Beschriftung. */
export function StatusDot({ color, label }: { color: string; label: string }): JSX.Element {
  return (
    <Group gap={6} align="center" wrap="nowrap" component="span">
      <Box component="span" style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
      <Text size="sm" component="span">{label}</Text>
    </Group>
  );
}
