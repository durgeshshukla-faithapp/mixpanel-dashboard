'use client';
import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const PALETTE = ['#C9A96E', '#4E9B6F', '#5B8FA8', '#7A6BA8', '#A85050', '#6BA88C'];

function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  if (n !== 0 && Math.abs(n) < 1) return (n * 100).toFixed(1) + '%';
  return Math.round(n).toLocaleString('en-IN');
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const QUICK = [
  { label: '7D', days: 7 }, { label: '14D', days: 14 },
  { label: '30D', days: 30 }, { label: '90D', days: 90 },
];

export default function CompareClient({ reports }) {
  const [selections, setSelections] = useState([
    { reportRow: '', metric: '' },
    { reportRow: '', metric: '' },
  ]);
  const [fromDate, setFromDate] = useState(daysAgo(30));
  const [toDate, setToDate] = useState(daysAgo(0));
  const [chartType, setChartType] = useState('line');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [seriesData, setSeriesData] = useState(null); // [{label, dates, data}]
  const [availableMetrics, setAvailableMetrics] = useState({}); // {reportRow: [metricKeys]}

  const inputCls = 'bg-surface2 border border-border rounded-md px-3 py-2 text-xs font-mono w-full';
  const labelCls = 'text-[10px] text-dim uppercase tracking-widest font-display font-medium mb-1 block';

  async function loadMetrics(reportRow) {
    if (!reportRow || availableMetrics[reportRow]) return;
    try {
      const res = await fetch(`/api/report-metrics?row=${reportRow}`);
      const data = await res.json();
      setAvailableMetrics((prev) => ({ ...prev, [reportRow]: data.metrics || [] }));
    } catch (e) {}
  }

  function updateSelection(i, field, value) {
    const next = selections.map((s, j) => j === i ? { ...s, [field]: value } : s);
    setSelections(next);
    if (field === 'reportRow') loadMetrics(value);
  }

  function addSeries() {
    setSelections([...selections, { reportRow: '', metric: '' }]);
  }

  function removeSeries(i) {
    setSelections(selections.filter((_, j) => j !== i));
  }

  async function runComparison() {
    const valid = selections.filter((s) => s.reportRow && s.metric);
    if (valid.length < 1) { setError('Select at least one report + metric'); return; }
    setLoading(true);
    setError('');
    setSeriesData(null);

    try {
      const results = await Promise.all(valid.map(async (sel) => {
        const res = await fetch('/api/report-metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ row: sel.reportRow, metric: sel.metric, fromDate, toDate }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const report = reports.find((r) => String(r.row) === String(sel.reportRow));
        const label = `${report?.name || sel.reportRow} — ${sel.metric.replace(/^[A-Z]\.\s*/, '')}`;
        return { label, dates: data.dates, totals: data.totals };
      }));
      setSeriesData(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Merge all dates, build chart data
  const chartData = useMemo(() => {
    if (!seriesData) return [];
    const allDates = Array.from(new Set(seriesData.flatMap((s) => s.dates))).sort();
    return allDates
      .filter((d) => d >= fromDate && d <= toDate)
      .map((date) => {
        const row = { date: date.slice(5) };
        seriesData.forEach((s) => { row[s.label] = s.totals[date] ?? null; });
        return row;
      });
  }, [seriesData, fromDate, toDate]);

  return (
    <div className="space-y-5">
      {/* Series selectors */}
      <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
        {selections.map((sel, i) => (
          <div key={i} className="flex gap-3 items-end">
            <div className="flex-1">
              {i === 0 && <label className={labelCls}>Report</label>}
              <select
                value={sel.reportRow}
                onChange={(e) => updateSelection(i, 'reportRow', e.target.value)}
                className={inputCls}
              >
                <option value="">Select report...</option>
                {reports.map((r) => (
                  <option key={r.row} value={r.row}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              {i === 0 && <label className={labelCls}>Metric</label>}
              <select
                value={sel.metric}
                onChange={(e) => updateSelection(i, 'metric', e.target.value)}
                className={inputCls}
                disabled={!sel.reportRow}
              >
                <option value="">Select metric...</option>
                {(availableMetrics[sel.reportRow] || []).map((m) => (
                  <option key={m} value={m}>{m.replace(/^[A-Z]\.\s*/, '')}</option>
                ))}
              </select>
            </div>
            <div
              className="w-3 h-3 rounded-full mt-2 shrink-0"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            {selections.length > 1 && (
              <button onClick={() => removeSeries(i)} className="text-dim hover:text-down text-sm pb-1">✕</button>
            )}
          </div>
        ))}

        <button
          onClick={addSeries}
          className="text-xs text-gold hover:underline font-display"
        >
          + Add series
        </button>

        {/* Date range + chart type + run */}
        <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-border">
          <div className="flex gap-1">
            {QUICK.map((r) => (
              <button
                key={r.label}
                onClick={() => { setFromDate(daysAgo(r.days)); setToDate(daysAgo(0)); }}
                className={`text-[10px] px-2 py-1 rounded font-display font-medium border transition ${
                  fromDate === daysAgo(r.days) && toDate === daysAgo(0)
                    ? 'border-gold/40 bg-gold/10 text-gold'
                    : 'border-border bg-surface2 text-dim hover:border-dim'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="bg-surface2 border border-border rounded-md px-2 py-1.5 text-xs" />
          <span className="text-xs text-dim">to</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="bg-surface2 border border-border rounded-md px-2 py-1.5 text-xs" />
          <select value={chartType} onChange={(e) => setChartType(e.target.value)}
            className="bg-surface2 border border-border rounded-md px-2 py-1.5 text-xs font-mono">
            <option value="line">Line</option>
            <option value="bar">Bar</option>
          </select>
          <button
            onClick={runComparison}
            disabled={loading}
            className="bg-gold text-bg font-display font-medium text-sm px-5 py-2 rounded-md hover:opacity-90 transition disabled:opacity-40"
          >
            {loading ? 'Loading...' : 'Compare'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs font-mono text-down border border-down/30 bg-down/10 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* Chart */}
      {seriesData && chartData.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <ResponsiveContainer width="100%" height={340}>
            {chartType === 'bar' ? (
              <BarChart data={chartData}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--dim)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'var(--dim)', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {seriesData.map((s, i) => (
                  <Bar key={s.label} dataKey={s.label} fill={PALETTE[i % PALETTE.length]} animationDuration={600} />
                ))}
              </BarChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--dim)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'var(--dim)', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} formatter={(v) => fmtNum(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {seriesData.map((s, i) => (
                  <Line key={s.label} type="monotone" dataKey={s.label}
                    stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} animationDuration={600} />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {seriesData && chartData.length === 0 && (
        <p className="text-dim text-sm text-center py-8">No data for selected range.</p>
      )}
    </div>
  );
}
