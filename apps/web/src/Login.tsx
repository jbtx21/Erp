// Login (Kap. 14): Passwort, danach optional TOTP-2FA (wenn für den Nutzer aktiv).
import { type CSSProperties, useState } from "react";
import { trpc } from "./trpc.js";

const card: CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  maxWidth: 360,
  margin: "4rem auto",
  padding: "1.5rem",
  border: "1px solid #ddd",
  borderRadius: 8,
};
const field: CSSProperties = { display: "block", width: "100%", margin: "0.4rem 0", padding: 6 };

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
    <main style={card}>
      <h1 style={{ fontSize: "1.2rem" }}>TEXMA ERP — Anmeldung</h1>
      {!needsTotp ? (
        <>
          <input style={field} placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={field} type="password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button style={field} onClick={() => void submitPassword()}>Anmelden</button>
        </>
      ) : (
        <>
          <p>2FA-Code aus der Authenticator-App eingeben:</p>
          <input style={field} inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
          <button style={field} onClick={() => void submitTotp()}>Bestätigen</button>
        </>
      )}
      {error && <p style={{ color: "#c00" }}>{error}</p>}
    </main>
  );
}
