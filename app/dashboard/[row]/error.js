'use client';
import Link from 'next/link';

export default function Error({ error, reset }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-lg">
        <h1 className="font-display text-lg font-bold mb-2">This dashboard couldn&apos;t load</h1>
        <p className="text-dim text-sm mb-4">
          Something went wrong. Error message below — copy it and share to get it fixed.
        </p>
        {error?.message && (
          <div className="text-left bg-surface border border-border rounded-md px-3 py-2 mb-4">
            <p className="text-xs font-mono text-down break-all">{error.message}</p>
            {error?.digest && (
              <p className="text-[10px] font-mono text-dim mt-1">digest: {error.digest}</p>
            )}
          </div>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="bg-gold text-bg font-display font-medium text-sm px-5 py-2 rounded-md hover:opacity-90 transition"
          >
            Try again
          </button>
          <Link href="/" className="text-dim text-sm hover:text-text transition font-display">
            All dashboards
          </Link>
        </div>
      </div>
    </div>
  );
}
