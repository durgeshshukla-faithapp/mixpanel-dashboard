'use client';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const PALETTE = ['#C9A96E', '#4E9B6F', '#5B8FA8', '#7A6BA8', '#A85050', '#6BA88C', '#A89B5B', '#5A5D5B'];
const OVERALL = 'Overall';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtNum(n) {
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K';
  // Values between 0 and 1 are almost certainly rates/percentages (e.g. conversion
  // rate 0.077558), not integer counts - show them as a percentage instead of
  // rounding to 0.
  if (n !== 0 && Math.abs(n) < 1) return (n * 100).toFixed(1) + '%';
  return Math.round(n).toLocaleString();
}

function shortMetricName(name) {
  return name.replace(/^[A-Z]\.\s*/, '').replace(/\s+(of|on)\s+\S+$/i, '');
}

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DashboardClient({ matrices, funnelData = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const metricKeys = Object.keys(matrices);

  // Initialize state from URL (shareable filter links) or sensible defaults
  const [view, setView] = useState(searchParams.get('view') || 'trend');
  const [tableSearch, setTableSearch] = useState('');
  const [metric, setMetric] = useState(searchParams.get('metric') || metricKeys[0] || '');
  const mat = matrices[metric] || { sources: [], dates: [], data: {} };

  function valueFor(source, date) {
    if (source === OVERALL) {
      return mat.sources.reduce((sum, s) => sum + ((mat.data[s] && mat.data[s][date]) || 0), 0);
    }
    return (mat.data[source] && mat.data[source][date]) || 0;
  }

  const urlSources = searchParams.get('sources');
  const [selectedSources, setSelectedSources] = useState(() =>
    urlSources ? new Set(urlSources.split(',')) : new Set([OVERALL])
  );
  const [chartType, setChartType] = useState(searchParams.get('chart') || 'line');
  const [dateFrom, setDateFrom] = useState(searchParams.get('from') || mat.dates[0] || '');
  const [dateTo, setDateTo] = useState(searchParams.get('to') || mat.dates[mat.dates.length - 1] || '');
  const [showMovingAvg, setShowMovingAvg] = useState(searchParams.get('ma') === '1');
  const [comparePrevious, setComparePrevious] = useState(searchParams.get('cmp') === '1');
  const [cumulative, setCumulative] = useState(searchParams.get('cum') === '1');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState('');

  async function explainWithAi(kpisData, metricName) {
    setAiLoading(true);
    setAiExplanation('');
    try {
      const summary = {
        total: kpisData.total,
        dailyAverage: kpisData.avg,
        peakDay: kpisData.peak,
        lowestDay: kpisData.low,
        weekOverWeekChangePercent: kpisData.wow,
        unusualDays: kpisData.anomalies,
      };
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary, metricName: shortMetricName(metricName) }),
      });
      const data = await res.json();
      setAiExplanation(data.text || data.error || 'No response');
    } catch (err) {
      setAiExplanation(`Error: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  }

  // Keep the URL in sync so the current view can be shared as a link
  useEffect(() => {
    setAiExplanation('');
  }, [metric, dateFrom, dateTo, selectedSources]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('view', view);
    params.set('metric', metric);
    params.set('sources', Array.from(selectedSources).join(','));
    params.set('chart', chartType);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    if (showMovingAvg) params.set('ma', '1');
    if (comparePrevious) params.set('cmp', '1');
    if (cumulative) params.set('cum', '1');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, metric, selectedSources, chartType, dateFrom, dateTo, showMovingAvg, comparePrevious, cumulative]);

  function handleMetricChange(newMetric) {
    setMetric(newMetric);
    setSelectedSources(new Set([OVERALL]));
  }

  function toggleSource(s) {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  function copyShareLink() {
    navigator.clipboard.writeText(window.location.href);
  }

  const allDates = useMemo(() => {
    const set = new Set();
    metricKeys.forEach((k) => matrices[k].dates.forEach((d) => set.add(d)));
    return Array.from(set).sort();
  }, [matrices, metricKeys]);

  const dates = useMemo(
    () => mat.dates.filter((d) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo)),
    [mat, dateFrom, dateTo]
  );
  const sourceOptions = [OVERALL, ...mat.sources];
  const sources = sourceOptions.filter((s) => selectedSources.has(s));

  // Combined total per day across selected sources - basis for moving avg / compare / cumulative
  const dailyTotals = useMemo(
    () => dates.map((d) => sources.reduce((sum, s) => sum + valueFor(s, d), 0)),
    [dates, sources, mat]
  );

  const movingAvgSeries = useMemo(() => {
    const window = 7;
    return dailyTotals.map((_, i) => {
      const start = Math.max(0, i - window + 1);
      const slice = dailyTotals.slice(start, i + 1);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
  }, [dailyTotals]);

  const previousPeriodSeries = useMemo(() => {
    const n = dates.length;
    if (n === 0) return [];
    const firstIdx = allDates.indexOf(dates[0]);
    if (firstIdx < n) return dates.map(() => null); // not enough history to compare
    const prevDates = allDates.slice(firstIdx - n, firstIdx);
    return prevDates.map((d) => sources.reduce((sum, s) => sum + valueFor(s, d), 0));
  }, [dates, sources, allDates, mat]);

  const chartData = useMemo(() => {
    let running = 0;
    return dates.map((d, i) => {
      const row = { date: d.slice(5) };
      sources.forEach((s) => { row[s] = valueFor(s, d); });
      if (cumulative) {
        running += dailyTotals[i];
        row.__cumulative = running;
      }
      if (showMovingAvg) row.__movingAvg = movingAvgSeries[i];
      if (comparePrevious) row.__previous = previousPeriodSeries[i];
      return row;
    });
  }, [dates, sources, mat, cumulative, showMovingAvg, comparePrevious, dailyTotals, movingAvgSeries, previousPeriodSeries]);

  const pieData = useMemo(
    () => sources.map((s) => ({ name: s, value: dates.reduce((sum, d) => sum + valueFor(s, d), 0) })),
    [sources, dates, mat]
  );

  // KPIs + statistical anomaly detection (flags days beyond 2 standard deviations)
  const kpis = useMemo(() => {
    if (sources.length === 0 || dates.length === 0) return null;
    const totals = dailyTotals;
    const grandTotal = totals.reduce((a, b) => a + b, 0);
    const avg = grandTotal / dates.length;
    const variance = totals.reduce((s, v) => s + (v - avg) ** 2, 0) / totals.length;
    const stddev = Math.sqrt(variance);
    const peakIdx = totals.indexOf(Math.max(...totals));
    const lowIdx = totals.indexOf(Math.min(...totals));
    const last7 = totals.slice(-7).reduce((a, b) => a + b, 0);
    const prev7 = totals.slice(-14, -7).reduce((a, b) => a + b, 0);
    const wow = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : null;
    const anomalies = dates
      .map((d, i) => ({ date: d, value: totals[i], z: stddev > 0 ? (totals[i] - avg) / stddev : 0 }))
      .filter((r) => Math.abs(r.z) >= 2)
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
      .slice(0, 3);
    return {
      total: grandTotal, avg, peak: { date: dates[peakIdx], value: totals[peakIdx] },
      low: { date: dates[lowIdx], value: totals[lowIdx] }, wow, anomalies,
    };
  }, [sources, dates, dailyTotals]);

  // Day-of-week pattern (based on Overall across the selected range)
  const weekdayPattern = useMemo(() => {
    const buckets = WEEKDAYS.map(() => ({ sum: 0, count: 0 }));
    dates.forEach((d) => {
      const day = new Date(d + 'T00:00:00').getDay();
      buckets[day].sum += valueFor(OVERALL, d);
      buckets[day].count += 1;
    });
    return WEEKDAYS.map((label, i) => ({
      label,
      avg: buckets[i].count > 0 ? buckets[i].sum / buckets[i].count : 0,
    }));
  }, [dates, mat]);
  const weekdayMax = Math.max(...weekdayPattern.map((w) => w.avg), 1);

  // Funnel: total per metric over the selected range (Overall), with stage-to-stage conversion %
  const funnelStages = useMemo(() => {
    return metricKeys.map((k) => {
      const m = matrices[k];
      const rangeDates = m.dates.filter((d) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo));
      const total = rangeDates.reduce(
        (sum, d) => sum + m.sources.reduce((s2, src) => s2 + ((m.data[src] && m.data[src][d]) || 0), 0), 0
      );
      return { metric: k, label: shortMetricName(k), total };
    });
  }, [matrices, metricKeys, dateFrom, dateTo]);

  // Breakdown table: Overall row first, then every real source, every metric as a column
  const breakdownRows = useMemo(() => {
    const allSources = Array.from(new Set(metricKeys.flatMap((k) => matrices[k].sources)));
    function valueForMetric(metricKey, source, date) {
      const m = matrices[metricKey];
      if (source === OVERALL) {
        return m.sources.reduce((sum, s) => sum + ((m.data[s] && m.data[s][date]) || 0), 0);
      }
      return (m.data[source] && m.data[source][date]) || 0;
    }
    function rowFor(source) {
      const values = metricKeys.map((k) => {
        const m = matrices[k];
        const rangeDates = m.dates.filter((d) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo));
        return rangeDates.reduce((sum, d) => sum + valueForMetric(k, source, d), 0);
      });
      return { source, values };
    }
    const overallRow = rowFor(OVERALL);
    const rows = allSources.map(rowFor);
    const lastColTotal = overallRow.values[overallRow.values.length - 1] || 0;
    rows.forEach((r) => { r.share = lastColTotal > 0 ? (r.values[r.values.length - 1] / lastColTotal) * 100 : 0; });
    rows.sort((a, b) => b.values[b.values.length - 1] - a.values[a.values.length - 1]);
    overallRow.share = 100;
    return [overallRow, ...rows];
  }, [matrices, metricKeys, dateFrom, dateTo]);

  // Detailed table: one row per (source, date), all metrics side by side
  const detailedRows = useMemo(() => {
    const allSources = Array.from(new Set(metricKeys.flatMap((k) => matrices[k].sources)));
    const rows = [];
    dates.forEach((d) => {
      allSources.forEach((source) => {
        const values = metricKeys.map((k) => (matrices[k].data[source] && matrices[k].data[source][d]) || 0);
        if (values.some((v) => v > 0)) rows.push({ source, date: d, values });
      });
    });
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const q = tableSearch.toLowerCase();
    const filtered = tableSearch
      ? rows.filter((r) => r.source.toLowerCase().includes(q) || fmtDate(r.date).toLowerCase().includes(q))
      : rows;
    const overallValues = metricKeys.map((_, i) => filtered.reduce((sum, r) => sum + r.values[i], 0));
    return { rows: filtered, overallValues };
  }, [matrices, metricKeys, dates, tableSearch]);

  function downloadCsv() {
    const headers = ['Source', 'Date', ...metricKeys.map(shortMetricName)];
    const lines = [headers.join(',')];
    detailedRows.rows.forEach((r) => lines.push([r.source, r.date, ...r.values].join(',')));
    lines.push(['Overall', '', ...detailedRows.overallValues].join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'dashboard-data.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-5 border-b border-border items-center">
        {[
          ['trend', 'Trend'], ['table', 'Table'], ['breakdown', 'Breakdown'], ['funnel', 'Compare'],
          ...(funnelData ? [['realfunnel', 'Funnel']] : []),
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`text-sm px-4 py-2 border-b-2 transition ${
              view === key ? 'border-gold text-text font-medium' : 'border-transparent text-dim'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={copyShareLink}
          className="text-xs px-3 py-1.5 mb-2 rounded-lg border border-border bg-surface2 hover:border-gold/40 transition"
          title="Copy a link to this exact view"
        >
          Copy link
        </button>
        <div className="flex items-center gap-2 pb-2 ml-2">
          <input
            type="date" value={dateFrom} min={allDates[0]} max={allDates[allDates.length - 1]}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs"
          />
          <span className="text-xs text-dim">to</span>
          <input
            type="date" value={dateTo} min={allDates[0]} max={allDates[allDates.length - 1]}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-surface2 border border-border rounded-lg px-2 py-1.5 text-xs"
          />
        </div>
      </div>

      {view === 'trend' && kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Kpi label="Total" value={fmtNum(kpis.total)} delta={kpis.wow} />
          <Kpi label="Daily avg" value={fmtNum(kpis.avg)} />
          <Kpi label="Peak day" value={fmtNum(kpis.peak.value)} sub={kpis.peak.date} />
          <Kpi label="Lowest day" value={fmtNum(kpis.low.value)} sub={kpis.low.date} />
        </div>
      )}

      {view === 'trend' ? (
        <div className="border border-border bg-surface rounded-lg p-5">
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={metric}
              onChange={(e) => handleMetricChange(e.target.value)}
              className="bg-surface2 border border-border rounded-lg px-3 py-2 text-xs"
            >
              {metricKeys.map((m) => <option key={m} value={m}>{shortMetricName(m)}</option>)}
            </select>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value)}
              className="bg-surface2 border border-border rounded-lg px-3 py-2 text-xs"
            >
              <option value="line">Line</option>
              <option value="bar">Bar</option>
              <option value="pie">Pie (totals)</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border bg-surface2 cursor-pointer">
              <input type="checkbox" checked={showMovingAvg} onChange={(e) => setShowMovingAvg(e.target.checked)} />
              7-day avg
            </label>
            <label className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border bg-surface2 cursor-pointer">
              <input type="checkbox" checked={comparePrevious} onChange={(e) => setComparePrevious(e.target.checked)} />
              Compare to previous period
            </label>
            <label className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border bg-surface2 cursor-pointer">
              <input type="checkbox" checked={cumulative} onChange={(e) => setCumulative(e.target.checked)} />
              Cumulative
            </label>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {sourceOptions.map((s, i) => (
              <button
                key={s}
                onClick={() => toggleSource(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border transition ${
                  selectedSources.has(s) ? 'border-gold/40 bg-gold/10 text-text' : 'border-border bg-surface2 text-dim'
                } ${s === OVERALL ? 'font-medium' : ''}`}
              >
                <span className="w-2 h-2 rounded-sm" style={{ background: s === OVERALL ? PALETTE[7] : PALETTE[(i - 1) % PALETTE.length] }} />
                {s}
              </button>
            ))}
          </div>

          {sources.length === 0 ? (
            <p className="text-dim text-sm py-10 text-center">Select at least one source.</p>
          ) : chartType === 'pie' ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={110} animationDuration={700} animationEasing="ease-out">
                  {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--dim)' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              {chartType === 'bar' ? (
                <BarChart data={chartData}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--dim)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--dim)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--dim)' }} />
                  {!cumulative && sources.map((s, i) => <Bar key={s} dataKey={s} fill={PALETTE[i % PALETTE.length]} animationDuration={700} animationEasing="ease-out" />)}
                  {cumulative && <Bar dataKey="__cumulative" name="Cumulative" fill={PALETTE[0]} animationDuration={700} animationEasing="ease-out" />}
                  {showMovingAvg && !cumulative && <Line type="monotone" dataKey="__movingAvg" name="7-day avg" stroke="#8B96A5" strokeDasharray="4 3" dot={false} animationDuration={700} animationEasing="ease-out" />}
                  {comparePrevious && !cumulative && <Line type="monotone" dataKey="__previous" name="Previous period" stroke="#F0A868" strokeDasharray="4 3" dot={false} animationDuration={700} animationEasing="ease-out" />}
                </BarChart>
              ) : (
                <LineChart data={chartData}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--dim)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--dim)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--dim)' }} />
                  {!cumulative && sources.map((s, i) => (
                    <Line key={s} type="monotone" dataKey={s} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} animationDuration={700} animationEasing="ease-out" />
                  ))}
                  {cumulative && <Line type="monotone" dataKey="__cumulative" name="Cumulative" stroke={PALETTE[0]} strokeWidth={2} dot={false} animationDuration={700} animationEasing="ease-out" />}
                  {showMovingAvg && !cumulative && <Line type="monotone" dataKey="__movingAvg" name="7-day avg" stroke="#8B96A5" strokeWidth={2} strokeDasharray="4 3" dot={false} animationDuration={700} animationEasing="ease-out" />}
                  {comparePrevious && !cumulative && <Line type="monotone" dataKey="__previous" name="Previous period" stroke="#F0A868" strokeWidth={2} strokeDasharray="4 3" dot={false} animationDuration={700} animationEasing="ease-out" />}
                </LineChart>
              )}
            </ResponsiveContainer>
          )}

          {/* Day-of-week pattern strip */}
          <div className="mt-6 pt-5 border-t border-border">
            <h3 className="text-[11px] text-dim uppercase tracking-wide mb-3">Day-of-week pattern (Overall)</h3>
            <div className="grid grid-cols-7 gap-2">
              {weekdayPattern.map((w) => (
                <div key={w.label} className="text-center">
                  <div
                    className="rounded-lg mb-1"
                    style={{
                      height: 40,
                      background: `rgba(61,220,151,${0.15 + 0.7 * (w.avg / weekdayMax)})`,
                    }}
                    title={fmtNum(w.avg)}
                  />
                  <div className="text-[10px] text-dim">{w.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : view === 'table' ? (
        <div className="border border-border bg-surface rounded-lg p-5">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search source or date..."
              className="bg-surface2 border border-border rounded-lg px-3 py-2 text-xs flex-1 min-w-[160px]"
            />
            <select
              value=""
              onChange={(e) => e.target.value && setTableSearch(e.target.value)}
              className="bg-surface2 border border-border rounded-lg px-3 py-2 text-xs"
            >
              <option value="">Jump to source...</option>
              {mat.sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              onClick={downloadCsv}
              className="text-xs px-3 py-2 rounded-lg border border-border bg-surface2 hover:border-gold/40 transition"
            >
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left py-2 px-2 text-dim uppercase tracking-wide font-medium border-b border-border sticky top-0 bg-surface whitespace-nowrap">Source</th>
                  <th className="text-left py-2 px-2 text-dim uppercase tracking-wide font-medium border-b border-border sticky top-0 bg-surface whitespace-nowrap">Date</th>
                  {metricKeys.map((k) => (
                    <th key={k} className="text-right py-2 px-2 text-dim uppercase tracking-wide font-medium border-b border-border sticky top-0 bg-surface whitespace-nowrap">
                      {shortMetricName(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailedRows.rows.map((r, i) => (
                  <tr key={r.source + r.date + i}>
                    <td className="py-2 px-2 border-b border-border">{r.source}</td>
                    <td className="py-2 px-2 border-b border-border num text-dim whitespace-nowrap">{fmtDate(r.date)}</td>
                    {r.values.map((v, j) => (
                      <td key={j} className="text-right py-2 px-2 border-b border-border num">{fmtNum(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td className="py-2 px-2 border-t border-border" colSpan={2}>Overall</td>
                  {detailedRows.overallValues.map((v, j) => (
                    <td key={j} className="text-right py-2 px-2 border-t border-border num">{fmtNum(v)}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : view === 'breakdown' ? (
        <div className="border border-border bg-surface rounded-lg p-5 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left py-2 px-2 text-dim uppercase tracking-wide font-medium border-b border-border">Source</th>
                {metricKeys.map((k) => (
                  <th key={k} className="text-right py-2 px-2 text-dim uppercase tracking-wide font-medium border-b border-border">
                    {shortMetricName(k)}
                  </th>
                ))}
                <th className="text-right py-2 px-2 text-dim uppercase tracking-wide font-medium border-b border-border">Share %</th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.map((r, i) => (
                <tr key={r.source} className={r.source === OVERALL ? 'font-medium' : ''}>
                  <td className="py-2 px-2 border-b border-border flex items-center gap-2">
                    <span className="w-2 h-2 rounded-sm inline-block" style={{ background: r.source === OVERALL ? PALETTE[7] : PALETTE[(i - 1) % PALETTE.length] }} />
                    {r.source}
                  </td>
                  {r.values.map((v, j) => (
                    <td key={j} className="text-right py-2 px-2 border-b border-border num">{fmtNum(v)}</td>
                  ))}
                  <td className="text-right py-2 px-2 border-b border-border num text-gold">{r.share.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : view === 'funnel' ? (
        <div className="border border-border bg-surface rounded-lg p-5">
          <h3 className="text-[11px] text-dim uppercase tracking-wide mb-1">
            Metric comparison (Overall, selected date range)
          </h3>
          <p className="text-xs text-dim mb-4">
            These are different measurements of the same event, not sequential steps -
            bars are scaled independently so each is readable, not as a % conversion.
          </p>
          <div className="space-y-4">
            {funnelStages.map((stage, i) => {
              const maxInGroup = Math.max(...funnelStages.map((s) => s.total), 1);
              const widthPct = (stage.total / maxInGroup) * 100;
              return (
                <div key={stage.metric}>
                  <div className="flex justify-between items-baseline mb-1 text-xs">
                    <span>{stage.label}</span>
                    <span className="text-dim num">{fmtNum(stage.total)}</span>
                  </div>
                  <div className="h-6 bg-surface2 rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg"
                      style={{ width: `${Math.max(widthPct, 2)}%`, background: PALETTE[i % PALETTE.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-dim mt-4">
            Have a real Mixpanel <strong>Funnel</strong> report (with sequential steps, not Insights)?
            That needs a different data source - ask to add support for it specifically.
          </p>
        </div>
      ) : (
        <div className="border border-border bg-surface rounded-lg p-5">
          <h3 className="text-[11px] text-dim uppercase tracking-wide mb-4">
            Funnel: sequential step drop-off (last 90 days)
          </h3>
          {funnelData && funnelData.steps.length > 0 ? (
            <div className="space-y-4">
              {funnelData.steps.map((step, i) => {
                const pctOfFirst = funnelData.steps[0].count > 0 ? (step.count / funnelData.steps[0].count) * 100 : 0;
                const pctOfPrev = i > 0 && funnelData.steps[i - 1].count > 0
                  ? (step.count / funnelData.steps[i - 1].count) * 100 : null;
                return (
                  <div key={i}>
                    <div className="flex justify-between items-baseline mb-1 text-xs">
                      <span>{step.label}</span>
                      <span className="text-dim num">
                        {fmtNum(step.count)}
                        {pctOfPrev !== null && <span className="ml-2 text-gold">{pctOfPrev.toFixed(1)}% of prev step</span>}
                      </span>
                    </div>
                    <div className="h-6 bg-surface2 rounded-lg overflow-hidden">
                      <div
                        className="h-full rounded-lg"
                        style={{ width: `${Math.max(pctOfFirst, 2)}%`, background: PALETTE[i % PALETTE.length] }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-dim pt-2 border-t border-border">
                Overall conversion: <span className="text-gold num">{funnelData.overallConversion.toFixed(1)}%</span>
              </p>
            </div>
          ) : (
            <p className="text-dim text-sm py-6 text-center">No funnel data available.</p>
          )}
        </div>
      )}

      {view === 'trend' && kpis && (
        <div className="border border-border bg-surface rounded-lg p-5 mt-5">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xs font-semibold text-dim uppercase tracking-wide">Key points</h2>
            <button
              onClick={() => explainWithAi(kpis, metric)}
              disabled={aiLoading}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-surface2 hover:border-gold/40 transition disabled:opacity-50"
            >
              {aiLoading ? 'Thinking...' : '✨ Explain this'}
            </button>
          </div>
          {aiExplanation && (
            <div className="text-sm bg-accent/5 border border-gold/20 rounded-lg px-3 py-2 mb-3">
              {aiExplanation}
            </div>
          )}
          <ul className="text-sm space-y-2">
            <li className="flex gap-2 pb-2 border-b border-border">
              <span className="text-gold num">&rarr;</span>
              Peak day: <span className="num">{kpis.peak.date}</span> ({fmtNum(kpis.peak.value)})
            </li>
            <li className="flex gap-2 pb-2 border-b border-border">
              <span className="text-gold num">&rarr;</span>
              Lowest day: <span className="num">{kpis.low.date}</span> ({fmtNum(kpis.low.value)})
            </li>
            {kpis.wow !== null && (
              <li className="flex gap-2 pb-2 border-b border-border">
                <span className="text-gold num">&rarr;</span>
                Last 7 days vs previous 7: {kpis.wow >= 0 ? '+' : ''}{kpis.wow.toFixed(1)}%
              </li>
            )}
            {kpis.anomalies.length > 0 && kpis.anomalies.map((a) => (
              <li key={a.date} className="flex gap-2 pb-2 border-b border-border last:border-0">
                <span className="text-gold num">&rarr;</span>
                Unusual day: <span className="num">{a.date}</span> ({fmtNum(a.value)}, {a.z >= 0 ? 'above' : 'below'} normal range)
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, delta, sub }) {
  return (
    <div className="border border-border bg-surface rounded-lg p-4">
      <div className="text-[11px] text-dim uppercase tracking-wide mb-1.5">{label}</div>
      <div className="text-2xl font-display font-bold">{value}</div>
      {sub && <div className="text-[11px] text-dim mt-1 num">{sub}</div>}
      {delta !== undefined && delta !== null && (
        <div className={`text-xs mt-1 ${delta >= 0 ? 'text-gold' : 'text-down'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs prior 7d
        </div>
      )}
    </div>
  );
}
