// Einfache, abhängigkeitsfreie SVG-Diagramme (Balken/Linie) für das Reporting.
// Bewusst minimal gehalten (kein Chart-Framework) — passt zum schlanken Stack.
import { type CSSProperties } from "react";
import { T } from "./theme.js";

export interface ChartDatum {
  label: string;
  value: number;
}

const AXIS = T.border;
const BAR = T.primary;
const LINE = T.primary;
const wrap: CSSProperties = { maxWidth: "100%", overflowX: "auto" };

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / pow) * pow;
}

/** Vertikales Balkendiagramm (z. B. Umsatz nach Shop/Kundengruppe). */
export function BarChart({
  data,
  format,
  height = 200,
  barWidth = 56,
}: {
  data: ChartDatum[];
  format: (v: number) => string;
  height?: number;
  barWidth?: number;
}): JSX.Element {
  if (data.length === 0) return <p style={{ color: T.text3 }}>Keine Daten.</p>;
  const pad = { top: 20, bottom: 46, left: 8, right: 8 };
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const gap = 22;
  const width = pad.left + pad.right + data.length * (barWidth + gap);

  return (
    <div style={wrap}>
      <svg width={width} height={height} role="img" aria-label="Balkendiagramm">
        <line x1={pad.left} y1={pad.top + plotH} x2={width - pad.right} y2={pad.top + plotH} stroke={AXIS} />
        {data.map((d, i) => {
          const h = max === 0 ? 0 : (d.value / max) * plotH;
          const x = pad.left + gap / 2 + i * (barWidth + gap);
          const y = pad.top + plotH - h;
          return (
            <g key={d.label}>
              <rect x={x} y={y} width={barWidth} height={h} fill={BAR} rx={3} />
              <text x={x + barWidth / 2} y={y - 5} textAnchor="middle" fontSize={10} fill={T.text}>
                {format(d.value)}
              </text>
              <text x={x + barWidth / 2} y={pad.top + plotH + 16} textAnchor="middle" fontSize={10} fill={T.text2}>
                {d.label.length > 12 ? `${d.label.slice(0, 11)}…` : d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Liniendiagramm über Perioden (z. B. Umsatzverlauf je Monat). */
export function LineChart({
  data,
  format,
  height = 220,
  width = 560,
}: {
  data: ChartDatum[];
  format: (v: number) => string;
  height?: number;
  width?: number;
}): JSX.Element {
  if (data.length === 0) return <p style={{ color: T.text3 }}>Keine Daten.</p>;
  const pad = { top: 20, bottom: 40, left: 8, right: 16 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
  const xy = data.map((d, i) => {
    const x = pad.left + (data.length > 1 ? i * stepX : plotW / 2);
    const y = pad.top + plotH - (max === 0 ? 0 : (d.value / max) * plotH);
    return { x, y, d };
  });
  const path = xy.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <div style={wrap}>
      <svg width={width} height={height} role="img" aria-label="Liniendiagramm">
        <line x1={pad.left} y1={pad.top + plotH} x2={width - pad.right} y2={pad.top + plotH} stroke={AXIS} />
        <path d={path} fill="none" stroke={LINE} strokeWidth={2} />
        {xy.map((p) => (
          <g key={p.d.label}>
            <circle cx={p.x} cy={p.y} r={3} fill={LINE} />
            <title>{`${p.d.label}: ${format(p.d.value)}`}</title>
            <text x={p.x} y={pad.top + plotH + 15} textAnchor="middle" fontSize={9} fill={T.text2}>
              {p.d.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
