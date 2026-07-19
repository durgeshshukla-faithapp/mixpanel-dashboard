// Fetches A/B report data and builds Slack blocks
// Uses fetchMixpanelABReport which tries multiple endpoints
import { fetchMixpanelABReport } from './mixpanel.js';

export async function fetchAndBuildABBlocks(reportId, reportName) {
  const results = await fetchMixpanelABReport(reportId);
  return buildABBlocksFromResults(reportName, results);
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
