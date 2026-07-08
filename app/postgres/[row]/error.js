'use client';
import Link from 'next/link';

export default function Error({ error, reset }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <h1 className="text-lg font-semibold mb-2">This dashboard couldn&apos;t load</h1>
        <p className="text-dim text-sm mb-6">
          Database might be slow to respond right now (SSH tunnel or query timeout), or this
          report&apos;s query changed. Other dashboards are not affected.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="bg-accent text-bg font-medium text-sm px-5 py-2.5 rounded-lg hover:opacity-90 transition"
          >
            Try again
          </button>
          <Link href="/" className="text-dim text-sm hover:text-text transition">
            All dashboards
          </Link>
        </div>
        {process.env.NODE_ENV !== 'production' && (
          <p className="text-neg text-xs mt-4 break-all">{error?.message}</p>
        )}
      </div>
    </div>
  );
}
