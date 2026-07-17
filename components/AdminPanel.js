'use client';
import { useState, useEffect } from 'react';

const FIELD_HINTS = {
  tag: { placeholder: 'Marketing, Analytics, Product...', hint: 'Dashboard category — used for filtering and access control' },
  owner: { placeholder: 'Durgesh, Snehal, Utsav...', hint: 'Person responsible for this dashboard (shown on the card)' },
  slackMetrics: { placeholder: 'ALL or Sum of value,Uniques', hint: 'Which metrics to send to Slack. ALL = everything. Or partial name match: "Sum of value" matches "G. Sum of value on register"' },
  slackFormat: { hint: 'How this report appears in Slack messages' },
  slackGroup: { placeholder: 'pdp_rails or slots', hint: 'Reports with the same group name are combined into one Slack table. Leave blank for a standalone message.' },
  goals: { placeholder: '{"Sum of value": 100000, "Uniques": 50}', hint: 'Daily targets as JSON. Slack will show % of goal achieved. Keys = partial metric name match.' },
};

const inputCls = 'w-full bg-surface border border-border rounded-md px-3 py-2 text-xs font-mono placeholder:text-dim/40 focus:outline-none focus:border-gold/50 transition';
const labelCls = 'text-[10px] text-dim uppercase tracking-widest font-display font-medium mb-1 block';
const hintCls = 'text-[10px] text-dim/60 mt-1';

function Field({ label, value, onChange, placeholder, hint, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children || (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
      )}
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  );
}

export default function AdminPanel() {
  const [tab, setTab] = useState('report');
  const [existing, setExisting] = useState({ reports: [], access: [] });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Report form
  const [r, setR] = useState({ name: '', link: '', tag: '', owner: '', slackNotify: false, slackMetrics: 'ALL', slackFormat: '', slackGroup: '', goals: '' });

  // Access form
  const [a, setA] = useState({ email: '', allowedSources: 'ALL', allowedTags: 'ALL', allowedDashboards: '' });

  function setRf(k) { return (v) => setR((prev) => ({ ...prev, [k]: v })); }
  function setAf(k) { return (v) => setA((prev) => ({ ...prev, [k]: v })); }

  async function load() {
    try {
      const res = await fetch('/api/admin');
      if (res.ok) setExisting(await res.json());
    } catch {}
  }
  useEffect(() => { load(); }, []);

  async function submit(kind) {
    setBusy(true);
    setStatus('');
    const body = kind === 'report'
      ? { kind, name: r.name, link: r.link, tag: r.tag, owner: r.owner }
      : { kind, email: a.email, allowedSources: a.allowedSources, allowedTags: a.allowedTags, allowedDashboards: a.allowedDashboards };
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setStatus('✓ Saved to Sheet');
      if (kind === 'report') setR({ name: '', link: '', tag: '', owner: '', slackNotify: false, slackMetrics: 'ALL', slackFormat: '', slackGroup: '', goals: '' });
      else setA({ email: '', allowedSources: 'ALL', allowedTags: 'ALL', allowedDashboards: '' });
      load();
    } catch (err) {
      setStatus('✕ ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function runSync() {
    setSyncBusy(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/admin/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSyncResult(data);
    } catch (err) {
      setSyncResult({ error: err.message });
    } finally {
      setSyncBusy(false);
    }
  }

  const tabs = [['report', 'Add dashboard'], ['access', 'Grant access'], ['sync', 'Data sync']];

  return (
    <div>
      <div className="flex gap-0 mb-6 border-b border-border">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setTab(key); setStatus(''); }}
            className={`text-[12px] px-5 py-2.5 border-b-2 font-display font-medium transition ${
              tab === key ? 'border-gold text-text' : 'border-transparent text-dim hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {status && (
        <div className={`mb-4 text-xs font-mono rounded-md px-3 py-2 border ${
          status.startsWith('✓') ? 'text-up border-up/30 bg-up/10' : 'text-down border-down/30 bg-down/10'
        }`}>
          {status}
        </div>
      )}

      {tab === 'report' && (
        <div className="space-y-5">
          {/* Required */}
          <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
            <div className="text-[10px] text-gold uppercase tracking-widest font-display font-medium">Required</div>
            <Field label="Dashboard name *" value={r.name} onChange={setRf('name')} placeholder="OOO day by day revenue" />
            <Field label="Mixpanel link *" value={r.link} onChange={setRf('link')} placeholder="https://mixpanel.com/project/..." />
          </div>

          {/* Optional metadata */}
          <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
            <div className="text-[10px] text-dim uppercase tracking-widest font-display font-medium">Metadata</div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tag" value={r.tag} onChange={setRf('tag')} {...FIELD_HINTS.tag} />
              <Field label="Owner" value={r.owner} onChange={setRf('owner')} {...FIELD_HINTS.owner} />
            </div>
          </div>

          {/* Slack settings */}
          <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-dim uppercase tracking-widest font-display font-medium">Slack notifications</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setRf('slackNotify')(!r.slackNotify)}
                  className={`w-8 h-4 rounded-full transition relative cursor-pointer ${r.slackNotify ? 'bg-gold' : 'bg-border'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-bg transition-all ${r.slackNotify ? 'left-4' : 'left-0.5'}`} />
                </div>
                <span className="text-xs text-dim">{r.slackNotify ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>

            {r.slackNotify && (
              <div className="space-y-4 pt-2 border-t border-border">
                <Field label="Slack metrics" value={r.slackMetrics} onChange={setRf('slackMetrics')} {...FIELD_HINTS.slackMetrics} />
                <Field label="Slack format" value={r.slackFormat} onChange={setRf('slackFormat')} {...FIELD_HINTS.slackFormat}>
                  <select value={r.slackFormat} onChange={(e) => setRf('slackFormat')(e.target.value)} className={inputCls}>
                    <option value="">Normal (today vs 7d + 30d avg)</option>
                    <option value="ab">A/B test (Variant A vs B side by side)</option>
                    <option value="group_row">Grouped table — vs 7d avg</option>
                    <option value="group_30d">Grouped table — vs 30d avg</option>
                  </select>
                </Field>
                {(r.slackFormat === 'group_row' || r.slackFormat === 'group_30d') && (
                  <Field label="Slack group" value={r.slackGroup} onChange={setRf('slackGroup')} {...FIELD_HINTS.slackGroup} />
                )}
                <Field label="Goals (optional)" value={r.goals} onChange={setRf('goals')} {...FIELD_HINTS.goals} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => submit('report')}
              disabled={busy || !r.name || !r.link}
              className="bg-gold text-bg font-display font-medium text-sm px-5 py-2 rounded-md hover:opacity-90 transition disabled:opacity-40"
            >
              {busy ? 'Saving...' : 'Add dashboard'}
            </button>
            <p className="text-[11px] text-dim">Writes directly to Reports sheet — visible on home page within 1 minute.</p>
          </div>

          {/* Note: Slack columns (G-K) must be filled manually in Sheet after adding */}
          {r.slackNotify && (
            <div className="text-[11px] text-gold/70 border border-gold/20 bg-gold/5 rounded-md px-3 py-2">
              Note: Slack settings (columns G–K) need to be manually filled in the Sheet after the row is added.
              The "Add dashboard" button only writes columns A–F.
            </div>
          )}

          {existing.reports.length > 0 && (
            <div className="bg-surface border border-border rounded-lg p-4">
              <div className={labelCls + ' mb-2'}>Existing ({existing.reports.length})</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {existing.reports.map((rep) => (
                  <div key={rep.row} className="text-[11px] font-mono flex justify-between text-dim">
                    <span className="truncate">{rep.name}</span>
                    <span className="text-gold shrink-0 ml-2">{rep.tag || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'access' && (
        <div className="space-y-5">
          <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
            <Field label="Email *" value={a.email} onChange={setAf('email')} placeholder="teammate@faithapp.in" />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Allowed tags</label>
                <input value={a.allowedTags} onChange={(e) => setAf('allowedTags')(e.target.value)} placeholder="ALL" className={inputCls} />
                <p className={hintCls}>ALL = access to all tag groups. Or: Marketing,Product</p>
              </div>
              <div>
                <label className={labelCls}>Allowed sources</label>
                <input value={a.allowedSources} onChange={(e) => setAf('allowedSources')(e.target.value)} placeholder="ALL" className={inputCls} />
                <p className={hintCls}>ALL = sees all Mixpanel sources. Or: GE_Meta,notification</p>
              </div>
            </div>

            <div>
              <label className={labelCls}>Specific dashboards (optional)</label>
              <input value={a.allowedDashboards} onChange={(e) => setAf('allowedDashboards')(e.target.value)} placeholder="OOO day by day revenue" className={inputCls} />
              <p className={hintCls}>Grant access to specific dashboards regardless of tag. Comma-separated exact names.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => submit('access')}
              disabled={busy || !a.email}
              className="bg-gold text-bg font-display font-medium text-sm px-5 py-2 rounded-md hover:opacity-90 transition disabled:opacity-40"
            >
              {busy ? 'Saving...' : 'Grant access'}
            </button>
            <p className="text-[11px] text-dim">Adds a row to the Access sheet. Same email twice = first row wins.</p>
          </div>

          {existing.access.length > 0 && (
            <div className="bg-surface border border-border rounded-lg p-4">
              <div className={labelCls + ' mb-2'}>Existing ({existing.access.length})</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {existing.access.map((acc, i) => (
                  <div key={i} className="text-[11px] font-mono flex justify-between text-dim">
                    <span className="truncate">{acc.email}</span>
                    <span className="text-gold shrink-0 ml-2">{acc.allowedTags}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'sync' && (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-lg p-5">
            <p className="text-xs text-dim mb-4">
              Dashboards read from Sheet tabs (<span className="font-mono text-gold">Sync_2</span>, <span className="font-mono text-gold">Sync_3</span>…) that refresh automatically via cron-job.org every 15 minutes.
              Use "Sync now" after adding a new dashboard, or to force a refresh.
            </p>
            <button
              onClick={runSync}
              disabled={syncBusy}
              className="bg-gold text-bg font-display font-medium text-sm px-5 py-2 rounded-md hover:opacity-90 transition disabled:opacity-40"
            >
              {syncBusy ? 'Syncing... (up to 60s)' : 'Sync now'}
            </button>
          </div>

          {syncResult && (
            <div className="bg-surface border border-border rounded-lg p-4">
              {syncResult.error ? (
                <div className="text-xs font-mono text-down">{syncResult.error}</div>
              ) : (
                <>
                  <div className="text-xs text-up font-mono mb-3">
                    ✓ {syncResult.totalRows?.toLocaleString()} data points synced at {new Date(syncResult.syncedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                  <div className="space-y-1.5">
                    {syncResult.results?.map((rep, i) => (
                      <div key={i} className="flex justify-between text-[11px] font-mono">
                        <span className="text-dim truncate">{rep.report}</span>
                        <span className={rep.status === 'ok' ? 'text-up' : rep.status === 'rate_limited' ? 'text-gold' : 'text-down'}>
                          {rep.status === 'ok' ? `${rep.points?.toLocaleString()} pts` : rep.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
