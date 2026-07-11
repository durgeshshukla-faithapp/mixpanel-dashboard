'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const PALETTE = ['#C9A96E', '#4E9B6F', '#5B8FA8', '#7A6BA8', '#A85050', '#6BA88C', '#A89B5B', '#5A5D5B'];
const inputCls = 'bg-surface2 border border-border rounded-md px-3 py-2 text-xs font-mono';
const labelCls = 'text-[10px] text-dim uppercase tracking-widest font-display font-medium mb-1 block';
const btnCls = 'bg-gold text-bg font-display font-medium text-sm px-5 py-2 rounded-md hover:opacity-90 transition disabled:opacity-40';

function fmtNum(n) {
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K';
  if (n !== 0 && Math.abs(n) < 1) return (n * 100).toFixed(1) + '%';
  return Math.round(n).toLocaleString();
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const OPERATORS = [
  { key: '==', label: 'equals' },
  { key: '!=', label: 'not equals' },
  { key: 'contains', label: 'contains' },
  { key: '>', label: 'greater than' },
  { key: '<', label: 'less than' },
];

export default function QueryBuilder() {
  const [mode, setMode] = useState('insights'); // insights | funnel | retention
  const [events, setEvents] = useState([]);
  const [funnels, setFunnels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Insights state
  const [event, setEvent] = useState('');
  const [properties, setProperties] = useState([]);
  const [filters, setFilters] = useState([]); // {prop, op, value}
  const [breakdown, setBreakdown] = useState('');
  const [measureType, setMeasureType] = useState('general'); // general=events, unique=users
  const [chartType, setChartType] = useState('line');
  const [segResult, setSegResult] = useState(null);

  // Funnel state
  const [funnelId, setFunnelId] = useState('');
  const [funnelResult, setFunnelResult] = useState(null);

  // Retention state
  const [bornEvent, setBornEvent] = useState('');
  const [returnEvent, setReturnEvent] = useState('');
  const [retentionUnit, setRetentionUnit] = useState('day');
  const [retentionResult, setRetentionResult] = useState(null);

  // Shared
  const [fromDate, setFromDate] = useState(daysAgo(30));
  const [toDate, setToDate] = useState(daysAgo(0));

  useEffect(() => {
    fetch('/api/mixpanel-meta?kind=events')
      .then((r) => r.json())
      .then((d) => setEvents(d.events || []))
      .catch(() => {});
    fetch('/api/mixpanel-meta?kind=funnels')
      .then((r) => r.json())
      .then((d) => setFunnels(d.funnels || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!event) { setProperties([]); return; }
    fetch(`/api/mixpanel-meta?kind=properties&event=${encodeURIComponent(event)}`)
      .then((r) => r.json())
      .then((d) => setProperties(d.properties || []))
      .catch(() => setProperties([]));
  }, [event]);

  function buildWhere() {
    const clauses = filters
      .filter((f) => f.prop && f.value !== '')
      .map((f) => {
        const prop = `properties["${f.prop}"]`;
        if (f.op === 'contains') return `"${f.value}" in ${prop}`;
        if (f.op === '>' || f.op === '<') return `${prop} ${f.op} ${isNaN(f.value) ? `"${f.value}"` : f.value}`;
        return `${prop} ${f.op} "${f.value}"`;
      });
    return clauses.join(' and ');
  }

  async function runQuery() {
    setLoading(true);
    setError('');
    try {
      if (mode === 'insights') {
        const res = await fetch('/api/mixpanel-query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'segmentation',
            event, fromDate, toDate,
            where: buildWhere() || undefined,
            on: breakdown ? `properties["${breakdown}"]` : undefined,
            type: measureType,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setSegResult(data);
      } else if (mode === 'funnel') {
        const res = await fetch('/api/mixpanel-query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'funnel', funnelId, fromDate, toDate }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setFunnelResult(data);
      } else {
        const res = await fetch('/api/mixpanel-query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'retention', bornEvent, returnEvent: returnEvent || undefined,
            fromDate, toDate, unit: retentionUnit, intervalCount: 10,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setRetentionResult(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const segChartData = useMemo(() => {
    if (!segResult) return [];
    return segResult.dates.map((d) => {
      const row = { date: d.slice(5) };
      segResult.sources.forEach((s) => { row[s] = segResult.data[s]?.[d] || 0; });
      return row;
    });
  }, [segResult]);

  const canRun = mode === 'insights' ? !!event : mode === 'funnel' ? !!funnelId : !!bornEvent;

  return (
    <div>
      {/* Mode tabs */}
      <div className="flex gap-1 mb-5 border-b border-border">
        {[['insights', 'Insights'], ['funnel', 'Funnels'], ['retention', 'Retention']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setMode(key); setError(''); }}
            className={`text-[12px] px-4 py-2 border-b-2 font-display font-medium transition ${
              mode === key ? 'border-gold text-text' : 'border-transparent text-dim'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Query controls */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-5 space-y-4">
        {mode === 'insights' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Event *</label>
                <select value={event} onChange={(e) => { setEvent(e.target.value); setBreakdown(''); setFilters([]); }} className={inputCls + ' w-full'}>
                  <option value="">Select event...</option>
                  {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Measure</label>
                <select value={measureType} onChange={(e) => setMeasureType(e.target.value)} className={inputCls + ' w-full'}>
                  <option value="general">Total events</option>
                  <option value="unique">Unique users</option>
                  <option value="average">Average per user</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Breakdown by</label>
                <select value={breakdown} onChange={(e) => setBreakdown(e.target.value)} className={inputCls + ' w-full'} disabled={!event}>
                  <option value="">No breakdown</option>
                  {properties.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Filters */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls + ' mb-0'}>Filters</label>
                <button
                  onClick={() => setFilters([...filters, { prop: '', op: '==', value: '' }])}
                  disabled={!event}
                  className="text-[11px] text-gold hover:underline disabled:opacity-40 font-display"
                >
                  + Add filter
                </button>
              </div>
              {filters.map((f, i) => (
                <div key={i} className="flex gap-2 mb-2 items-center">
                  <select
                    value={f.prop}
                    onChange={(e) => setFilters(filters.map((x, j) => j === i ? { ...x, prop: e.target.value } : x))}
                    className={inputCls + ' flex-1'}
                  >
                    <option value="">Property...</option>
                    {properties.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select
                    value={f.op}
                    onChange={(e) => setFilters(filters.map((x, j) => j === i ? { ...x, op: e.target.value } : x))}
                    className={inputCls}
                  >
                    {OPERATORS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  <input
                    value={f.value}
                    onChange={(e) => setFilters(filters.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                    placeholder="Value"
                    className={inputCls + ' flex-1'}
                  />
                  <button
                    onClick={() => setFilters(filters.filter((_, j) => j !== i))}
                    className="text-dim hover:text-down text-sm px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {mode === 'funnel' && (
          <div>
            <label className={labelCls}>Saved funnel *</label>
            <select value={funnelId} onChange={(e) => setFunnelId(e.target.value)} className={inputCls + ' w-full sm:w-96'}>
              <option value="">Select funnel...</option>
              {funnels.map((f) => <option key={f.funnel_id} value={f.funnel_id}>{f.name}</option>)}
            </select>
            {funnels.length === 0 && (
              <p className="text-[11px] text-dim mt-2">
                No saved funnels found in the project — create one inside Mixpanel first (Funnels section).
              </p>
            )}
          </div>
        )}

        {mode === 'retention' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Cohort event (did first) *</label>
              <select value={bornEvent} onChange={(e) => setBornEvent(e.target.value)} className={inputCls + ' w-full'}>
                <option value="">Select event...</option>
                {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Return event (came back to do)</label>
              <select value={returnEvent} onChange={(e) => setReturnEvent(e.target.value)} className={inputCls + ' w-full'}>
                <option value="">Any event</option>
                {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Unit</label>
              <select value={retentionUnit} onChange={(e) => setRetentionUnit(e.target.value)} className={inputCls + ' w-full'}>
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
              </select>
            </div>
          </div>
        )}

        {/* Shared: date range + run */}
        <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-border">
          <div>
            <label className={labelCls}>From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
          </div>
          {mode === 'insights' && (
            <div>
              <label className={labelCls}>Chart</label>
              <select value={chartType} onChange={(e) => setChartType(e.target.value)} className={inputCls}>
                <option value="line">Line</option>
                <option value="bar">Bar</option>
                <option value="table">Table</option>
              </select>
            </div>
          )}
          <button onClick={runQuery} disabled={!canRun || loading} className={btnCls}>
            {loading ? 'Running...' : 'Run query'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-xs font-mono text-down border border-down/30 bg-down/10 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* Results */}
      {mode === 'insights' && segResult && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="text-[10px] text-dim uppercase tracking-widest font-display font-medium mb-4">
            {segResult.sources.length} segment{segResult.sources.length > 1 ? 's' : ''} · {segResult.dates.length} days
          </div>
          {chartType === 'table' ? (
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-2 text-dim uppercase tracking-wide font-display font-medium border-b border-border sticky top-0 bg-surface">Date</th>
                    {segResult.sources.map((s) => (
                      <th key={s} className="text-right py-2 px-2 text-dim uppercase tracking-wide font-display font-medium border-b border-border sticky top-0 bg-surface whitespace-nowrap">{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {segResult.dates.map((d) => (
                    <tr key={d}>
                      <td className="py-1.5 px-2 border-b border-border num text-dim">{d}</td>
                      {segResult.sources.map((s) => (
                        <td key={s} className="text-right py-1.5 px-2 border-b border-border num">{fmtNum(segResult.data[s]?.[d] || 0)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              {chartType === 'bar' ? (
                <BarChart data={segChartData}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--dim)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--dim)', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {segResult.sources.slice(0, 8).map((s, i) => (
                    <Bar key={s} dataKey={s} fill={PALETTE[i % PALETTE.length]} animationDuration={600} />
                  ))}
                </BarChart>
              ) : (
                <LineChart data={segChartData}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--dim)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--dim)', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {segResult.sources.slice(0, 8).map((s, i) => (
                    <Line key={s} type="monotone" dataKey={s} stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.5} dot={false} animationDuration={600} />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
          {segResult.sources.length > 8 && (
            <p className="text-[11px] text-dim mt-2">Showing first 8 of {segResult.sources.length} segments on the chart — use Table view for all.</p>
          )}
        </div>
      )}

      {mode === 'funnel' && funnelResult && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="space-y-4">
            {funnelResult.steps.map((step, i) => {
              const pctOfFirst = funnelResult.steps[0].count > 0 ? (step.count / funnelResult.steps[0].count) * 100 : 0;
              const pctOfPrev = i > 0 && funnelResult.steps[i - 1].count > 0
                ? (step.count / funnelResult.steps[i - 1].count) * 100 : null;
              return (
                <div key={i}>
                  <div className="flex justify-between items-baseline mb-1 text-xs">
                    <span className="font-display">{step.label}</span>
                    <span className="text-dim num">
                      {fmtNum(step.count)}
                      {pctOfPrev !== null && <span className="ml-2 text-gold">{pctOfPrev.toFixed(1)}% of prev</span>}
                    </span>
                  </div>
                  <div className="h-5 bg-surface2 rounded overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${Math.max(pctOfFirst, 2)}%`, background: PALETTE[i % PALETTE.length] }} />
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-dim pt-2 border-t border-border">
              Overall conversion: <span className="text-gold num">{funnelResult.overallConversion.toFixed(1)}%</span>
            </p>
          </div>
        </div>
      )}

      {mode === 'retention' && retentionResult && (
        <div className="bg-surface border border-border rounded-lg p-5 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left py-2 px-2 text-dim uppercase tracking-wide font-display font-medium border-b border-border">Cohort</th>
                <th className="text-right py-2 px-2 text-dim uppercase tracking-wide font-display font-medium border-b border-border">Size</th>
                {retentionResult.cohorts[0]?.percents.map((_, i) => (
                  <th key={i} className="text-right py-2 px-2 text-dim uppercase tracking-wide font-display font-medium border-b border-border whitespace-nowrap">
                    {retentionUnit === 'day' ? `D${i}` : retentionUnit === 'week' ? `W${i}` : `M${i}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {retentionResult.cohorts.map((c) => (
                <tr key={c.date}>
                  <td className="py-1.5 px-2 border-b border-border num text-dim whitespace-nowrap">{c.date}</td>
                  <td className="text-right py-1.5 px-2 border-b border-border num">{fmtNum(c.first)}</td>
                  {c.percents.map((p, i) => (
                    <td
                      key={i}
                      className="text-right py-1.5 px-2 border-b border-border num"
                      style={{ background: `rgba(201,169,110,${Math.min(p / 100, 1) * 0.35})` }}
                    >
                      {p > 0 ? p.toFixed(0) + '%' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {retentionResult.cohorts.length === 0 && (
            <p className="text-dim text-sm py-6 text-center">No cohort data for this range.</p>
          )}
        </div>
      )}
    </div>
  );
}
