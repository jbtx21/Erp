// Differenzierer-Durchstich (Moat, Leitplanke 1): macht die vier selbst gebauten
// TEXMA-Spezialmodule am echten Endpunkt sichtbar — Ampel-Terminübersicht (Kap. 35.4),
// Stickerei-Angebotsvergleich (Kap. 5.4), Fremdvergabe-Plan (T-04/Kap. 5.3) und
// Nachkalkulation Soll-Ist (T-10). Preis-sensible Module sind für PRODUKTION ausgeblendet
// (Kap. 12) — die Endpunkte erzwingen die Rolle zusätzlich serverseitig.
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { trpc } from "./trpc.js";
import { T, euro, statusOf, th, td, tdNum, card, kpi, tableStyle, errStyle, inputStyle } from "./theme.js";

const numInput: CSSProperties = { ...inputStyle, width: 90 };
const dot = (status: string): CSSProperties => ({ color: statusOf(status).color, fontWeight: 700 });

/** Status als Farbe + Symbol + Text (Skill erp-ui-design: Signal nie allein über Farbe). */
function StatusTag({ s }: { s: string }): JSX.Element {
  const t = statusOf(s);
  return <span style={{ color: t.color, fontWeight: 700 }}>{t.symbol} {t.label}</span>;
}

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
      <SubproductionPlan role={role} />
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
              <StatusTag s={data.mostUrgent.ampel} /> ·{" "}
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
                  <td style={{ ...tdNum, ...dot("ROT") }}>{c.rot}</td>
                  <td style={{ ...tdNum, ...dot("GELB") }}>{c.gelb}</td>
                  <td style={{ ...tdNum, ...dot("GRUEN") }}>{c.gruen}</td>
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
                <tr key={q.partnerId} style={isChosen ? { background: T.surface } : undefined}>
                  <td style={td}>{i + 1}{isChosen ? " ✓" : ""}</td>
                  <td style={td}>{q.name}</td>
                  <td style={tdNum}>{euro(q.totalCents)}</td>
                  <td style={tdNum}>{q.leadDays} Tage</td>
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
            <span style={kpi}>Status: <StatusTag s={res.status} /></span>
          </p>
          <table style={tableStyle}>
            <thead><tr><th style={th}>Abweichungskomponente</th><th style={{ ...th, textAlign: "right" }}>Wirkung auf DB</th></tr></thead>
            <tbody>
              <tr><td style={td}>Umsatz (Ist − Plan)</td><td style={tdNum}>{euro(res.variance.revenueVarianceCents)}</td></tr>
              <tr><td style={td}>Material (Plan − Ist)</td><td style={tdNum}>{euro(res.variance.materialVarianceCents)}</td></tr>
              <tr><td style={td}>Lohn-Menge (Zeit)</td><td style={tdNum}>{euro(res.variance.laborQtyVarianceCents)}</td></tr>
              <tr><td style={td}>Lohn-Satz</td><td style={tdNum}>{euro(res.variance.laborRateVarianceCents)}</td></tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

// ── Mehrstufige Fremdvergabe — Plan + Klickpfad (T-04 / Kap. 5.3) ────────────────
type SubStatus = "OFFEN" | "BEISTELLUNG_VERSANDT" | "RUECKLAUF_ERHALTEN" | "ABGESCHLOSSEN";
interface Stage {
  id: string;
  sequence: number;
  supplierId: string;
  status: SubStatus;
  beistellMenge?: number | null;
  ruecklaufMenge?: number | null;
  dueDate?: string | null;
}
interface SubPlan {
  totalScrap: number;
  totalLohnCents: number;
  progressPercent: number;
  yieldPercent: number | null;
  allReturned: boolean;
}

const RETURNED = new Set<SubStatus>(["RUECKLAUF_ERHALTEN", "ABGESCHLOSSEN"]);
const STATUS_LABEL: Record<SubStatus, string> = {
  OFFEN: "offen",
  BEISTELLUNG_VERSANDT: "beigestellt",
  RUECKLAUF_ERHALTEN: "Rücklauf erhalten",
  ABGESCHLOSSEN: "abgeschlossen",
};
const isOverdue = (s: Stage): boolean =>
  !!s.dueDate && !RETURNED.has(s.status) && new Date(s.dueDate).getTime() < Date.now();

function SubproductionPlan({ role }: { role: string }): JSX.Element {
  const [productionId, setProductionId] = useState("");
  const [plan, setPlan] = useState<SubPlan | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [menge, setMenge] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const canAct = role === "ADMIN" || role === "BUERO";

  const load = useCallback(async () => {
    setErr("");
    try {
      const [p, s] = await Promise.all([
        trpc.subproduction.plan.query({ productionId }),
        trpc.subproduction.list.query({ productionId }),
      ]);
      setPlan(p as unknown as SubPlan);
      setStages((s as unknown as { stages: Stage[] }).stages);
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [productionId]);

  const advance = useCallback(
    async (stage: Stage, to: SubStatus, withMenge: boolean) => {
      setErr("");
      setBusy(true);
      try {
        const raw = menge[stage.id];
        const m = withMenge && raw != null && raw !== "" ? Number(raw) : undefined;
        await trpc.subproduction.advance.mutate({
          subProductionId: stage.id,
          to: to as "BEISTELLUNG_VERSANDT" | "RUECKLAUF_ERHALTEN" | "ABGESCHLOSSEN",
          ...(m != null ? { menge: m } : {}),
        });
        await load();
      } catch (e) {
        setErr(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    [menge, load]
  );

  // Client-Gate (zusätzlich zur Server-Prüfung, T-04): eine OFFENE Stufe ist erst startbar,
  // wenn alle vorherigen Stufen zurück sind.
  const canStart = (i: number): boolean => stages.slice(0, i).every((s) => RETURNED.has(s.status));

  const mengeBox = (s: Stage, ph: string): JSX.Element => (
    <input style={{ width: 64, marginRight: 6 }} type="number" min={0} placeholder={ph}
      value={menge[s.id] ?? ""} onChange={(e) => setMenge((m) => ({ ...m, [s.id]: e.target.value }))} />
  );

  const action = (s: Stage, i: number): JSX.Element => {
    if (s.status === "ABGESCHLOSSEN") return <span style={dot("GRUEN")}>✓ abgeschlossen</span>;
    if (!canAct) return <span style={{ color: "#999" }}>—</span>;
    if (s.status === "OFFEN") {
      return canStart(i)
        ? <>{mengeBox(s, "Menge")}<button disabled={busy} onClick={() => void advance(s, "BEISTELLUNG_VERSANDT", true)}>Beistellung versenden</button></>
        : <span style={{ color: "#999" }}>blockiert</span>;
    }
    if (s.status === "BEISTELLUNG_VERSANDT") {
      return <>{mengeBox(s, "Rückl.")}<button disabled={busy} onClick={() => void advance(s, "RUECKLAUF_ERHALTEN", true)}>Rücklauf erfassen</button></>;
    }
    return <button disabled={busy} onClick={() => void advance(s, "ABGESCHLOSSEN", false)}>Abschließen</button>;
  };

  return (
    <section style={card}>
      <h3>Mehrstufige Fremdvergabe — Plan + Aktionen (T-04, Kap. 5.3)</h3>
      <p style={{ color: "#555", marginTop: 0 }}>
        Stufen sequenziell weiterschalten: Beistellung → Rücklauf → Abschluss (mit Mengenfluss/Schwund).
      </p>
      <label>PA-ID:{" "}
        <input value={productionId} placeholder="Produktions-Auftrag-ID" onChange={(e) => setProductionId(e.target.value)} />
      </label>{" "}
      <button onClick={() => void load()} disabled={!productionId}>Plan laden</button>
      {err && <p style={errStyle}>Fehler: {err}</p>}
      {plan && (
        <p style={{ marginTop: "0.75rem" }}>
          <span style={kpi}>Fortschritt: <strong>{plan.progressPercent} %</strong></span>
          <span style={kpi}>Ausbeute: <strong>{plan.yieldPercent == null ? "—" : `${plan.yieldPercent} %`}</strong></span>
          <span style={kpi}>Schwund: <strong>{plan.totalScrap}</strong></span>
          <span style={kpi}>Lohn gesamt: <strong>{euro(plan.totalLohnCents)}</strong></span>
          <span style={kpi}>{plan.allReturned ? "✓ alle zurück" : "offen"}</span>
        </p>
      )}
      {stages.length > 0 && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Stufe</th>
              <th style={th}>Veredler</th>
              <th style={th}>Status</th>
              <th style={{ ...th, textAlign: "right" }}>Menge B/R</th>
              <th style={th}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s, i) => (
              <tr key={s.id}>
                <td style={td}>#{s.sequence}</td>
                <td style={td}>{s.supplierId}</td>
                <td style={td}>
                  {STATUS_LABEL[s.status]}
                  {isOverdue(s) && <span style={{ ...dot("ROT"), marginLeft: 6 }}>überfällig</span>}
                </td>
                <td style={tdNum}>{s.beistellMenge ?? "—"}{s.ruecklaufMenge != null ? ` / ${s.ruecklaufMenge}` : ""}</td>
                <td style={td}>{action(s, i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!canAct && stages.length > 0 && (
        <p style={{ color: "#555" }}>Aktionen erfordern Rolle ADMIN/BÜRO (Kap. 12).</p>
      )}
    </section>
  );
}
