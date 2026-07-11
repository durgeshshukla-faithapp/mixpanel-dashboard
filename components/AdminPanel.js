'use client';
import { useState, useEffect } from 'react';

const inputCls = 'w-full bg-surface2 border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-dim/40';
const labelCls = 'text-[10px] text-dim uppercase tracking-widest font-display font-medium mb-1 block';

export default function AdminPanel() {
  const [tab, setTab] = useState('report');
  const [existing, setExisting] = useState({ reports: [], access: [] });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  // Report form
  const [rName, setRName] = useState('');
  const [rLink, setRLink] = useState('');
  const [rTag, setRTag] = useState('');
  const [rOwner, setROwner] = useState('');

  // Access form
  const [aEmail, setAEmail] = useState('');
  const [aSources, setASources] = useState('ALL');
  const [aTags, setATags] = useState('ALL');
  const [aDashboards, setADashboards] = useState('');

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
      ? { kind, name: rName, link: rLink, tag: rTag, owner: rOwner }
      : { kind, email: aEmail, allowedSources: aSources, allowedTags: aTags, allowedDashboards: aDashboards };
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setStatus('✓ Saved to Sheet successfully');
      if (kind === 'report') { setRName(''); setRLink(''); setRTag(''); setROwner(''); }
      else { setAEmail(''); setASources('ALL'); setATags('ALL'); setADashboards(''); }
      load();
    } catch (err) {
      setStatus('✕ ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-border">
        {[['report', 'Add dashboard'], ['access', 'Grant access']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setTab(key); setStatus(''); }}
            className={`text-[12px] px-4 py-2 border-b-2 font-display font-medium transition ${
              tab === key ? 'border-gold text-text' : 'border-transparent text-dim'
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

      {tab === 'report' ? (
        <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
          <div>
            <label className={labelCls}>Dashboard name *</label>
            <input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="OOO day by day revenue" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Mixpanel link *</label>
            <input value={rLink} onChange={(e) => setRLink(e.target.value)} placeholder="https://mixpanel.com/project/..." className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Tag</label>
              <input value={rTag} onChange={(e) => setRTag(e.target.value)} placeholder="Marketing" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Owner</label>
              <input value={rOwner} onChange={(e) => setROwner(e.target.value)} placeholder="Durgesh" className={inputCls} />
            </div>
          </div>
          <button
            onClick={() => submit('report')}
            disabled={busy || !rName || !rLink}
            className="bg-gold text-bg font-display font-medium text-sm px-5 py-2 rounded-md hover:opacity-90 transition disabled:opacity-40"
          >
            {busy ? 'Saving...' : 'Add dashboard'}
          </button>
          <p className="text-[11px] text-dim">
            Yeh seedha Reports sheet mein naya row add karega — 1 minute ke andar home page pe dikhne lagega.
          </p>

          {existing.reports.length > 0 && (
            <div className="pt-4 border-t border-border">
              <div className={labelCls}>Existing ({existing.reports.length})</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {existing.reports.map((r) => (
                  <div key={r.row} className="text-[11px] font-mono text-dim flex justify-between">
                    <span className="truncate">{r.name}</span>
                    <span className="text-gold shrink-0 ml-2">{r.tag || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
          <div>
            <label className={labelCls}>Email *</label>
            <input value={aEmail} onChange={(e) => setAEmail(e.target.value)} placeholder="teammate@faithapp.in" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Allowed tags</label>
              <input value={aTags} onChange={(e) => setATags(e.target.value)} placeholder="ALL ya Marketing,Product" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Allowed sources</label>
              <input value={aSources} onChange={(e) => setASources(e.target.value)} placeholder="ALL" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Specific dashboards (optional)</label>
            <input value={aDashboards} onChange={(e) => setADashboards(e.target.value)} placeholder="OOO day by day revenue" className={inputCls} />
          </div>
          <button
            onClick={() => submit('access')}
            disabled={busy || !aEmail}
            className="bg-gold text-bg font-display font-medium text-sm px-5 py-2 rounded-md hover:opacity-90 transition disabled:opacity-40"
          >
            {busy ? 'Saving...' : 'Grant access'}
          </button>
          <p className="text-[11px] text-dim">
            Yeh Access sheet mein naya row add karega. Dhyan rahe: agar same email already sheet mein hai,
            toh duplicate ban jayega — pehla wala row hi effective rahega, duplicate ko sheet se manually hata dena.
          </p>

          {existing.access.length > 0 && (
            <div className="pt-4 border-t border-border">
              <div className={labelCls}>Existing ({existing.access.length})</div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {existing.access.map((a, i) => (
                  <div key={i} className="text-[11px] font-mono text-dim flex justify-between">
                    <span className="truncate">{a.email}</span>
                    <span className="text-gold shrink-0 ml-2">{a.allowedTags}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
