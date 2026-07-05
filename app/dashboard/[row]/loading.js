export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-5 py-10 animate-pulse">
      <div className="h-3 w-24 bg-surface2 rounded mb-4" />
      <div className="h-6 w-64 bg-surface2 rounded mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-border bg-surface rounded-2xl p-4 h-20" />
        ))}
      </div>
      <div className="border border-border bg-surface rounded-2xl p-5 h-96" />
    </div>
  );
}
