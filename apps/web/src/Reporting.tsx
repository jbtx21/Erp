// Reporting-Ansicht (Kap. 29/35): Umsatz-/Auftragsübersicht, Periodenvergleich,
// KI-Zusammenfassung sowie operative Produktions-KPIs (Durchlaufzeit, Fehlerquote,
// Termintreue). Granularität Tag/Woche/Monat/Jahr umschaltbar. Finanzkennzahlen nur
// für nicht-PRODUKTION (serverseitig per RBAC erzwungen); operative KPIs für alle.
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { trpc } from "./trpc.js";

type Granularity = "DAY" | "WEEK" | "MONTH" | "YEAR";

interface Bucket {
  key: string;
  count: number;
  netCents: number;
}
interface RevenueOverview {
  buckets: Bucket[];
  totalNetCents: number;
}
interface OrderOverview {
  buckets: Bucket[];
  totalNetCents: number;
  totalCount: number;
}
interface PeriodComparison {
  current: { key: string; netCents: number };
  previous: { netCents: number } | null;
  deltaCents: number;
  deltaPercent: number | null;
}
interface LeadTimeOverview {
  buckets: { key: string; count: number; avgHours: number }[];
  stats: { count: number; avgHours: number; medianHours: number; minHours: number; maxHours: number };
}
interface DefectOverview {
  buckets: { key: string; total: number; defects: number; ratePercent: number | null }[];
  overall: { total: number; defects: number; ratePercent: number | null };
  byCause: { LIEFERANT: number; INTERN: number; EXTERN_VEREDLER: number };
}
interface OnTimeOverview {
  buckets: { key: string; total: number; onTime: number; ratePercent: number | null }[];
  overall: { total: number; onTime: number; ratePercent: number | null };
}
interface AiSummary {
  aiGenerated: boolean;
  narrative: string;
}

const box: CSSProperties = { fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "2rem auto", padding: "0 1rem" };
const th: CSSProperties = { textAlign: "left", borderBottom: "2px solid #ccc", padding: "6px 8px" };
const tdc: CSSProperties = { borderBottom: "1px solid #eee", padding: "6px 8px" };
const card: CSSProperties = { border: "1px solid #e2e2e2", borderRadius: 8, padding: "1rem", marginTop: "1.25rem" };
const kpi: CSSProperties = { display: "inline-block", marginRight: "2rem", fontSize: "1.1rem" };

const euro = (cents: number) => (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const pct = (p: number | null) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p} %`);
const ratePct = (p: number | null) => (p == null ? "—" : `${p} %`);

export function Reporting({ role }: { role: string }): JSX.Element {
  const isProduction = role === "PRODUKTION";
  const [granularity, setGranularity] = useState<Granularity>("MONTH");
  const [status, setStatus] = useState("");

  const [revenue, setRevenue] = useState<RevenueOverview | null>(null);
  const [orders, setOrders] = useState<OrderOverview | null>(null);
  const [compare, setCompare] = useState<PeriodComparison | null>(null);
  const [leadTime, setLeadTime] = useState<LeadTimeOverview | null>(null);
  const [defects, setDefects] = useState<DefectOverview | null>(null);
  const [onTime, setOnTime] = useState<OnTimeOverview | null>(null);
  const [ai, setAi] = useState<AiSummary | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus("");
    setAi(null);
    try {
      // Operative KPIs (alle Rollen).
      const [lt, df, ot] = await Promise.all([
        trpc.productionReporting.leadTime.query({ granularity }),
        trpc.productionReporting.defects.query({ granularity }),
        trpc.productionReporting.onTime.query({ granularity }),
      ]);
      setLeadTime(lt as LeadTimeOverview);
      setDefects(df as DefectOverview);
      setOnTime(ot as OnTimeOverview);

      // Finanzkennzahlen nur für nicht-PRODUKTION.
      if (!isProduction) {
        const [rev, ord, cmp] = await Promise.all([
          trpc.reporting.revenueOverview.query({ granularity }),
          trpc.reporting.orderOverview.query({ granularity }),
          trpc.reporting.compareRevenue.query({ granularity }),
        ]);
        setRevenue(rev as RevenueOverview);
        setOrders(ord as OrderOverview);
        setCompare(cmp as PeriodComparison);
      }
    } catch (err) {
      setStatus(`Fehler: ${(err as Error).message}`);
    }
  }, [granularity, isProduction]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAi = useCallback(async () => {
    setAiBusy(true);
    try {
      setAi((await trpc.reporting.aiSummary.mutate({ granularity })) as AiSummary);
    } catch (err) {
      setStatus(`KI-Fehler: ${(err as Error).message}`);
    } finally {
      setAiBusy(false);
    }
  }, [granularity]);

  return (
    <section style={box}>
      <h2>Auswertungen</h2>
      <label>
        Zeitraum:{" "}
        <select value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)}>
          <option value="DAY">Tag</option>
          <option value="WEEK">Woche</option>
          <option value="MONTH">Monat</option>
          <option value="YEAR">Jahr</option>
        </select>
      </label>{" "}
      <button onClick={() => void load()}>Aktualisieren</button>
      {status && <p><em>{status}</em></p>}

      {!isProduction && revenue && orders && compare && (
        <div style={card}>
          <h3>Umsatz &amp; Aufträge</h3>
          <div>
            <span style={kpi}>Umsatz gesamt: <strong>{euro(revenue.totalNetCents)}</strong></span>
            <span style={kpi}>Aufträge gesamt: <strong>{orders.totalCount}</strong></span>
            <span style={kpi}>
              Vergleich {compare.current.key}: <strong>{euro(compare.deltaCents)}</strong> ({pct(compare.deltaPercent)})
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
            <thead>
              <tr>
                <th style={th}>Periode</th>
                <th style={th}>Umsatz (Netto)</th>
                <th style={th}>Rechnungen</th>
                <th style={th}>Aufträge</th>
                <th style={th}>Auftragswert</th>
              </tr>
            </thead>
            <tbody>
              {revenue.buckets.map((b) => {
                const o = orders.buckets.find((x) => x.key === b.key);
                return (
                  <tr key={b.key}>
                    <td style={tdc}>{b.key}</td>
                    <td style={tdc}>{euro(b.netCents)}</td>
                    <td style={tdc}>{b.count}</td>
                    <td style={tdc}>{o?.count ?? 0}</td>
                    <td style={tdc}>{euro(o?.netCents ?? 0)}</td>
                  </tr>
                );
              })}
              {revenue.buckets.length === 0 && <tr><td style={tdc} colSpan={5}>Keine Daten.</td></tr>}
            </tbody>
          </table>

          <div style={{ marginTop: "1rem" }}>
            <button onClick={() => void runAi()} disabled={aiBusy}>
              {aiBusy ? "KI erstellt Bericht…" : "KI-Zusammenfassung erstellen"}
            </button>
            {ai && (
              <p style={{ marginTop: "0.5rem", background: "#f6f8fa", padding: "0.75rem", borderRadius: 6 }}>
                {ai.narrative}
                <br />
                <small style={{ color: "#777" }}>
                  {ai.aiGenerated ? "KI-generiert (Claude)" : "Automatische Heuristik (keine KI verfügbar)"}
                </small>
              </p>
            )}
          </div>
        </div>
      )}

      {leadTime && (
        <div style={card}>
          <h3>Durchlaufzeit (Lead Time)</h3>
          <div>
            <span style={kpi}>Ø: <strong>{leadTime.stats.avgHours} h</strong></span>
            <span style={kpi}>Median: <strong>{leadTime.stats.medianHours} h</strong></span>
            <span style={kpi}>Min/Max: <strong>{leadTime.stats.minHours} / {leadTime.stats.maxHours} h</strong></span>
            <span style={kpi}>Aufträge: <strong>{leadTime.stats.count}</strong></span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
            <thead><tr><th style={th}>Periode</th><th style={th}>Aufträge</th><th style={th}>Ø Durchlaufzeit</th></tr></thead>
            <tbody>
              {leadTime.buckets.map((b) => (
                <tr key={b.key}><td style={tdc}>{b.key}</td><td style={tdc}>{b.count}</td><td style={tdc}>{b.avgHours} h</td></tr>
              ))}
              {leadTime.buckets.length === 0 && <tr><td style={tdc} colSpan={3}>Keine Daten.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {defects && (
        <div style={card}>
          <h3>Fehlerquote (Reklamationen)</h3>
          <div>
            <span style={kpi}>Gesamt: <strong>{ratePct(defects.overall.ratePercent)}</strong> ({defects.overall.defects}/{defects.overall.total})</span>
            <span style={kpi}>Lieferant: <strong>{defects.byCause.LIEFERANT}</strong></span>
            <span style={kpi}>Intern: <strong>{defects.byCause.INTERN}</strong></span>
            <span style={kpi}>Veredler: <strong>{defects.byCause.EXTERN_VEREDLER}</strong></span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
            <thead><tr><th style={th}>Periode</th><th style={th}>Aufträge</th><th style={th}>Reklamationen</th><th style={th}>Quote</th></tr></thead>
            <tbody>
              {defects.buckets.map((b) => (
                <tr key={b.key}><td style={tdc}>{b.key}</td><td style={tdc}>{b.total}</td><td style={tdc}>{b.defects}</td><td style={tdc}>{ratePct(b.ratePercent)}</td></tr>
              ))}
              {defects.buckets.length === 0 && <tr><td style={tdc} colSpan={4}>Keine Daten.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {onTime && (
        <div style={card}>
          <h3>Termintreue (On-Time)</h3>
          <div>
            <span style={kpi}>Gesamt: <strong>{ratePct(onTime.overall.ratePercent)}</strong> ({onTime.overall.onTime}/{onTime.overall.total})</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
            <thead><tr><th style={th}>Periode</th><th style={th}>Aufträge</th><th style={th}>Pünktlich</th><th style={th}>Quote</th></tr></thead>
            <tbody>
              {onTime.buckets.map((b) => (
                <tr key={b.key}><td style={tdc}>{b.key}</td><td style={tdc}>{b.total}</td><td style={tdc}>{b.onTime}</td><td style={tdc}>{ratePct(b.ratePercent)}</td></tr>
              ))}
              {onTime.buckets.length === 0 && <tr><td style={tdc} colSpan={4}>Keine Daten.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
