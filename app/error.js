'use client';

export default function Error({ error, reset }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <h1 className="text-lg font-semibold mb-2">Couldn&apos;t load dashboards</h1>
        <p className="text-dim text-sm mb-6">
          Something went wrong reaching Google Sheets or Mixpanel. This is usually temporary.
        </p>
        <button
          onClick={reset}
          className="bg-accent text-bg font-medium text-sm px-5 py-2.5 rounded-lg hover:opacity-90 transition"
        >
          Try again
        </button>
        {process.env.NODE_ENV !== 'production' && (
          <p className="text-neg text-xs mt-4 break-all">{error?.message}</p>
        )}
      </div>
    </div>
  );
}
