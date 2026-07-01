// UI-Kit (Frontend-Fundament, Phase 0): abhängigkeitsfreie Basis-Bausteine, die in der
// Codebasis fehlten und deshalb tausend Notlösungen erzwangen (Browser-Popups,
// Inline-Panel-Styles). Im Projekt-Ethos eigener, dep-freier Bausteine (vgl. node:tls-SMTP).
//
//  - Toasts: notify.success/error/info(...) — imperativ, auch aus Nicht-Komponenten-Code
//    (z. B. Beleg-Action-Callbacks), plus useToast() für Komponenten.
//  - Dialoge: confirmDialog(...) / promptDialog(...) — Promise-basiert statt Browser-Popups.
//  - <Panel>: Standard-umrandete Box mit Token-Radius statt wiederholtem Inline-Style.

import { Alert, Box, Button, Group, Modal, Paper, Stack, Text, TextInput, type BoxProps } from "@mantine/core";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// ── Toasts ────────────────────────────────────────────────────────────────────
type ToastKind = "success" | "error" | "info";
interface Toast { id: number; kind: ToastKind; message: ReactNode }

const TOAST_COLOR: Record<ToastKind, string> = { success: "teal", error: "red", info: "blue" };

// Modul-Emitter: der Provider registriert seine Dispatch-Funktion hier, sodass `notify.*`
// auch außerhalb von React-Komponenten feuern kann (react-hot-toast-Muster).
let pushToast: ((kind: ToastKind, message: ReactNode) => void) | null = null;
export const notify = {
  success: (m: ReactNode): void => pushToast?.("success", m),
  error: (m: ReactNode): void => pushToast?.("error", m),
  info: (m: ReactNode): void => pushToast?.("info", m),
};

const ToastCtx = createContext<(kind: ToastKind, message: ReactNode) => void>(() => undefined);

/** Komponenten-Ergonomie: const t = useToast(); t.success("…"). */
export function useToast(): { success: (m: ReactNode) => void; error: (m: ReactNode) => void; info: (m: ReactNode) => void } {
  const push = useContext(ToastCtx);
  return { success: (m) => push("success", m), error: (m) => push("error", m), info: (m) => push("info", m) };
}

// ── Dialoge (Confirm / Prompt) ──────────────────────────────────────────────────
export interface ConfirmOpts { title?: string; message: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
export interface PromptOpts { title?: string; label?: string; message?: ReactNode; defaultValue?: string; placeholder?: string; confirmLabel?: string }

let openConfirm: ((o: ConfirmOpts) => Promise<boolean>) | null = null;
let openPrompt: ((o: PromptOpts) => Promise<string | null>) | null = null;

/** Bestätigungsdialog — gibt true zurück, wenn bestätigt. Ohne Host: false (sicherer Default). */
export const confirmDialog = (o: ConfirmOpts): Promise<boolean> => (openConfirm ? openConfirm(o) : Promise.resolve(false));
/** Eingabedialog — gibt den Text zurück oder null bei Abbruch. */
export const promptDialog = (o: PromptOpts): Promise<string | null> => (openPrompt ? openPrompt(o) : Promise.resolve(null));

function DialogHost(): JSX.Element {
  const [confirmState, setConfirmState] = useState<(ConfirmOpts & { resolve: (b: boolean) => void }) | null>(null);
  const [promptState, setPromptState] = useState<(PromptOpts & { resolve: (s: string | null) => void }) | null>(null);
  const [promptVal, setPromptVal] = useState("");

  useEffect(() => {
    openConfirm = (o) => new Promise<boolean>((resolve) => setConfirmState({ ...o, resolve }));
    openPrompt = (o) => new Promise<string | null>((resolve) => { setPromptVal(o.defaultValue ?? ""); setPromptState({ ...o, resolve }); });
    return () => { openConfirm = null; openPrompt = null; };
  }, []);

  const closeConfirm = (val: boolean): void => { confirmState?.resolve(val); setConfirmState(null); };
  const closePrompt = (val: string | null): void => { promptState?.resolve(val); setPromptState(null); };

  return (
    <>
      <Modal opened={confirmState !== null} onClose={() => closeConfirm(false)} title={confirmState?.title ?? "Bestätigung"} centered>
        <Stack gap="md">
          <Text size="sm">{confirmState?.message}</Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={() => closeConfirm(false)}>{confirmState?.cancelLabel ?? "Abbrechen"}</Button>
            <Button color={confirmState?.danger ? "red" : undefined} onClick={() => closeConfirm(true)}>{confirmState?.confirmLabel ?? "OK"}</Button>
          </Group>
        </Stack>
      </Modal>
      <Modal opened={promptState !== null} onClose={() => closePrompt(null)} title={promptState?.title ?? "Eingabe"} centered>
        <Stack gap="md">
          {promptState?.message && <Text size="sm">{promptState.message}</Text>}
          <TextInput label={promptState?.label} placeholder={promptState?.placeholder} value={promptVal} data-autofocus
            onChange={(e) => setPromptVal(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") closePrompt(promptVal); }} />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={() => closePrompt(null)}>Abbrechen</Button>
            <Button onClick={() => closePrompt(promptVal)}>{promptState?.confirmLabel ?? "OK"}</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

/** Einmal um <App/> gemountet: Toast-Stack (oben rechts) + Dialog-Host. */
export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const remove = useCallback((id: number): void => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((kind: ToastKind, message: ReactNode): void => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, message }]);
    if (kind !== "error") setTimeout(() => remove(id), 4000); // Fehler bleiben bis zum Schließen
  }, [remove]);
  useEffect(() => { pushToast = push; return () => { if (pushToast === push) pushToast = null; }; }, [push]);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <DialogHost />
      {createPortal(
        <div aria-live="polite" style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 400, pointerEvents: "none" }}>
          {toasts.map((t) => (
            <Alert key={t.id} color={TOAST_COLOR[t.kind]} withCloseButton onClose={() => remove(t.id)} role="status"
              style={{ pointerEvents: "auto", boxShadow: "0 6px 20px rgba(0,0,0,0.15)" }}>
              {t.message}
            </Alert>
          ))}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}

// ── Kennzahl-Karte (Vorzeige-Layout) ─────────────────────────────────────────
/** Trend-Richtung einer Kennzahl (Vormonats-Delta): hoch=positiv (teal), runter=negativ (rot). */
export interface MetricTrend { text: string; dir: "up" | "down" | "flat" }

/**
 * Moderne KPI-Karte: Akzent-Kachel (farbiges Icon-Feld) + Label + große Zahl + optionaler
 * Trend/Hinweis. Vereinheitlicht die bislang je Seite nachgebauten KPI-Kacheln (Start,
 * Termin-Ampel, Auftragsliste). `onClick` macht sie klick- UND tastaturbedienbar
 * (role=button, Enter/Space); der Hover-Lift kommt aus `.erp-metric` (index.css).
 * `accent` = Mantine-Farbname (navy/sky/forest/amber/danger/teal/blue …).
 */
export function MetricCard({
  label, value, icon, accent = "navy", hint, trend, onClick, ariaLabel, minWidth = 168,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  accent?: string;
  hint?: ReactNode;
  trend?: MetricTrend;
  onClick?: () => void;
  ariaLabel?: string;
  minWidth?: number;
}): JSX.Element {
  const clickable = Boolean(onClick);
  const trendColor = trend ? (trend.dir === "up" ? "teal.7" : trend.dir === "down" ? "red.7" : "dimmed") : undefined;
  const trendArrow = trend ? (trend.dir === "up" ? "↑" : trend.dir === "down" ? "↓" : "→") : "";
  const plainVal = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return (
    <Paper withBorder radius="md" p="md"
      className={`erp-metric${clickable ? " erp-metric--btn" : ""}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={ariaLabel ?? (clickable ? `${label}: ${plainVal}` : undefined)}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
      style={{ flex: `1 1 ${minWidth}px`, minWidth }}>
      <Group gap="sm" wrap="nowrap" align="flex-start">
        {icon != null && (
          <Box aria-hidden style={{
            flexShrink: 0, width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center",
            fontSize: 18, lineHeight: 1,
            background: `var(--mantine-color-${accent}-1)`, color: `var(--mantine-color-${accent}-7)`,
          }}>{icon}</Box>
        )}
        <Box style={{ minWidth: 0 }}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.4 }}>{label}</Text>
          <Text fz={26} fw={700} lh={1.15} mt={2} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</Text>
          {trend
            ? <Text size="xs" c={trendColor} mt={2}>{trendArrow} {trend.text}</Text>
            : hint != null ? <Text size="xs" c="dimmed" mt={2}>{hint}</Text> : null}
        </Box>
      </Group>
    </Paper>
  );
}

// ── Verteilungsbalken (Ampel/Anteile) ────────────────────────────────────────
/**
 * Proportionaler Statusbalken (z. B. ROT/GELB/GRÜN) + Legende mit Zählwerten. Nullsumme
 * rendert einen ruhigen Leerbalken (kein Sprung im Layout). `role="img"` + aria-label
 * fasst die Verteilung für Screenreader zusammen (Signal nicht allein über Farbe).
 */
export function SegmentBar({ segments, height = 10, legend = true }: {
  segments: ReadonlyArray<{ value: number; color: string; label: string }>;
  height?: number;
  legend?: boolean;
}): JSX.Element {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const aria = segments.map((s) => `${s.label}: ${s.value}`).join(", ");
  return (
    <Box>
      <Box role="img" aria-label={aria}
        style={{ display: "flex", height, borderRadius: 999, overflow: "hidden", background: "var(--mantine-color-gray-2)" }}>
        {total > 0 && segments.map((s) => (s.value > 0
          ? <Box key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.value}`} />
          : null))}
      </Box>
      {legend && (
        <Group gap="md" mt={8} wrap="wrap">
          {segments.map((s) => (
            <Group key={s.label} gap={6} wrap="nowrap">
              <Box aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <Text size="xs" c="dimmed">{s.label} <Text span fw={700} style={{ fontVariantNumeric: "tabular-nums" }}>{s.value}</Text></Text>
            </Group>
          ))}
        </Group>
      )}
    </Box>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────
/** Standard-umrandeter Container mit Token-Radius — ersetzt das wiederholte Inline-Panel-Muster
 *  `style={{ border: "1px solid …", borderRadius: 8 }}`. `surface` = dezenter Hintergrund. */
export function Panel({ children, surface, style, ...rest }: BoxProps & { children: ReactNode; surface?: boolean }): JSX.Element {
  return (
    <Box {...rest} style={{
      border: "1px solid var(--mantine-color-gray-3)",
      borderRadius: "var(--mantine-radius-md)",
      ...(surface ? { background: "var(--mantine-color-gray-0)" } : {}),
      ...(style as object),
    }}>
      {children}
    </Box>
  );
}
