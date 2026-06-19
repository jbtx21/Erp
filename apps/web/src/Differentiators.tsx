// Differenzierer-Durchstich (Moat, Leitplanke 1): macht die vier selbst gebauten
// TEXMA-Spezialmodule am echten Endpunkt sichtbar — Ampel-Terminübersicht (Kap. 35.4),
// Stickerei-Angebotsvergleich (Kap. 5.4), Fremdvergabe-Plan (T-04/Kap. 5.3) und
// Nachkalkulation Soll-Ist (T-10). Preis-sensible Module sind für PRODUKTION ausgeblendet
// (Kap. 12) — die Endpunkte erzwingen die Rolle zusätzlich serverseitig.
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { trpc } from "./trpc.js";

const th: CSSProperties = { textAlign: "left", borderBottom: "2px solid #ccc", padding: "6px 8px" };
const td: CSSProperties = { borderBottom: "1px solid #eee", padding: "6px 8px" };
const card: CSSProperties = { border: "1px solid #e2e2e2", borderRadius: 8, padding: "1rem", marginTop: "1.25rem" };
const kpi: CSSProperties = { display: "inline-block", marginRight: "1.5rem", fontSize: "1.05rem" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: "0.75rem" };
const numInput: CSSProperties = { width: 90 };
const errStyle: CSSProperties = { color: "#b00", margin: "0.5rem 0" };

const euro = (cents: number) => (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const AMPEL_COLOR: Record<string, string> = { ROT: "#c0392b", GELB: "#b8860b", GRUEN: "#2e7d32" };
const dot = (status: string): CSSProperties => ({ color: AMPEL_COLOR[status] ?? "#555", fontWeight: 700 });

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function Differentiators({ role }: { role: string }): JSX.Element {
  const priceAllowed = role !== "PRODUKTION";
  return (
    <>
      <h2>Differenzierer (TEXMA-Moat)</h2>
      <p style={{ color: "#555" }}>
        Die vier selbst gebauten Spezialmodule — kein Standard-ERP kann das von der Stange.
      </p>
      <AmpelDashboard />
      {priceAllowed ? (
        <>
          <StickereiCompare />
          <Postcalc />
        </>
      ) : (
        <p style={{ ...card, color: "#555" }}>
          Stickerei-Angebotsvergleich und Nachkalkulation sind preis-sensibel und für die
          Rolle PRODUKTION ausgeblendet (Kap. 12).
        </p>
      )}
      <SubproductionPlan />
    </>
  );
}

// ── Ampel-Terminübersicht (Kap. 35.4) ───────────────────────────────────────────
interface AmpelSummary {
  total: number;
  rot: number;
  gelb: number;
  gruen: number;
  overdue: number;
  kritisch: number;
  mostUrgent: { label: string; level: string; ampel: string; daysRemaining: number; overdueDays: number } | null;
  byLevel: Record<string, { rot: number; gelb: number; gruen: number }>;
}

function AmpelDashboard(): JSX.Element {
  const [data, setData] = useState<AmpelSummary | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      setData((await trpc.ampel.summary.query({})) as AmpelSummary);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section style={card}>
      <h3>Termin-Ampel — ebenenübergreifend (Kap. 35.4)</h3>
      <button onClick={() => void load()}>Aktualisieren</button>
      {err && <p style={errStyle}>Fehler: {err}</p>}
      {data && (
        <>
          <p style={{ marginTop: "0.75rem" }}>
            <span style={kpi}>Vorgänge: <strong>{data.total}</strong></span>
            <span style={kpi}><span style={dot("ROT")}>● ROT {data.rot}</span></span>
            <span style={kpi}><span style={dot("GELB")}>● GELB {data.gelb}</span></span>
            <span style={kpi}><span style={dot("GRUEN")}>● GRÜN {data.gruen}</span></span>
            <span style={kpi}>überfällig: <strong>{data.overdue}</strong></span>
            <span style={kpi}>kritisch: <strong>{data.kritisch}</strong></span>
          </p>
          {data.mostUrgent && (
            <p>
              Dringendster Vorgang: <strong>{data.mostUrgent.label}</strong> ({data.mostUrgent.level}) ·{" "}
              <span style={dot(data.mostUrgent.ampel)}>{data.mostUrgent.ampel}</span> ·{" "}
              {data.mostUrgent.overdueDays > 0
                ? `${data.mostUrgent.overdueDays} Tage überfällig`
                : `${data.mostUrgent.daysRemaining} Tage Restlauf`}
            </p>
          )}
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Ebene</th>
                <th style={th}>ROT</th>
                <th style={th}>GELB</th>
                <th style={th}>GRÜN</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.byLevel).map(([level, c]) => (
                <tr key={level}>
                  <td style={td}>{level}</td>
                  <td style={{ ...td, ...dot("ROT") }}>{c.rot}</td>
                  <td style={{ ...td, ...dot("GELB") }}>{c.gelb}</td>
                  <td style={{ ...td, ...dot("GRUEN") }}>{c.gruen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

// ── Stickerei-Angebotsvergleich (Kap. 5.4) ──────────────────────────────────────
interface OfferInput {
  partnerId: string;
  name: string;
  setupEuro: number;
  per1000Euro: number;
  leadDays: number;
}
interface Quote {
  partnerId: string;
  name: string;
  totalCents: number;
  leadDays: number;
}

const DEFAULT_OFFERS: OfferInput[] = [
  { partnerId: "p1", name: "Stickerei A", setupEuro: 25, per1000Euro: 1.2, leadDays: 7 },
  { partnerId: "p2", name: "Stickerei B", setupEuro: 15, per1000Euro: 1.6, leadDays: 5 },
  { partnerId: "p3", name: "Stickerei C", setupEuro: 40, per1000Euro: 0.9, leadDays: 10 },
];

function StickereiCompare(): JSX.Element {
  const [stitches, setStitches] = useState(8000);
  const [offers, setOffers] = useState<OfferInput[]>(DEFAULT_OFFERS);
  const [result, setResult] = useState<{ quotes: Quote[]; chosen: Quote | null } | null>(null);
  const [err, setErr] = useState("");

  const setOffer = (i: number, patch: Partial<OfferInput>) =>
    setOffers((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  const compare = useCallback(async () => {
    setErr("");
    try {
      const res = await trpc.stickerei.compareOffers.query({
        stitches,
        offers: offers.map((o) => ({
          partnerId: o.partnerId,
          name: o.name,
          setupCents: Math.round(o.setupEuro * 100),
          pricePer1000Cents: Math.round(o.per1000Euro * 100),
          leadDays: o.leadDays,
        })),
      });
      setResult(res as { quotes: Quote[]; chosen: Quote | null });
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [stitches, offers]);

  return (
    <section style={card}>
      <h3>Stickerei-Angebotsvergleich (Kap. 5.4)</h3>
      <p style={{ color: "#555", marginTop: 0 }}>
        Neukunde/neues Logo → Ausschreibung an die 3 Partner; günstigstes Angebot gewinnt
        (bei Gleichstand kürzere Durchlaufzeit).
      </p>
      <label>
        Stichzahl:{" "}
        <input
          style={numInput}
          type="number"
          min={0}
          value={stitches}
          onChange={(e) => setStitches(Math.max(0, Number(e.target.value)))}
        />
      </label>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>Partner</th>
            <th style={th}>Einrichtung (€)</th>
            <th style={th}>je 1.000 Stiche (€)</th>
            <th style={th}>Durchlauf (Tage)</th>
          </tr>
        </thead>
        <tbody>
          {offers.map((o, i) => (
            <tr key={o.partnerId}>
              <td style={td}>{o.name}</td>
              <td style={td}>
                <input style={numInput} type="number" min={0} step={0.01} value={o.setupEuro}
                  onChange={(e) => setOffer(i, { setupEuro: Number(e.target.value) })} />
              </td>
              <td style={td}>
                <input style={numInput} type="number" min={0} step={0.01} value={o.per1000Euro}
                  onChange={(e) => setOffer(i, { per1000Euro: Number(e.target.value) })} />
              </td>
              <td style={td}>
                <input style={numInput} type="number" min={0} value={o.leadDays}
                  onChange={(e) => setOffer(i, { leadDays: Math.max(0, Number(e.target.value)) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button style={{ marginTop: "0.75rem" }} onClick={() => void compare()}>Vergleichen</button>
      {err && <p style={errStyle}>Fehler: {err}</p>}
      {result && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Rang</th>
              <th style={th}>Partner</th>
              <th style={th}>Gesamtkosten</th>
              <th style={th}>Durchlauf</th>
            </tr>
          </thead>
          <tbody>
            {result.quotes.map((q, i) => {
              const isChosen = result.chosen?.partnerId === q.partnerId;
              return (
                <tr key={q.partnerId} style={isChosen ? { background: "#eafbea" } : undefined}>
                  <td style={td}>{i + 1}{isChosen ? " ✓" : ""}</td>
                  <td style={td}>{q.name}</td>
                  <td style={td}>{euro(q.totalCents)}</td>
                  <td style={td}>{q.leadDays} Tage</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ── Nachkalkulation Soll-Ist (T-10) ─────────────────────────────────────────────
interface PostcalcResult {
  plan: { revenueCents: number; materialCents: number; laborCents: number; dbCents: number };
  ist: { revenueCents: number; materialCents: number; laborCents: number; dbCents: number };
  dbVarianceCents: number;
  planMarginPct: number;
  istMarginPct: number;
  status: string;
  variance: {
    revenueVarianceCents: number;
    materialVarianceCents: number;
    laborQtyVarianceCents: number;
    laborRateVarianceCents: number;
  };
}

function Postcalc(): JSX.Element {
  const [productionId, setProductionId] = useState("");
  const [revenueEuro, setRevenueEuro] = useState(1000);
  const [materialEuro, setMaterialEuro] = useState(400);
  const [laborMinutes, setLaborMinutes] = useState(120);
  const [planRate, setPlanRate] = useState(60); // Cent je Minute
  const [istRate, setIstRate] = useState(70);
  const [res, setRes] = useState<PostcalcResult | null>(null);
  const [err, setErr] = useState("");

  const compute = useCallback(async () => {
    setErr("");
    try {
      const out = await trpc.postcalc.compute.query({
        productionId,
        plan: {
          revenueCents: Math.round(revenueEuro * 100),
          materialCents: Math.round(materialEuro * 100),
          laborMinutes,
          laborRateCentsPerMinute: planRate,
        },
        istLaborRateCentsPerMinute: istRate,
      });
      setRes(out as PostcalcResult);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [productionId, revenueEuro, materialEuro, laborMinutes, planRate, istRate]);

  return (
    <section style={card}>
      <h3>Nachkalkulation Soll-Ist (T-10)</h3>
      <p style={{ color: "#555", marginTop: 0 }}>
        Plan-DB gegen Ist-DB, inkl. Abweichungszerlegung (Material · Lohn-Menge · Lohn-Satz).
      </p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "end" }}>
        <label>PA-ID:{" "}
          <input value={productionId} placeholder="z. B. cuid…" onChange={(e) => setProductionId(e.target.value)} />
        </label>
        <label>Umsatz (€):{" "}
          <input style={numInput} type="number" value={revenueEuro} onChange={(e) => setRevenueEuro(Number(e.target.value))} /></label>
        <label>Material (€):{" "}
          <input style={numInput} type="number" value={materialEuro} onChange={(e) => setMaterialEuro(Number(e.target.value))} /></label>
        <label>Lohn (Min):{" "}
          <input style={numInput} type="number" value={laborMinutes} onChange={(e) => setLaborMinutes(Number(e.target.value))} /></label>
        <label>Plan-Satz (ct/Min):{" "}
          <input style={numInput} type="number" value={planRate} onChange={(e) => setPlanRate(Number(e.target.value))} /></label>
        <label>Ist-Satz (ct/Min):{" "}
          <input style={numInput} type="number" value={istRate} onChange={(e) => setIstRate(Number(e.target.value))} /></label>
      </div>
      <button style={{ marginTop: "0.75rem" }} onClick={() => void compute()} disabled={!productionId}>Berechnen</button>
      {err && <p style={errStyle}>Fehler: {err}</p>}
      {res && (
        <>
          <p style={{ marginTop: "0.75rem" }}>
            <span style={kpi}>Plan-DB: <strong>{euro(res.plan.dbCents)}</strong> ({res.planMarginPct} %)</span>
            <span style={kpi}>Ist-DB: <strong>{euro(res.ist.dbCents)}</strong> ({res.istMarginPct} %)</span>
            <span style={kpi}>Abweichung: <strong style={dot(res.status === "ROT" ? "ROT" : res.status === "GELB" ? "GELB" : "GRUEN")}>
              {res.dbVarianceCents >= 0 ? "+" : ""}{euro(res.dbVarianceCents)}</strong></span>
            <span style={kpi}>Status: <span style={dot(res.status)}>{res.status}</span></span>
          </p>
          <table style={tableStyle}>
            <thead><tr><th style={th}>Abweichungskomponente</th><th style={th}>Wirkung auf DB</th></tr></thead>
            <tbody>
              <tr><td style={td}>Umsatz (Ist − Plan)</td><td style={td}>{euro(res.variance.revenueVarianceCents)}</td></tr>
              <tr><td style={td}>Material (Plan − Ist)</td><td style={td}>{euro(res.variance.materialVarianceCents)}</td></tr>
              <tr><td style={td}>Lohn-Menge (Zeit)</td><td style={td}>{euro(res.variance.laborQtyVarianceCents)}</td></tr>
              <tr><td style={td}>Lohn-Satz</td><td style={td}>{euro(res.variance.laborRateVarianceCents)}</td></tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

// ── Fremdvergabe-Plan (T-04 / Kap. 5.3) ─────────────────────────────────────────
interface Stage {
  sequence: number;
  supplierId: string;
  status: string;
  dueDate?: string | null;
}
interface SubPlan {
  nextActionable: Stage | null;
  blocked: Stage[];
  overdue: Stage[];
  totalScrap: number;
  totalLohnCents: number;
  progressPercent: number;
  yieldPercent: number | null;
  allReturned: boolean;
}

function SubproductionPlan(): JSX.Element {
  const [productionId, setProductionId] = useState("");
  const [plan, setPlan] = useState<SubPlan | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      setPlan((await trpc.subproduction.plan.query({ productionId })) as SubPlan);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [productionId]);

  return (
    <section style={card}>
      <h3>Mehrstufige Fremdvergabe — Plan (T-04, Kap. 5.3)</h3>
      <p style={{ color: "#555", marginTop: 0 }}>
        Nächste handlungsfähige Stufe, blockierte/überfällige Stufen, Schwund und Kettenausbeute je PA.
      </p>
      <label>PA-ID:{" "}
        <input value={productionId} placeholder="Produktions­auftrag-ID" onChange={(e) => setProductionId(e.target.value)} />
      </label>{" "}
      <button onClick={() => void load()} disabled={!productionId}>Plan laden</button>
      {err && <p style={errStyle}>Fehler: {err}</p>}
      {plan && (
        <>
          <p style={{ marginTop: "0.75rem" }}>
            <span style={kpi}>Fortschritt: <strong>{plan.progressPercent} %</strong></span>
            <span style={kpi}>Ausbeute: <strong>{plan.yieldPercent == null ? "—" : `${plan.yieldPercent} %`}</strong></span>
            <span style={kpi}>Schwund: <strong>{plan.totalScrap}</strong></span>
            <span style={kpi}>Lohn gesamt: <strong>{euro(plan.totalLohnCents)}</strong></span>
            <span style={kpi}>{plan.allReturned ? "✓ alle zurück" : "offen"}</span>
          </p>
          <p>
            Nächste Stufe:{" "}
            {plan.nextActionable
              ? <strong>#{plan.nextActionable.sequence} {plan.nextActionable.supplierId} ({plan.nextActionable.status})</strong>
              : "—"}
          </p>
          {plan.overdue.length > 0 && (
            <p style={dot("ROT")}>
              Überfällig: {plan.overdue.map((s) => `#${s.sequence} ${s.supplierId}`).join(", ")}
            </p>
          )}
          {plan.blocked.length > 0 && (
            <p style={{ color: "#555" }}>
              Blockiert (warten auf Vorstufe): {plan.blocked.map((s) => `#${s.sequence} ${s.supplierId}`).join(", ")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
