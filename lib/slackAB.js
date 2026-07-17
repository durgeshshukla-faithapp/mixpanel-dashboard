// Fetches A/B report data and builds Slack blocks
// Uses the Mixpanel bookmarks API directly (same as Get-Report MCP)
// which returns { results: { metricName: { rows: [[breakdown, value]] } } }

export async function fetchAndBuildABBlocks(reportId, reportName) {
  const authToken = process.env.MIXPANEL_AUTH_TOKEN;
  const projectId = process.env.MIXPANEL_PROJECT_ID;

  // Use the bookmarks endpoint which returns the aggregated results format
  const url = `https://mixpanel.com/api/app/workspaces/${projectId}/bookmarks/${reportId}/query`;
  
  // Try multiple endpoint formats since Mixpanel has several
  const endpoints = [
    `https://mixpanel.com/api/query/insights?project_id=${projectId}&bookmark_id=${reportId}&from_date=2026-01-01&to_date=${new Date().toISOString().slice(0,10)}&type=general&unit=month`,
  ];

  let raw = null;
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: { accept: 'application/json', authorization: `Basic ${authToken.trim()}` },
        cache: 'no-store',
      });
      if (res.ok) {
        raw = await res.json();
        break;
      }
    } catch (e) {}
  }

  if (!raw) throw new Error('Could not fetch A/B report data');

  // The series object has: series[metricName][breakdown][date] = value
  // BUT for A/B we should use $overall key which has the aggregate value directly
  const series = raw.series || {};
  const results = {};

  Object.entries(series).forEach(([metricName, byBreakdown]) => {
    const rows = [];
    Object.entries(byBreakdown).forEach(([breakdown, byDate]) => {
      // Use $overall directly if available (already aggregated)
      if ('$overall' in byDate) {
        const val = byDate['$overall'];
        const n = typeof val === 'object' ? (val.all ?? val.value ?? 0) : val;
        rows.push([breakdown, n]);
      } else {
        // Fallback: sum all dates (for non-$overall breakdowns)
        const total = Object.values(byDate).reduce((sum, v) => {
          const n = typeof v === 'object' ? (v.all || 0) : (v || 0);
          return sum + n;
        }, 0);
        rows.push([breakdown, total]);
      }
    });
    results[metricName] = { rows };
  });

  return buildABBlocksFromResults(reportName, results);
}

function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  if (n !== 0 && Math.abs(n) < 1) return (n * 100).toFixed(2) + '%';
  return Math.round(n).toLocaleString('en-IN');
}

function buildABBlocksFromResults(reportName, results) {
  if (!results || !Object.keys(results).length) return [];

  function getVariantValue(rows, variantLabel) {
    // Match "Variant A, $overall" or "Variant A" etc
    const overallRow = rows.find((r) => {
      const key = String(r[0]).toLowerCase();
      return key.includes(variantLabel.toLowerCase()) && key.includes('$overall');
    });
    if (overallRow) return Number(overallRow[1]);
    const anyRow = rows.find((r) =>
      String(r[0]).toLowerCase().includes(variantLabel.toLowerCase())
    );
    return anyRow != null ? Number(anyRow[1]) : null;
  }

  function detectVariants(rows) {
    const keys = rows.map((r) => String(r[0]).toLowerCase());
    if (keys.some((k) => k.includes('variant a'))) return ['Variant A', 'Variant B'];
    if (keys.some((k) => k === 'a')) return ['A', 'B'];
    if (keys.some((k) => k.includes('control'))) return ['Control', 'Treatment'];
    return ['A', 'B'];
  }

  const firstRows = Object.values(results)[0]?.rows || [];
  const [variantA, variantB] = detectVariants(firstRows);

  const lines = Object.entries(results).map(([metricKey, metricData]) => {
    const label = metricKey.replace(/^[A-Z]\.\s*/, '').trim();
    const rows = metricData?.rows || [];
    const aVal = getVariantValue(rows, variantA);
    const bVal = getVariantValue(rows, variantB);

    if (aVal == null && bVal == null) return `• *${label}* — no data`;

    const aFmt = `A \`${fmtNum(aVal)}\``;
    const bFmt = `B \`${fmtNum(bVal)}\``;
    const winner = (bVal != null && aVal != null && bVal > aVal)
      ? `${bFmt} vs ${aFmt}`
      : `${aFmt} vs ${bFmt}`;
    return `• *${label}* — ${winner}`;
  });

  return [
    { type: 'header', text: { type: 'plain_text', text: `🧪 ${reportName}`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') || '_No data_' } },
    { type: 'divider' },
  ];
}
