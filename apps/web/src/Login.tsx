// Login (Kap. 14): Passwort, danach optional TOTP-2FA (wenn für den Nutzer aktiv).
// Zusätzlich: „Passwort vergessen" (Reset-Link per E-Mail) + Token-Reset-Formular
// (aufgerufen über den E-Mail-Link `…/#reset?token=…`). UI: Mantine (erp-ui-design).
import { useState } from "react";
import { Button, Paper, PasswordInput, Stack, Text, TextInput, Title, Anchor, Alert } from "@mantine/core";
import { trpc } from "./trpc.js";

/** Liest ein Reset-Token aus dem URL-Hash `#reset?token=…` (sonst null). */
function resetTokenFromHash(): string | null {
  if (typeof location === "undefined") return null;
  const h = location.hash.replace(/^#/, "");
  if (!h.startsWith("reset")) return null;
  const q = h.includes("?") ? h.slice(h.indexOf("?") + 1) : "";
  return new URLSearchParams(q).get("token");
}

export function Login({ onAuthed }: { onAuthed: () => void }): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [info, setInfo] = useState("");
  const [resetToken] = useState<string | null>(resetTokenFromHash);

  const submitPassword = async () => {
    setError("");
    try {
      const res = await trpc.auth.login.mutate({ email, password });
      if (res?.needsTotp) setNeedsTotp(true);
      else onAuthed();
    } catch {
      setError("Anmeldung fehlgeschlagen.");
    }
  };

  const submitTotp = async () => {
    setError("");
    try {
      await trpc.auth.verifyTotp.mutate({ code });
      onAuthed();
    } catch {
      setError("Falscher 2FA-Code.");
    }
  };

  const submitForgot = async () => {
    setError(""); setInfo("");
    try {
      await trpc.auth.requestPasswordReset.mutate({ email });
      setInfo("Falls die Adresse bekannt ist, wurde ein Link zum Zurücksetzen versendet. Bitte das Postfach prüfen.");
    } catch {
      setInfo("Falls die Adresse bekannt ist, wurde ein Link zum Zurücksetzen versendet. Bitte das Postfach prüfen.");
    }
  };

  if (resetToken) return <ResetForm token={resetToken} />;

  return (
    <Paper withBorder radius="md" p="lg" maw={360} mx="auto" mt="xl">
      <Title order={3} mb="md">TEXMA ERP — Anmeldung</Title>
      {mode === "forgot" ? (
        <Stack gap="sm">
          <Text size="sm">E-Mail-Adresse eingeben — wir senden einen Link zum Zurücksetzen.</Text>
          <TextInput label="E-Mail" value={email} onChange={(e) => setEmail(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && void submitForgot()} />
          <Button onClick={() => void submitForgot()}>Link anfordern</Button>
          <Anchor size="sm" onClick={() => { setMode("login"); setInfo(""); setError(""); }}>Zurück zur Anmeldung</Anchor>
        </Stack>
      ) : !needsTotp ? (
        <Stack gap="sm">
          <TextInput label="E-Mail" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          <PasswordInput
            label="Passwort" value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && void submitPassword()}
          />
          <Button onClick={() => void submitPassword()}>Anmelden</Button>
          <Anchor size="sm" onClick={() => { setMode("forgot"); setError(""); }}>Passwort vergessen?</Anchor>
        </Stack>
      ) : (
        <Stack gap="sm">
          <Text size="sm">2FA-Code aus der Authenticator-App eingeben:</Text>
          <TextInput
            inputMode="numeric" placeholder="123456" value={code}
            onChange={(e) => setCode(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && void submitTotp()}
          />
          <Button onClick={() => void submitTotp()}>Bestätigen</Button>
        </Stack>
      )}
      {info && <Alert color="green" mt="sm">{info}</Alert>}
      {error && <Text c="red" size="sm" mt="sm">{error}</Text>}
    </Paper>
  );
}

/** Formular hinter dem E-Mail-Reset-Link: neues Passwort setzen. */
function ResetForm({ token }: { token: string }): JSX.Element {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    if (pw.length < 8) { setError("Mindestens 8 Zeichen."); return; }
    if (pw !== pw2) { setError("Die Passwörter stimmen nicht überein."); return; }
    try {
      await trpc.auth.resetPassword.mutate({ token, newPassword: pw });
      setDone(true);
    } catch {
      setError("Reset-Link ungültig oder abgelaufen. Bitte erneut anfordern.");
    }
  };

  const backToLogin = () => { if (typeof location !== "undefined") { location.hash = ""; location.reload(); } };

  return (
    <Paper withBorder radius="md" p="lg" maw={360} mx="auto" mt="xl">
      <Title order={3} mb="md">Neues Passwort setzen</Title>
      {done ? (
        <Stack gap="sm">
          <Alert color="green">Passwort wurde geändert. Bitte neu anmelden.</Alert>
          <Button onClick={backToLogin}>Zur Anmeldung</Button>
        </Stack>
      ) : (
        <Stack gap="sm">
          <PasswordInput label="Neues Passwort" value={pw} onChange={(e) => setPw(e.currentTarget.value)} />
          <PasswordInput label="Wiederholung" value={pw2} onChange={(e) => setPw2(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()} />
          <Button onClick={() => void submit()}>Passwort setzen</Button>
          <Anchor size="sm" onClick={backToLogin}>Zurück zur Anmeldung</Anchor>
          {error && <Text c="red" size="sm">{error}</Text>}
        </Stack>
      )}
    </Paper>
  );
}
