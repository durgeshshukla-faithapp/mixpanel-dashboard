'use client';
import { useState, useMemo } from 'react';
import DashboardCard from './DashboardCard';

const TAG_COLORS = {
  marketing: 'bg-teal/10 text-teal border-teal/30',
  analytics: 'bg-warn/10 text-warn border-warn/30',
  strategy: 'bg-violet/10 text-violet border-violet/30',
  product: 'bg-blue/10 text-blue border-blue/30',
  business: 'bg-accent/10 text-accent border-accent/30',
};
const DEFAULT_TAG_COLOR = 'bg-dim/10 text-dim border-dim/30';

export function tagColor(tag) {
  return TAG_COLORS[(tag || '').toLowerCase()] || DEFAULT_TAG_COLOR;
}

export default function DashboardGrid({ reports, availableTags, hrefPrefix = '/dashboard', subtitle }) {
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState('All');

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return reports.filter((r) => {
      const matchesTag = activeTag === 'All' || r.tag === activeTag;
      const matchesQuery =
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.owner || '').toLowerCase().includes(q) ||
        (r.tag || '').toLowerCase().includes(q);
      return matchesTag && matchesQuery;
    });
  }, [reports, query, activeTag]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, owner, or tag..."
          className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm flex-1"
        />
      </div>

      {availableTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {['All', ...availableTags].map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                activeTag === tag
                  ? 'border-accentDim bg-accent/10 text-text'
                  : 'border-border bg-surface2 text-dim'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-dim text-sm">No dashboards match.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <DashboardCard key={r.row} row={r.row} name={r.name} tag={r.tag} owner={r.owner} hrefPrefix={hrefPrefix} subtitle={subtitle} />
          ))}
        </div>
      )}
    </div>
  );
}
