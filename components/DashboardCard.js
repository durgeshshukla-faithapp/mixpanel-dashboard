import Link from 'next/link';
import { tagColor } from './DashboardGrid';

export default function DashboardCard({ row, name, tag }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <Link
      href={`/dashboard/${row}`}
      className="block border border-border bg-surface rounded-xl p-4 hover:border-accentDim transition"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center font-semibold text-sm">
          {initial}
        </div>
        {tag && (
          <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full border ${tagColor(tag)}`}>
            {tag}
          </span>
        )}
      </div>
      <div className="font-semibold text-sm mb-1">{name}</div>
      <div className="text-xs text-dim">Live from Mixpanel</div>
    </Link>
  );
}
