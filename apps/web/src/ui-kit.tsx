// UI-Kit (Frontend-Fundament, Phase 0): abhängigkeitsfreie Basis-Bausteine, die in der
// Codebasis fehlten und deshalb tausend Notlösungen erzwangen (Browser-Popups,
// Inline-Panel-Styles). Im Projekt-Ethos eigener, dep-freier Bausteine (vgl. node:tls-SMTP).
//
//  - Toasts: notify.success/error/info(...) — imperativ, auch aus Nicht-Komponenten-Code
//    (z. B. Beleg-Action-Callbacks), plus useToast() für Komponenten.
//  - Dialoge: confirmDialog(...) / promptDialog(...) — Promise-basiert statt Browser-Popups.
//  - <Panel>: Standard-umrandete Box mit Token-Radius statt wiederholtem Inline-Style.

import { Alert, Box, Button, Group, Modal, Stack, Text, TextInput, type BoxProps } from "@mantine/core";
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
