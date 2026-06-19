// Auth-Gate + Auftrags-Eingang (Slice T-01). Zeigt, dass Rolle PRODUKTION keine
// Preise/Kundendaten sieht (serverseitig redigiert).
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { Login } from "./Login.js";
import { Reporting } from "./Reporting.js";
import { trpc } from "./trpc.js";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  totpEnabled: boolean;
}

interface OrderRow {
  id: string;
  number: string;
  companyId: string;
  externalNumber: string | null;
  employeeNote: string | null;
  totalNetCents: number | null;
}

const box: CSSProperties = { fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "2rem auto", padding: "0 1rem" };
const th: CSSProperties = { textAlign: "left", borderBottom: "2px solid #ccc", padding: "6px 8px" };
const td: CSSProperties = { borderBottom: "1px solid #eee", padding: "6px 8px" };

const euro = (cents: number | null) => (cents == null ? "—" : (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" }));

export function App(): JSX.Element {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined); // undefined = lädt

  const loadMe = useCallback(async () => {
    try {
      setUser((await trpc.auth.me.query()) as AuthUser);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  if (user === undefined) return <p style={box}>lädt…</p>;
  if (!user) return <Login onAuthed={loadMe} />;
  return <Orders user={user} onLogout={async () => { await trpc.auth.logout.mutate(); setUser(null); }} />;
}

function Orders({ user, onLogout }: { user: AuthUser; onLogout: () => Promise<void> }): JSX.Element {
  const [tab, setTab] = useState<"orders" | "reporting">("orders");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      setOrders((await trpc.shopOrders.list.query({ limit: 50 })) as OrderRow[]);
    } catch (err) {
      setStatus(`Fehler: ${(err as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>TEXMA ERP</h1>
        <span>
          {user.name} ({user.role}) · <button onClick={() => void onLogout()}>Abmelden</button>
        </span>
      </div>
      <nav style={{ display: "flex", gap: "0.5rem", margin: "0.5rem 0 1rem" }}>
        <button onClick={() => setTab("orders")} disabled={tab === "orders"}>Aufträge</button>
        <button onClick={() => setTab("reporting")} disabled={tab === "reporting"}>Auswertungen</button>
      </nav>
      {tab === "reporting" ? <Reporting role={user.role} /> : <OrdersTable orders={orders} status={status} role={user.role} onReload={load} />}
    </main>
  );
}

function OrdersTable({ orders, status, role, onReload }: { orders: OrderRow[]; status: string; role: string; onReload: () => Promise<void> }): JSX.Element {
  return (
    <>
      <h2>Auftrags-Eingang</h2>
      <p style={{ color: "#555" }}>
        {role === "PRODUKTION"
          ? "Rolle PRODUKTION: Preise/Kundendaten sind serverseitig ausgeblendet (Kap. 12)."
          : "Shop-Bestellungen werden der Firma zugeordnet (T-01)."}
      </p>
      <button onClick={() => void onReload()}>Aktualisieren</button>
      {status && <p><em>{status}</em></p>}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
        <thead>
          <tr>
            <th style={th}>Auftrag</th>
            <th style={th}>Shop-Nr.</th>
            <th style={th}>Firma</th>
            <th style={th}>Auftragswert</th>
            <th style={th}>Mitarbeiter (Vermerk)</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td style={td}>{o.number}</td>
              <td style={td}>{o.externalNumber ?? "—"}</td>
              <td style={td}>{o.companyId}</td>
              <td style={td}>{euro(o.totalNetCents)}</td>
              <td style={td}>{o.employeeNote ?? "—"}</td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr><td style={td} colSpan={5}>Keine Aufträge.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
