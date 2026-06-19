// Reporting-Ansicht (Kap. 29/35): Umsatz-/Auftragsübersicht (Tabelle + Liniendiagramm),
// Umsatz nach Shop/Kundengruppe (Tabelle + Balkendiagramm), Periodenvergleich,
// KI-Zusammenfassung sowie operative Produktions-KPIs (Durchlaufzeit, Fehlerquote,
// Termintreue). Granularität Tag/Woche/Monat/Jahr umschaltbar. CSV-Export je Abschnitt
// (clientseitig) + PDF-Export der Umsatz-Auswertung (serverseitig gerendert).
// Finanzkennzahlen nur für nicht-PRODUKTION (serverseitig per RBAC erzwungen).
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { BarChart, LineChart } from "./charts.js";
import { downloadBase64Pdf, downloadCsv } from "./export.js";
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
interface BreakdownItem {
  label: string;
  name: string;
  count: number;
  netCents: number;
  sharePercent: number | null;
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
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: "1rem" };
const csvBtn: CSSProperties = { float: "right", fontSize: "0.85rem" };

const euro = (cents: number) => (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const pct = (p: number | null) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p} %`);
const ratePct = (p: number | null) => (p == null ? "—" : `${p} %`);

/** Wandelt die <input type="date">-Werte (YYYY-MM-DD) in einen ISO-Range (UTC). */
function buildRange(from: string, to: string): { from?: string; to?: string } {
  return {
    ...(from ? { from: `${from}T00:00:00.000Z` } : {}),
    ...(to ? { to: `${to}T23:59:59.999Z` } : {}),
  };
}

export function Reporting({ role }: { role: string }): JSX.Element {
  const isProduction = role === "PRODUKTION";
  const [granularity, setGranularity] = useState<Granularity>("MONTH");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");

  const [revenue, setRevenue] = useState<RevenueOverview | null>(null);
  const [orders, setOrders] = useState<OrderOverview | null>(null);
  const [compare, setCompare] = useState<PeriodComparison | null>(null);
  const [byShop, setByShop] = useState<BreakdownItem[]>([]);
  const [byPriceGroup, setByPriceGroup] = useState<BreakdownItem[]>([]);
  const [byArticle, setByArticle] = useState<BreakdownItem[]>([]);
  const [leadTime, setLeadTime] = useState<LeadTimeOverview | null>(null);
  const [defects, setDefects] = useState<DefectOverview | null>(null);
  const [onTime, setOnTime] = useState<OnTimeOverview | null>(null);
  const [ai, setAi] = useState<AiSummary | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus("");
    setAi(null);
    const range = buildRange(from, to);
    try {
      const [lt, df, ot] = await Promise.all([
        trpc.productionReporting.leadTime.query({ granularity, ...range }),
        trpc.productionReporting.defects.query({ granularity, ...range }),
        trpc.productionReporting.onTime.query({ granularity, ...range }),
      ]);
      setLeadTime(lt as LeadTimeOverview);
      setDefects(df as DefectOverview);
      setOnTime(ot as OnTimeOverview);

      if (!isProduction) {
        const [rev, ord, cmp, shop, pg, art] = await Promise.all([
          trpc.reporting.revenueOverview.query({ granularity, ...range }),
          trpc.reporting.orderOverview.query({ granularity, ...range }),
          trpc.reporting.compareRevenue.query({ granularity }),
          trpc.reporting.revenueByShop.query(range),
          trpc.reporting.revenueByPriceGroup.query(range),
          trpc.reporting.revenueByArticle.query(range),
        ]);
        setRevenue(rev as RevenueOverview);
        setOrders(ord as OrderOverview);
        setCompare(cmp as PeriodComparison);
        setByShop(shop as BreakdownItem[]);
        setByPriceGroup(pg as BreakdownItem[]);
        setByArticle(art as BreakdownItem[]);
      }
    } catch (err) {
      setStatus(`Fehler: ${(err as Error).message}`);
    }
  }, [granularity, from, to, isProduction]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAi = useCallback(async () => {
    setAiBusy(true);
    try {
      setAi((await trpc.reporting.aiSummary.mutate({ granularity, ...buildRange(from, to) })) as AiSummary);
    } catch (err) {
      setStatus(`KI-Fehler: ${(err as Error).message}`);
    } finally {
      setAiBusy(false);
    }
  }, [granularity, from, to]);

  const exportPdf = useCallback(async () => {
    setPdfBusy(true);
    try {
      const res = (await trpc.reporting.exportPdf.mutate({ granularity, ...buildRange(from, to) })) as {
        fileName: string;
        pdfBase64: string;
      };
      downloadBase64Pdf(res.fileName, res.pdfBase64);
    } catch (err) {
      setStatus(`PDF-Fehler: ${(err as Error).message}`);
    } finally {
      setPdfBusy(false);
    }
  }, [granularity, from, to]);

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
      <label>von <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>{" "}
      <label>bis <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>{" "}
      {(from || to) && (
        <button onClick={() => { setFrom(""); setTo(""); }}>Zeitraum zurücksetzen</button>
      )}{" "}
      <button onClick={() => void load()}>Aktualisieren</button>{" "}
      {!isProduction && (
        <button onClick={() => void exportPdf()} disabled={pdfBusy}>
          {pdfBusy ? "PDF…" : "PDF-Export"}
        </button>
      )}
      {status && <p><em>{status}</em></p>}

      {!isProduction && revenue && orders && compare && (
        <div style={card}>
          <h3>
            Umsatz &amp; Aufträge
            <button
              style={csvBtn}
              onClick={() =>
                downloadCsv(
                  `umsatz-${granularity}.csv`,
                  ["Periode", "Umsatz Netto (Cent)", "Rechnungen", "Aufträge", "Auftragswert (Cent)"],
                  revenue.buckets.map((b) => {
                    const o = orders.buckets.find((x) => x.key === b.key);
                    return [b.key, String(b.netCents), String(b.count), String(o?.count ?? 0), String(o?.netCents ?? 0)];
                  })
                )
              }
            >
              CSV
            </button>
          </h3>
          <div>
            <span style={kpi}>Umsatz gesamt: <strong>{euro(revenue.totalNetCents)}</strong></span>
            <span style={kpi}>Aufträge gesamt: <strong>{orders.totalCount}</strong></span>
            <span style={kpi}>
              Vergleich {compare.current.key}: <strong>{euro(compare.deltaCents)}</strong> ({pct(compare.deltaPercent)})
            </span>
          </div>
          <LineChart data={revenue.buckets.map((b) => ({ label: b.key, value: b.netCents }))} format={euro} />
          <table style={tableStyle}>
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

      {!isProduction && (
        <Breakdown title="Umsatz nach Shop" items={byShop} fileName={`umsatz-shop-${granularity}.csv`} />
      )}
      {!isProduction && (
        <Breakdown title="Umsatz nach Kundengruppe" items={byPriceGroup} fileName={`umsatz-kundengruppe-${granularity}.csv`} />
      )}
      {!isProduction && (
        <Breakdown
          title="Umsatz nach Artikel/Veredelung (Auftragswert)"
          items={byArticle}
          fileName={`umsatz-artikel-${granularity}.csv`}
        />
      )}

      {leadTime && (
        <div style={card}>
          <h3>
            Durchlaufzeit (Lead Time)
            <button
              style={csvBtn}
              onClick={() =>
                downloadCsv(
                  `durchlaufzeit-${granularity}.csv`,
                  ["Periode", "Aufträge", "Ø Durchlaufzeit (h)"],
                  leadTime.buckets.map((b) => [b.key, String(b.count), String(b.avgHours)])
                )
              }
            >
              CSV
            </button>
          </h3>
          <div>
            <span style={kpi}>Ø: <strong>{leadTime.stats.avgHours} h</strong></span>
            <span style={kpi}>Median: <strong>{leadTime.stats.medianHours} h</strong></span>
            <span style={kpi}>Min/Max: <strong>{leadTime.stats.minHours} / {leadTime.stats.maxHours} h</strong></span>
            <span style={kpi}>Aufträge: <strong>{leadTime.stats.count}</strong></span>
          </div>
          <LineChart data={leadTime.buckets.map((b) => ({ label: b.key, value: b.avgHours }))} format={(v) => `${v} h`} />
          <table style={tableStyle}>
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
          <h3>
            Fehlerquote (Reklamationen)
            <button
              style={csvBtn}
              onClick={() =>
                downloadCsv(
                  `fehlerquote-${granularity}.csv`,
                  ["Periode", "Aufträge", "Reklamationen", "Quote (%)"],
                  defects.buckets.map((b) => [b.key, String(b.total), String(b.defects), b.ratePercent == null ? "" : String(b.ratePercent)])
                )
              }
            >
              CSV
            </button>
          </h3>
          <div>
            <span style={kpi}>Gesamt: <strong>{ratePct(defects.overall.ratePercent)}</strong> ({defects.overall.defects}/{defects.overall.total})</span>
            <span style={kpi}>Lieferant: <strong>{defects.byCause.LIEFERANT}</strong></span>
            <span style={kpi}>Intern: <strong>{defects.byCause.INTERN}</strong></span>
            <span style={kpi}>Veredler: <strong>{defects.byCause.EXTERN_VEREDLER}</strong></span>
          </div>
          <BarChart
            data={[
              { label: "Lieferant", value: defects.byCause.LIEFERANT },
              { label: "Intern", value: defects.byCause.INTERN },
              { label: "Veredler", value: defects.byCause.EXTERN_VEREDLER },
            ]}
            format={(v) => String(v)}
            height={160}
          />
          <table style={tableStyle}>
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
          <h3>
            Termintreue (On-Time)
            <button
              style={csvBtn}
              onClick={() =>
                downloadCsv(
                  `termintreue-${granularity}.csv`,
                  ["Periode", "Aufträge", "Pünktlich", "Quote (%)"],
                  onTime.buckets.map((b) => [b.key, String(b.total), String(b.onTime), b.ratePercent == null ? "" : String(b.ratePercent)])
                )
              }
            >
              CSV
            </button>
          </h3>
          <div>
            <span style={kpi}>Gesamt: <strong>{ratePct(onTime.overall.ratePercent)}</strong> ({onTime.overall.onTime}/{onTime.overall.total})</span>
          </div>
          <LineChart data={onTime.buckets.map((b) => ({ label: b.key, value: b.ratePercent ?? 0 }))} format={(v) => `${v} %`} />
          <table style={tableStyle}>
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

function Breakdown({ title, items, fileName }: { title: string; items: BreakdownItem[]; fileName: string }): JSX.Element {
  return (
    <div style={card}>
      <h3>
        {title}
        <button
          style={csvBtn}
          onClick={() =>
            downloadCsv(
              fileName,
              ["Bezeichnung", "Umsatz Netto (Cent)", "Rechnungen", "Anteil (%)"],
              items.map((i) => [i.name, String(i.netCents), String(i.count), i.sharePercent == null ? "" : String(i.sharePercent)])
            )
          }
        >
          CSV
        </button>
      </h3>
      <BarChart data={items.map((i) => ({ label: i.name, value: i.netCents }))} format={euro} />
      <table style={tableStyle}>
        <thead><tr><th style={th}>Bezeichnung</th><th style={th}>Umsatz (Netto)</th><th style={th}>Rechnungen</th><th style={th}>Anteil</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.label}>
              <td style={tdc}>{i.name}</td>
              <td style={tdc}>{euro(i.netCents)}</td>
              <td style={tdc}>{i.count}</td>
              <td style={tdc}>{ratePct(i.sharePercent)}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td style={tdc} colSpan={4}>Keine Daten.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
