'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { tagColor } from './tagColors';

export default function DashboardCard({ row, name, tag, owner, hrefPrefix = '/dashboard', subtitle = 'Live from Mixpanel' }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick(e) {
    e.preventDefault();
    startTransition(() => router.push(`${hrefPrefix}/${row}`));
  }

  return (
    <a
      href={`${hrefPrefix}/${row}`}
      onClick={handleClick}
      className="relative flex flex-col justify-between bg-surface border border-border rounded-md p-4 hover:border-gold/50 transition cursor-pointer min-h-[130px]"
    >
      {isPending && (
        <div className="absolute inset-0 bg-surface/80 rounded-md flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div>
        <div className="flex items-start justify-between mb-2.5">
          <div className="font-display text-sm font-semibold tracking-tight">{name}</div>
          {tag && (
            <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded font-display font-medium ${tagColor(tag)}`}>
              {tag}
            </span>
          )}
        </div>
        <div className="text-[11px] text-dim font-mono">{subtitle}</div>
      </div>
      {owner && (
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border">
          <div className="w-4 h-4 rounded-full bg-gold/20 flex items-center justify-center text-[9px] font-display font-semibold text-gold">
            {owner.charAt(0).toUpperCase()}
          </div>
          <span className="text-[11px] text-dim">{owner}</span>
        </div>
      )}
    </a>
  );
}
