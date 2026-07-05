export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-5 py-10 animate-pulse">
      <div className="h-6 w-40 bg-surface2 rounded mb-2" />
      <div className="h-3 w-64 bg-surface2 rounded mb-8" />
      <div className="h-10 bg-surface2 rounded-lg mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border border-border bg-surface rounded-xl p-4 h-24">
            <div className="w-7 h-7 rounded-lg bg-surface2 mb-3" />
            <div className="h-3 w-3/4 bg-surface2 rounded mb-2" />
            <div className="h-3 w-1/2 bg-surface2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
