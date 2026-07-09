'use client';
import { useState } from 'react';

export default function DataShapeWarning({ reportName, warnings }) {
  const [copied, setCopied] = useState(false);
  if (!warnings || warnings.length === 0) return null;

  const message = [
    `Dashboard "${reportName}" has a metric with an unrecognized data shape from Mixpanel.`,
    `Please update extractMetricValue() in lib/mixpanel.js to handle it.`,
    '',
    ...warnings.map((w) =>
      `Metric: "${w.metric}"${w.note ? ' - ' + w.note : ''}\nSample raw value:\n${JSON.stringify(w.sample, null, 2)}`
    ),
  ].join('\n');

  function copy() {
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mb-4 text-xs border border-warn/30 bg-warn/10 rounded-lg px-3 py-2">
      <div className="flex justify-between items-center gap-3">
        <span className="text-warn">
          {warnings.length} metric{warnings.length > 1 ? 's' : ''} showed 0 or missing values because Mixpanel
          returned data in a format not recognized yet.
        </span>
        <button
          onClick={copy}
          className="shrink-0 px-2 py-1 rounded border border-warn/40 hover:bg-warn/10 transition"
        >
          {copied ? 'Copied ✓' : 'Copy for Claude'}
        </button>
      </div>
      <p className="text-dim mt-1">Paste the copied text directly into your chat with Claude to get it fixed.</p>
    </div>
  );
}
