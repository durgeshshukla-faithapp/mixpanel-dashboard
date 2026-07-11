'use client';
import { useState, useMemo } from 'react';
import DashboardCard from './DashboardCard';

const TAG_COLORS = {
  marketing: 'bg-gold/10 text-gold border border-gold/20',
  analytics: 'bg-up/10 text-up border border-up/20',
  strategy: 'bg-down/10 text-down border border-down/20',
  product: 'bg-dim/10 text-dim border border-dim/20',
  business: 'bg-gold/10 text-gold border border-gold/20',
};
const DEFAULT_TAG_COLOR = 'bg-dim/10 text-dim border border-dim/20';

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
      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, owner, or tag..."
          className="w-full bg-surface2 border border-border rounded-md px-3 py-2 text-sm font-mono placeholder:text-dim/50"
        />
      </div>

      {availableTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {['All', ...availableTags].map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`text-[11px] px-3 py-1 rounded font-display font-medium tracking-wide transition ${
                activeTag === tag
                  ? 'bg-gold/15 text-gold border border-gold/30'
                  : 'bg-surface2 text-dim border border-border hover:border-dim'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-dim text-sm py-8 text-center">No dashboards match.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {filtered.map((r) => (
            <DashboardCard key={r.row} row={r.row} name={r.name} tag={r.tag} owner={r.owner} hrefPrefix={hrefPrefix} subtitle={subtitle} />
          ))}
        </div>
      )}
    </div>
  );
}
