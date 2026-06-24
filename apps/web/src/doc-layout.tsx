// Wiederverwendbare ERPNext/Frappe-Layout-Primitive für das einheitliche
// „List → Form"-Muster: Listenkopf (Titel + Aktion + Filterzeile), Formular-Hülle
// (Breadcrumb + Titel + Statusabzeichen + Aktionsleiste) und Status-Indikator-Punkt.
import { Badge, Box, Group, Text, Title } from "@mantine/core";
import { type ReactNode } from "react";

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
          {module && <Text size="xs" c="dimmed">{module}</Text>}
          <Title order={3}>{title}</Title>
          {hint && <Text size="sm" c="dimmed" mt={2}>{hint}</Text>}
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
            <Title order={3}>{title}</Title>
            {status && <Badge color={statusColor} variant="light">{status}</Badge>}
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
