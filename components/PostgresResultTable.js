'use client';
import { useState, useMemo } from 'react';

export default function PostgresResultTable({ rows }) {
  const [search, setSearch] = useState('');
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => columns.some((c) => String(r[c] ?? '').toLowerCase().includes(q)));
  }, [rows, search, columns]);

  function downloadCsv() {
    const lines = [columns.join(',')];
    filtered.forEach((r) => lines.push(columns.map((c) => JSON.stringify(r[c] ?? '')).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'query-result.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (rows.length === 0) {
    return <p className="text-dim text-sm py-10 text-center">Query returned no rows.</p>;
  }

  return (
    <div className="border border-border bg-surface rounded-2xl p-5">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search results..."
          className="bg-surface2 border border-border rounded-lg px-3 py-2 text-xs flex-1 min-w-[160px]"
        />
        <button
          onClick={downloadCsv}
          className="text-xs px-3 py-2 rounded-lg border border-border bg-surface2 hover:border-accentDim transition"
        >
          Export CSV
        </button>
        <span className="text-xs text-dim">{filtered.length} rows</span>
      </div>
      <div className="overflow-x-auto max-h-[600px]">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} className="text-left py-2 px-2 text-dim uppercase tracking-wide font-medium border-b border-border sticky top-0 bg-surface whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c} className="py-2 px-2 border-b border-border num whitespace-nowrap">
                    {String(r[c] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
