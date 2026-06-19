// Auth-Gate + Auftrags-Eingang (Slice T-01). Zeigt, dass Rolle PRODUKTION keine
// Preise/Kundendaten sieht (serverseitig redigiert).
import { useCallback, useEffect, useState } from "react";
import { Login } from "./Login.js";
import { Reporting } from "./Reporting.js";
import { Differentiators } from "./Differentiators.js";
import { trpc } from "./trpc.js";
import { T, euro, box, th, td, tdNum } from "./theme.js";

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

type Tab = "orders" | "differentiators" | "reporting";
const TABS: readonly Tab[] = ["orders", "differentiators", "reporting"];
const hashTab = (): Tab => {
  const h = (typeof location !== "undefined" ? location.hash.replace("#", "") : "") as Tab;
  return TABS.includes(h) ? h : "orders";
};

function Orders({ user, onLogout }: { user: AuthUser; onLogout: () => Promise<void> }): JSX.Element {
  const [tab, setTabState] = useState<Tab>(hashTab);
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    if (typeof location !== "undefined") location.hash = t; // teilbarer Deep-Link je Tab
  }, []);
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
        <button onClick={() => setTab("differentiators")} disabled={tab === "differentiators"}>Differenzierer</button>
        <button onClick={() => setTab("reporting")} disabled={tab === "reporting"}>Auswertungen</button>
      </nav>
      {tab === "reporting" ? (
        <Reporting role={user.role} />
      ) : tab === "differentiators" ? (
        <Differentiators role={user.role} />
      ) : (
        <OrdersTable orders={orders} status={status} role={user.role} onReload={load} />
      )}
    </main>
  );
}

function OrdersTable({ orders, status, role, onReload }: { orders: OrderRow[]; status: string; role: string; onReload: () => Promise<void> }): JSX.Element {
  return (
    <>
      <h2>Auftrags-Eingang</h2>
      <p style={{ color: T.text2 }}>
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
            <th style={{ ...th, textAlign: "right" }}>Auftragswert</th>
            <th style={th}>Mitarbeiter (Vermerk)</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td style={td}>{o.number}</td>
              <td style={td}>{o.externalNumber ?? "—"}</td>
              <td style={td}>{o.companyId}</td>
              <td style={tdNum}>{euro(o.totalNetCents)}</td>
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
