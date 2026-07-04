'use client';
import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const PALETTE = ['#3DDC97', '#5B9FE8', '#F0A868', '#C58FE0', '#F0685C', '#4FD1D9', '#E8C15B', '#8B96A5'];

function fmtNum(n) {
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
}

export default function DashboardClient({ matrices }) {
  const metrics = Object.keys(matrices);
  const [metric, setMetric] = useState(metrics[0] || '');
  const mat = matrices[metric] || { sources: [], dates: [], data: {} };

  const [selectedSources, setSelectedSources] = useState(() => new Set(mat.sources.slice(0, 5)));
  const [chartType, setChartType] = useState('line');
  const [dateFrom, setDateFrom] = useState(mat.dates[0] || '');
  const [dateTo, setDateTo] = useState(mat.dates[mat.dates.length - 1] || '');

  function handleMetricChange(newMetric) {
    const newMat = matrices[newMetric];
    setMetric(newMetric);
    setSelectedSources(new Set(newMat.sources.slice(0, 5)));
    setDateFrom(newMat.dates[0] || '');
    setDateTo(newMat.dates[newMat.dates.length - 1] || '');
  }

  function toggleSource(s) {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  const dates = useMemo(
    () => mat.dates.filter((d) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo)),
    [mat, dateFrom, dateTo]
  );
  const sources = mat.sources.filter((s) => selectedSources.has(s));

  const chartData = useMemo(
    () => dates.map((d) => {
      const row = { date: d.slice(5) };
      sources.forEach((s) => { row[s] = (mat.data[s] && mat.data[s][d]) || 0; });
      return row;
    }),
    [dates, sources, mat]
  );

  const pieData = useMemo(
    () => sources.map((s) => ({
      name: s,
      value: dates.reduce((sum, d) => sum + ((mat.data[s] && mat.data[s][d]) || 0), 0),
    })),
    [sources, dates, mat]
  );

  const kpis = useMemo(() => {
    if (sources.length === 0 || dates.length === 0) return null;
    const totals = dates.map((d) => sources.reduce((sum, s) => sum + ((mat.data[s] && mat.data[s][d]) || 0), 0));
    const grandTotal = totals.reduce((a, b) => a + b, 0);
    const avg = grandTotal / dates.length;
    const peakIdx = totals.indexOf(Math.max(...totals));
    const lowIdx = totals.indexOf(Math.min(...totals));
    const last7 = totals.slice(-7).reduce((a, b) => a + b, 0);
    const prev7 = totals.slice(-14, -7).reduce((a, b) => a + b, 0);
    const wow = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : null;
    const sourceTotals = sources
      .map((s) => ({ source: s, total: dates.reduce((sum, d) => sum + ((mat.data[s] && mat.data[s][d]) || 0), 0) }))
      .sort((a, b) => b.total - a.total);

    return {
      total: grandTotal, avg, peak: { date: dates[peakIdx], value: totals[peakIdx] },
      low: { date: dates[lowIdx], value: totals[lowIdx] }, wow, topSource: sourceTotals[0],
    };
  }, [sources, dates, mat]);

  return (
    <div>
      {/* KPI row */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Kpi label="Total" value={fmtNum(kpis.total)} delta={kpis.wow} />
          <Kpi label="Daily avg" value={fmtNum(kpis.avg)} />
          <Kpi label="Peak day" value={fmtNum(kpis.peak.value)} sub={kpis.peak.date} />
          <Kpi label="Lowest day" value={fmtNum(kpis.low.value)} sub={kpis.low.date} />
        </div>
      )}

      {/* Controls panel */}
      <div className="border border-border bg-surface rounded-2xl p-5 mb-5">
        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={metric}
            onChange={(e) => handleMetricChange(e.target.value)}
            className="bg-surface2 border border-border rounded-lg px-3 py-2 text-xs"
          >
            {metrics.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value)}
            className="bg-surface2 border border-border rounded-lg px-3 py-2 text-xs"
          >
            <option value="line">Line</option>
            <option value="bar">Bar</option>
            <option value="pie">Pie (totals)</option>
            <option value="table">Table</option>
          </select>
          <input
            type="date" value={dateFrom} min={mat.dates[0]} max={mat.dates[mat.dates.length - 1]}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-surface2 border border-border rounded-lg px-3 py-2 text-xs"
          />
          <span className="self-center text-xs text-dim">to</span>
          <input
            type="date" value={dateTo} min={mat.dates[0]} max={mat.dates[mat.dates.length - 1]}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-surface2 border border-border rounded-lg px-3 py-2 text-xs"
          />
        </div>

        {/* Source chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {mat.sources.map((s, i) => (
            <button
              key={s}
              onClick={() => toggleSource(s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition ${
                selectedSources.has(s)
                  ? 'border-accentDim bg-accent/10 text-text'
                  : 'border-border bg-surface2 text-dim'
              }`}
            >
              <span className="w-2 h-2 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
              {s}
            </button>
          ))}
        </div>

        {/* Chart / table */}
        {sources.length === 0 ? (
          <p className="text-dim text-sm py-10 text-center">Select at least one source.</p>
        ) : chartType === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left py-2 px-2 text-dim uppercase tracking-wide font-medium border-b border-border">Date</th>
                  {sources.map((s) => (
                    <th key={s} className="text-right py-2 px-2 text-dim uppercase tracking-wide font-medium border-b border-border">{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map((d) => (
                  <tr key={d}>
                    <td className="py-2 px-2 border-b border-border">{d}</td>
                    {sources.map((s) => (
                      <td key={s} className="text-right py-2 px-2 border-b border-border num">
                        {fmtNum((mat.data[s] && mat.data[s][d]) || 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : chartType === 'pie' ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={110}>
                {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1D2530', border: '1px solid #2A323D', borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#8B96A5' }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            {chartType === 'bar' ? (
              <BarChart data={chartData}>
                <CartesianGrid stroke="#2A323D" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#8B96A5', fontSize: 11 }} />
                <YAxis tick={{ fill: '#8B96A5', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1D2530', border: '1px solid #2A323D', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#8B96A5' }} />
                {sources.map((s, i) => <Bar key={s} dataKey={s} fill={PALETTE[i % PALETTE.length]} />)}
              </BarChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid stroke="#2A323D" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#8B96A5', fontSize: 11 }} />
                <YAxis tick={{ fill: '#8B96A5', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1D2530', border: '1px solid #2A323D', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#8B96A5' }} />
                {sources.map((s, i) => (
                  <Line key={s} type="monotone" dataKey={s} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Insights panel */}
      {kpis && (
        <div className="border border-border bg-surface rounded-2xl p-5">
          <h2 className="text-xs font-semibold text-dim uppercase tracking-wide mb-3">Key points</h2>
          <ul className="text-sm space-y-2">
            <InsightRow>Peak day: <span className="num">{kpis.peak.date}</span> ({fmtNum(kpis.peak.value)})</InsightRow>
            <InsightRow>Lowest day: <span className="num">{kpis.low.date}</span> ({fmtNum(kpis.low.value)})</InsightRow>
            {kpis.wow !== null && (
              <InsightRow>
                Last 7 days vs previous 7: {kpis.wow >= 0 ? '+' : ''}{kpis.wow.toFixed(1)}%
              </InsightRow>
            )}
            {kpis.topSource && (
              <InsightRow>Top selected source: {kpis.topSource.source} ({fmtNum(kpis.topSource.total)})</InsightRow>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, delta, sub }) {
  return (
    <div className="border border-border bg-surface rounded-2xl p-4">
      <div className="text-[11px] text-dim uppercase tracking-wide mb-1.5">{label}</div>
      <div className="text-xl font-semibold num">{value}</div>
      {sub && <div className="text-[11px] text-dim mt-1 num">{sub}</div>}
      {delta !== undefined && delta !== null && (
        <div className={`text-xs mt-1 ${delta >= 0 ? 'text-accent' : 'text-neg'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs prior 7d
        </div>
      )}
    </div>
  );
}

function InsightRow({ children }) {
  return (
    <li className="flex gap-2 pb-2 border-b border-border last:border-0">
      <span className="text-accent num">&rarr;</span>
      <span>{children}</span>
    </li>
  );
}
