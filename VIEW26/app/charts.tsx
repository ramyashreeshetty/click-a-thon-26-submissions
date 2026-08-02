"use client";

import { useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";

export type AnalyticsPoint = { label: string; value: number; sample_size?: number };
export type AnalyticsSeries = { key: string; label: string; points: AnalyticsPoint[] };
export type AnalyticsChart = {
  key: string;
  type: string;
  title: string;
  subtitle: string;
  unit?: string;
  series: AnalyticsSeries[];
  sql?: string;
  trace_id?: string;
};

// Categorical slots and the funnel's ordinal blue ramp are validated with the dataviz
// palette checker against the white card surface — keep order fixed, never cycle.
const SERIES_SLOTS = ["#0c66e4", "#1f845a", "#e87ba4", "#eda100", "#6554c0", "#eb6834"];
const FUNNEL_RAMP = ["#85b8ff", "#579dff", "#1d7afc", "#0055cc", "#09326c"];
const DIM_SERIES = "#c6c3d1";

const seriesColor = (index: number) => SERIES_SLOTS[index] ?? DIM_SERIES;

function funnelStepColor(index: number, count: number) {
  if (count <= 1) return FUNNEL_RAMP[2];
  const span = Math.min(count, FUNNEL_RAMP.length);
  return FUNNEL_RAMP[Math.round(index / (count - 1) * (span - 1))];
}

export function formatValue(value: number, unit?: string) {
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (Math.abs(value) >= 10_000) return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return Math.round(value).toLocaleString();
}

function formatTick(value: number, unit?: string) {
  if (unit === "%") return `${Number(value.toFixed(1))}%`;
  if (Math.abs(value) >= 10_000) return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return value.toLocaleString();
}

function niceTicks(max: number) {
  const target = Math.max(max, 1e-9);
  const raw = target / 3.5;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= raw) ?? 10) * power;
  const top = Math.ceil(target / step) * step;
  const ticks: number[] = [];
  for (let tick = step; tick <= top + step / 2; tick += step) ticks.push(Number(tick.toPrecision(12)));
  return { top, ticks };
}

export function compactTrendPoints(points: AnalyticsPoint[]) {
  const dated = points.map((point) => ({ point, date: new Date(`${point.label.slice(0, 10)}T00:00:00Z`) })).filter((item) => !Number.isNaN(item.date.getTime()));
  if (dated.length < 2) return { points, granularity: "week" };
  const spanDays = Math.max(1, (dated.at(-1)!.date.getTime() - dated[0].date.getTime()) / 86_400_000);
  const averageGap = spanDays / (dated.length - 1);
  if (averageGap >= 5) return { points, granularity: averageGap >= 24 ? "month" : "week" };

  const granularity = spanDays >= 120 ? "month" : "week";
  const buckets = new Map<string, { weightedValue: number; weight: number; sampleSize: number }>();
  for (const { point, date } of dated) {
    if (granularity === "month") date.setUTCDate(1);
    else date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = date.toISOString().slice(0, 10);
    const weight = point.sample_size && point.sample_size > 0 ? point.sample_size : 1;
    const bucket = buckets.get(key) ?? { weightedValue: 0, weight: 0, sampleSize: 0 };
    bucket.weightedValue += point.value * weight;
    bucket.weight += weight;
    bucket.sampleSize += point.sample_size ?? 0;
    buckets.set(key, bucket);
  }
  return {
    granularity,
    points: [...buckets.entries()].map(([label, bucket]) => ({ label, value: bucket.weightedValue / bucket.weight, sample_size: bucket.sampleSize || undefined })),
  };
}

export function trendPointLabel(label: string, granularity: string) {
  const date = new Date(`${label.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return label.slice(-5);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: granularity === "month" ? undefined : "numeric", timeZone: "UTC" }).format(date);
}

const displayLabel = (label: string) => label.replaceAll("_", " ");

type TipRow = { color?: string; value: string; label: string };

function TipBox({ title, rows }: { title: string; rows: TipRow[] }) {
  return <div className="flc-tooltip">
    <span className="flc-tooltip-title">{title}</span>
    {rows.map((row) => <div key={`${row.label}-${row.value}`} className="flc-tooltip-row">
      {row.color ? <i style={{ background: row.color }} /> : null}
      <b>{row.value}</b>
      <span>{row.label}</span>
    </div>)}
  </div>;
}

function DataTable({ chart }: { chart: AnalyticsChart }) {
  const showSamples = chart.series.some((series) => series.points.some((point) => point.sample_size));
  return <details className="flc-table">
    <summary>View data table</summary>
    <table>
      <thead><tr>{chart.series.length > 1 && <th scope="col">Series</th>}<th scope="col">Label</th><th scope="col">{chart.unit === "%" ? "Value (%)" : `Value${chart.unit ? ` (${chart.unit})` : ""}`}</th>{showSamples && <th scope="col">Sample</th>}</tr></thead>
      <tbody>{chart.series.flatMap((series) => series.points.map((point) => <tr key={`${series.key}-${point.label}`}>
        {chart.series.length > 1 && <td>{series.label}</td>}
        <td>{displayLabel(point.label)}</td>
        <td>{formatValue(point.value, chart.unit)}</td>
        {showSamples && <td>{point.sample_size ? Math.round(point.sample_size).toLocaleString() : "—"}</td>}
      </tr>))}</tbody>
    </table>
  </details>;
}

type TrendRow = { label: string } & Record<string, number | string | undefined>;

function TrendChart({ chart }: { chart: AnalyticsChart }) {
  const [emphasis, setEmphasis] = useState<string | null>(null);

  const prepared = chart.series.map((series) => ({ series, ...compactTrendPoints(series.points) }));
  const granularity = prepared[0]?.granularity ?? "week";
  const labels = [...new Set(prepared.flatMap((item) => item.points.map((point) => point.label)))].sort();
  const rows: TrendRow[] = labels.map((label) => {
    const row: TrendRow = { label };
    prepared.forEach((item) => {
      const point = item.points.find((candidate) => candidate.label === label);
      if (point) {
        row[item.series.key] = point.value;
        if (point.sample_size) row[`${item.series.key}:n`] = point.sample_size;
      }
    });
    return row;
  });
  const maxValue = Math.max(1e-9, ...prepared.flatMap((item) => item.points.map((point) => point.value)));
  const { top, ticks } = niceTicks(maxValue);
  const yAxisWidth = Math.max(...ticks.map((tick) => formatTick(tick, chart.unit).length), 2) * 7 + 12;
  const single = prepared.length === 1;

  const renderTip = ({ active, payload, label }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;
    const tipRows = prepared
      .map((item, index) => ({ item, entry: payload.find((candidate) => candidate.dataKey === item.series.key), color: seriesColor(index) }))
      .filter((row) => typeof row.entry?.value === "number")
      .map((row) => {
        const sample = (row.entry?.payload as TrendRow | undefined)?.[`${row.item.series.key}:n`];
        return { color: row.color, value: formatValue(row.entry!.value as number, chart.unit), label: single && typeof sample === "number" ? `n=${Math.round(sample).toLocaleString()}` : row.item.series.label };
      });
    return tipRows.length ? <TipBox title={trendPointLabel(String(label ?? ""), granularity)} rows={tipRows} /> : null;
  };

  const endLabel = (props: unknown) => {
    const { x, y, value, index } = props as { x?: number; y?: number; value?: number; index?: number };
    if (index !== rows.length - 1 || typeof value !== "number" || x === undefined || y === undefined) return null;
    return <text x={x} y={Math.max(11, y - 10)} textAnchor="end" className="flc-endlabel">{formatValue(value, chart.unit)}</text>;
  };

  return <div className="flc-plot">
    {!single && <div className="flc-legend" role="list">{prepared.map((item, index) => <button key={item.series.key} role="listitem" className={emphasis && emphasis !== item.series.key ? "dim" : ""} onClick={() => setEmphasis(emphasis === item.series.key ? null : item.series.key)}><i style={{ background: seriesColor(index) }} /><span>{item.series.label}</span></button>)}</div>}
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={rows} margin={{ top: 16, right: 14, bottom: 0, left: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="#eceaf3" />
        <XAxis dataKey="label" tickFormatter={(value: string) => trendPointLabel(value, granularity)} minTickGap={48} interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: "#d9d6e4" }} tick={{ fill: "#898781", fontSize: 11 }} tickMargin={8} />
        <YAxis domain={[0, top]} ticks={ticks} tickFormatter={(value: number) => formatTick(value, chart.unit)} axisLine={false} tickLine={false} tick={{ fill: "#898781", fontSize: 11 }} width={yAxisWidth} />
        <Tooltip content={renderTip} cursor={{ stroke: "#b9b5c9", strokeWidth: 1 }} isAnimationActive={false} />
        {single
          ? <Area dataKey={prepared[0].series.key} stroke={seriesColor(0)} strokeWidth={2} strokeLinecap="round" fill={seriesColor(0)} fillOpacity={0.1} dot={false} activeDot={{ r: 4.5, stroke: "#ffffff", strokeWidth: 2 }} connectNulls isAnimationActive={false}>
            <LabelList dataKey={prepared[0].series.key} content={endLabel} />
          </Area>
          : prepared.map((item, index) => <Line key={item.series.key} dataKey={item.series.key} stroke={seriesColor(index)} strokeWidth={2} strokeLinecap="round" strokeOpacity={emphasis && emphasis !== item.series.key ? 0.22 : 1} dot={false} activeDot={{ r: 4.5, stroke: "#ffffff", strokeWidth: 2 }} connectNulls isAnimationActive={false} />)}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}

function BarsChart({ chart, series }: { chart: AnalyticsChart; series: AnalyticsSeries }) {
  const points = series.points;
  const funnel = chart.type === "funnel";
  const drops = new Map(points.map((point, index) => {
    const previous = points[index - 1];
    return [point.label, previous && previous.value > 0 ? (1 - point.value / previous.value) * 100 : null] as const;
  }));
  const valueReserve = Math.max(...points.map((point) => formatValue(point.value, chart.unit).length), 1) * 7.5 + 12;
  const height = points.length * (funnel ? 46 : 42) + 8;

  const categoryTick = (props: unknown) => {
    const { x, y, payload } = props as { x: number; y: number; payload: { value: string } };
    const drop = funnel ? drops.get(payload.value) : null;
    const name = displayLabel(payload.value);
    const shown = name.length > 18 ? `${name.slice(0, 17)}…` : name;
    return <g>
      <text x={x} y={y} dy={drop != null && drop > 0.05 ? -1 : 4} textAnchor="end" className="flc-cat">{shown}</text>
      {drop != null && drop > 0.05 && <text x={x} y={y} dy={12} textAnchor="end" className="flc-drop">−{drop.toFixed(1)}% vs prev</text>}
    </g>;
  };

  const renderTip = ({ active, payload }: TooltipContentProps) => {
    const point = payload?.[0]?.payload as AnalyticsPoint | undefined;
    if (!active || !point) return null;
    const index = points.indexOf(point);
    const rows: TipRow[] = [{ color: funnel ? funnelStepColor(index, points.length) : seriesColor(0), value: formatValue(point.value, chart.unit), label: series.label }];
    if (point.sample_size) rows.push({ value: `n=${Math.round(point.sample_size).toLocaleString()}`, label: "sample size" });
    if (funnel && index > 0 && points[0].value > 0) {
      rows.push({ value: `${(point.value / points[0].value * 100).toFixed(1)}%`, label: "of first stage" });
      const drop = drops.get(point.label);
      if (drop != null) rows.push({ value: `−${drop.toFixed(1)}%`, label: "vs previous stage" });
    }
    return <TipBox title={displayLabel(point.label)} rows={rows} />;
  };

  return <div className="flc-plot">
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={points} layout="vertical" margin={{ top: 0, right: valueReserve, bottom: 0, left: 0 }} accessibilityLayer>
        <XAxis type="number" domain={[0, "dataMax"]} hide />
        <YAxis type="category" dataKey="label" width={140} tickLine={false} axisLine={{ stroke: "#d9d6e4" }} tick={categoryTick} />
        <Tooltip content={renderTip} cursor={{ fill: "#f4f2f9" }} isAnimationActive={false} />
        <Bar dataKey="value" barSize={18} radius={[0, 4, 4, 0]} activeBar={{ fillOpacity: 0.82 }} isAnimationActive={false}>
          <LabelList dataKey="value" position="right" formatter={(value) => typeof value === "number" ? formatValue(value, chart.unit) : value} className="flc-value" fill="#2c2930" />
          {points.map((point, index) => <Cell key={point.label} fill={funnel ? funnelStepColor(index, points.length) : seriesColor(0)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function Chart({ chart }: { chart: AnalyticsChart }) {
  const [seriesKey, setSeriesKey] = useState(chart.series[0]?.key ?? "");
  const series = chart.series.find((item) => item.key === seriesKey) ?? chart.series[0];
  const trend = chart.type === "trend";
  const granularity = trend ? compactTrendPoints(series?.points ?? []).granularity : null;
  const chartSubtitle = granularity ? chart.subtitle.replace(/daily/ig, `${granularity}ly`) : chart.subtitle;

  return <article className={`fl-chart ${chart.type}`}>
    <div className="fl-chart-head"><div><h4>{chart.title}</h4><p>{chartSubtitle}</p></div><span>{chart.unit ?? ""}</span></div>
    {!trend && chart.series.length > 1 && <div className="fl-series-tabs">{chart.series.map((item) => <button key={item.key} className={item.key === series?.key ? "active" : ""} onClick={() => setSeriesKey(item.key)}>{item.label}</button>)}</div>}
    {trend ? <TrendChart chart={chart} /> : series ? <BarsChart chart={chart} series={series} /> : null}
    <DataTable chart={chart} />
  </article>;
}
