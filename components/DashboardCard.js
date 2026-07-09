'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { tagColor } from './DashboardGrid';

const OWNER_COLORS = ['#3DDC97', '#5B9FE8', '#F0A868', '#C58FE0', '#F0685C', '#4FD1D9'];
function ownerColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return OWNER_COLORS[Math.abs(hash) % OWNER_COLORS.length];
}

export default function DashboardCard({ row, name, tag, owner, hrefPrefix = '/dashboard', subtitle = 'Live from Mixpanel' }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initial = (name || '?').charAt(0).toUpperCase();

  function handleClick(e) {
    e.preventDefault();
    startTransition(() => router.push(`${hrefPrefix}/${row}`));
  }

  return (
    <a
      href={`${hrefPrefix}/${row}`}
      onClick={handleClick}
      className="relative flex flex-col justify-between border border-border bg-surface rounded-xl p-4 hover:border-accentDim transition cursor-pointer min-h-[140px]"
    >
      {isPending && (
        <div className="absolute inset-0 bg-surface/80 rounded-xl flex items-center justify-center backdrop-blur-[1px]">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div>
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
        <div className="text-xs text-dim">{subtitle}</div>
      </div>
      {owner && (
        <div className="flex items-center gap-2 mt-3">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold text-bg"
            style={{ background: ownerColor(owner) }}
          >
            {owner.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs text-dim">{owner}</span>
        </div>
      )}
    </a>
  );
}
