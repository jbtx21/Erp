// Dünner, klickbarer Durchstich (B5): Shop-Aufträge importieren und auflisten.
// Demonstriert T-01 sichtbar — verschiedene Mitarbeiter, dieselbe Firma.
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { trpc } from "./trpc.js";

interface OrderRow {
  id: string;
  number: string;
  companyId: string;
  externalNumber: string | null;
  employeeNote: string | null;
}

const box: CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  maxWidth: 920,
  margin: "2rem auto",
  padding: "0 1rem",
};
const th: CSSProperties = { textAlign: "left", borderBottom: "2px solid #ccc", padding: "6px 8px" };
const td: CSSProperties = { borderBottom: "1px solid #eee", padding: "6px 8px" };

export function App(): JSX.Element {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [shopConnectorId, setShopConnectorId] = useState("shop_acme");
  const [companyId, setCompanyId] = useState("company_acme");
  const [employee, setEmployee] = useState("Max Mustermann");
  const [status, setStatus] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const list = await trpc.shopOrders.list.query({ limit: 50 });
      setOrders(list as OrderRow[]);
    } catch (err) {
      setStatus(`Fehler beim Laden: ${(err as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ingest = useCallback(async () => {
    setStatus("Importiere…");
    const [first, ...rest] = employee.split(" ");
    const raw = {
      id: Math.floor(Math.random() * 1_000_000),
      number: `WC-${Date.now()}`,
      status: "processing",
      billing: { first_name: first ?? "", last_name: rest.join(" "), email: "" },
      line_items: [{ name: "T-Shirt schwarz / L + Stick Brust", quantity: 5, price: "24.90" }],
    };
    try {
      const res = await trpc.shopOrders.ingest.mutate({ raw, shopConnectorId, companyId });
      setStatus(res.created ? `Auftrag ${res.order.number} angelegt.` : "Bereits importiert (idempotent).");
      await load();
    } catch (err) {
      setStatus(`Import fehlgeschlagen: ${(err as Error).message}`);
    }
  }, [employee, shopConnectorId, companyId, load]);

  const companies = new Set(orders.map((o) => o.companyId));

  return (
    <main style={box}>
      <h1>TEXMA ERP — Auftrags-Eingang (Slice T-01)</h1>
      <p style={{ color: "#555" }}>
        Shop-Bestellungen werden der <strong>Firma</strong> zugeordnet, nicht dem Mitarbeiterkonto.
        Aktuell {orders.length} Aufträge auf {companies.size} Firma(en).
      </p>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", margin: "1rem 0" }}>
        <label>Shop-Connector<br /><input value={shopConnectorId} onChange={(e) => setShopConnectorId(e.target.value)} /></label>
        <label>Firma (companyId)<br /><input value={companyId} onChange={(e) => setCompanyId(e.target.value)} /></label>
        <label>Mitarbeiter<br /><input value={employee} onChange={(e) => setEmployee(e.target.value)} /></label>
        <button onClick={() => void ingest()}>Demo-Bestellung importieren</button>
        <button onClick={() => void load()}>Aktualisieren</button>
      </section>

      {status && <p><em>{status}</em></p>}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Auftrag</th>
            <th style={th}>Shop-Nr.</th>
            <th style={th}>Firma</th>
            <th style={th}>Mitarbeiter (Vermerk)</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td style={td}>{o.number}</td>
              <td style={td}>{o.externalNumber ?? "—"}</td>
              <td style={td}>{o.companyId}</td>
              <td style={td}>{o.employeeNote ?? "—"}</td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr><td style={td} colSpan={4}>Noch keine Aufträge — oben eine Demo-Bestellung importieren.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
