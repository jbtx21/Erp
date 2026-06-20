// Login (Kap. 14): Passwort, danach optional TOTP-2FA (wenn für den Nutzer aktiv).
// UI: Mantine (erp-ui-design).
import { useState } from "react";
import { Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { trpc } from "./trpc.js";

export function Login({ onAuthed }: { onAuthed: () => void }): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <Paper withBorder radius="md" p="lg" maw={360} mx="auto" mt="xl">
      <Title order={3} mb="md">TEXMA ERP — Anmeldung</Title>
      {!needsTotp ? (
        <Stack gap="sm">
          <TextInput label="E-Mail" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          <PasswordInput
            label="Passwort" value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && void submitPassword()}
          />
          <Button onClick={() => void submitPassword()}>Anmelden</Button>
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
      {error && <Text c="red" size="sm" mt="sm">{error}</Text>}
    </Paper>
  );
}
