'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { tagColor } from './tagColors';

// Owner avatar colors — same palette as tags but distinct set
const OWNER_COLORS = [
  '#D4A574', '#5EA870', '#6A9BB5', '#B37FB0',
  '#C77373', '#5CA9A5', '#D4886B', '#9C7BB0',
];

function ownerColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return OWNER_COLORS[Math.abs(h) % OWNER_COLORS.length];
}

export default function DashboardCard({ row, name, tag, owner, hrefPrefix = '/dashboard', subtitle = 'Live from Mixpanel' }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick(e) {
    e.preventDefault();
    startTransition(() => router.push(`${hrefPrefix}/${row}`));
  }

  const initial = (name || '?').charAt(0).toUpperCase();

  return (
    <a
      href={`${hrefPrefix}/${row}`}
      onClick={handleClick}
      className="relative group flex flex-col justify-between bg-surface border border-border rounded-lg p-4 hover:border-gold/30 transition-all duration-150 cursor-pointer min-h-[130px] overflow-hidden"
    >
      {/* Subtle gold glow on hover */}
      <div
        className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(201,169,110,0.15)' }}
      />

      {isPending && (
        <div className="absolute inset-0 bg-surface/80 rounded-lg flex items-center justify-center backdrop-blur-[1px] z-10">
          <div className="w-4 h-4 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div>
        <div className="flex items-start justify-between mb-2.5 gap-2">
          <div className="w-7 h-7 rounded-md bg-gold/10 text-gold flex items-center justify-center font-display font-semibold text-sm shrink-0">
            {initial}
          </div>
          {tag && (
            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-display font-medium whitespace-nowrap ${tagColor(tag)}`}>
              {tag}
            </span>
          )}
        </div>
        <div className="font-display font-semibold text-sm leading-snug text-text">{name}</div>
      </div>

      {owner && (
        <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border">
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-display font-bold"
            style={{ background: ownerColor(owner) + '30', color: ownerColor(owner) }}
          >
            {owner.charAt(0).toUpperCase()}
          </div>
          <span className="text-[11px] text-dim">{owner}</span>
        </div>
      )}
    </a>
  );
}
