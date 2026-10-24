"use client";

import { useState } from "react";

export interface SeriesPoint {
  key: string;
  label: string;
  purchases: number;
  estimates: number;
  sales: number;
  profit: number;
}

// Colours validated as a set (dataviz validator, white surface): all pass
// lightness, chroma, colour-blind separation and 3:1 contrast. Profit uses a
// blue/red pair for above/below zero.
const COLORS = {
  purchases: "#eb6834",
  estimates: "#6250d6",
  profitUp: "#2a78d6",
  profitDown: "#e34948",
  grid: "#e5e7eb",
  baseline: "#c3c2b7",
  muted: "#6b7280",
};

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
function short(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}k`;
  return `${sign}₹${Math.round(a)}`;
}

// A nice round axis maximum and 3 gridlines.
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// One measure as thin bars from a zero baseline (bars go below it for a
// loss). Hover a bar for its value; "Table" shows the numbers.
function BarChart({
  title,
  total,
  points,
  value,
  colorFor,
  note,
}: {
  title: string;
  total: number;
  points: SeriesPoint[];
  value: (p: SeriesPoint) => number;
  colorFor: (v: number) => string;
  note?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const W = 320;
  const H = 150;
  const PAD = { top: 10, right: 6, bottom: 20, left: 44 };
  const values = points.map(value);
  const maxUp = niceMax(Math.max(0, ...values));
  const maxDown = Math.min(0, ...values) < 0 ? niceMax(-Math.min(...values)) : 0;
  const plotH = H - PAD.top - PAD.bottom;
  const plotW = W - PAD.left - PAD.right;
  const span = maxUp + maxDown;
  const y = (v: number) => PAD.top + ((maxUp - v) / span) * plotH;
  const zeroY = y(0);
  const step = plotW / Math.max(points.length, 1);
  const barW = Math.max(2, Math.min(18, step * 0.6));
  const labelEvery = points.length > 16 ? 5 : points.length > 8 ? 2 : 1;
  const ticks = maxDown ? [maxUp, 0, -maxDown] : [maxUp, maxUp / 2, 0];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <button type="button" onClick={() => setAsTable((t) => !t)} className="text-xs text-blue-600 hover:underline">
          {asTable ? "Chart" : "Table"}
        </button>
      </div>
      <p className="text-lg font-semibold text-gray-900">{inr(total)}</p>
      {note && <p className="text-xs text-gray-500">{note}</p>}

      {asTable ? (
        <div className="mt-2 max-h-[150px] overflow-y-auto text-xs">
          <table className="w-full">
            <tbody>
              {points.map((p) => (
                <tr key={p.key} className="border-t border-gray-100">
                  <td className="py-0.5 text-gray-600">{p.label}</td>
                  <td className="py-0.5 text-right text-gray-900">{inr(value(p))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title} chart`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? COLORS.baseline : COLORS.grid} strokeWidth={1} />
                <text x={PAD.left - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill={COLORS.muted}>
                  {short(t)}
                </text>
              </g>
            ))}
            {points.map((p, i) => {
              const v = value(p);
              const cx = PAD.left + step * i + step / 2;
              const top = Math.min(y(v), zeroY);
              const h = Math.max(Math.abs(y(v) - zeroY), v === 0 ? 0 : 1);
              const r = Math.min(4, barW / 2, h);
              // Rounded at the data end only, square on the baseline.
              const d =
                v >= 0
                  ? `M${cx - barW / 2},${zeroY} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${zeroY} Z`
                  : `M${cx - barW / 2},${zeroY} V${zeroY + h - r} Q${cx - barW / 2},${zeroY + h} ${cx - barW / 2 + r},${zeroY + h} H${cx + barW / 2 - r} Q${cx + barW / 2},${zeroY + h} ${cx + barW / 2},${zeroY + h - r} V${zeroY} Z`;
              return (
                <g key={p.key}>
                  {h > 0 && <path d={d} fill={colorFor(v)} opacity={hover == null || hover === i ? 1 : 0.45} />}
                  {i % labelEvery === 0 && (
                    <text x={cx} y={H - 6} textAnchor="middle" fontSize={9} fill={COLORS.muted}>
                      {p.label}
                    </text>
                  )}
                  {/* Hit area bigger than the bar. */}
                  <rect
                    x={cx - step / 2}
                    y={PAD.top}
                    width={step}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onTouchStart={() => setHover(i)}
                  />
                </g>
              );
            })}
          </svg>
          {hover != null && points[hover] && (
            <div
              className="pointer-events-none absolute top-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs shadow"
              style={{
                left: `${((PAD.left + step * hover + step / 2) / W) * 100}%`,
                transform: hover > points.length / 2 ? "translateX(-100%)" : "translateX(4px)",
              }}
            >
              <p className="text-gray-500">{points[hover].label}</p>
              <p className="font-semibold text-gray-900">{inr(value(points[hover]))}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Admin dashboard graphs for the chosen period: purchases (stock and
// expenses), estimates, and profit (draft invoice sales − purchases).
export function DashboardCharts({ series, periodLabel }: { series: SeriesPoint[]; periodLabel: string }) {
  const sum = (f: (p: SeriesPoint) => number) => series.reduce((t, p) => t + f(p), 0);
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-gray-500">{periodLabel}</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <BarChart title="Purchases" total={sum((p) => p.purchases)} points={series} value={(p) => p.purchases} colorFor={() => COLORS.purchases} note="Stock + expenses" />
        <BarChart title="Estimates" total={sum((p) => p.estimates)} points={series} value={(p) => p.estimates} colorFor={() => COLORS.estimates} note="Value of estimates made" />
        <BarChart
          title="Profit"
          total={sum((p) => p.profit)}
          points={series}
          value={(p) => p.profit}
          colorFor={(v) => (v < 0 ? COLORS.profitDown : COLORS.profitUp)}
          note="Draft invoice sales − purchases & expenses"
        />
      </div>
    </div>
  );
}
