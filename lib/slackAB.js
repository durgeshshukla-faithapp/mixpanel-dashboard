// Fetches A/B report data and builds Slack blocks
// Uses fetchMixpanelABReport which tries multiple endpoints
import { fetchMixpanelABReport } from './mixpanel.js';

// A conversion rate of exactly 1.0 means 100%, not a count of one. Funnel step
// names read "X to Y" (or mention CR/rate), which is how we tell them apart.
function looksLikeRate(label) {
  return /\bto\b|\bCR\b|conversion|rate|%/i.test(String(label || ''));
}

function fmtNum(n, label) {
  if (n == null || isNaN(Number(n))) return '—';
  const num = Number(n);
  if (looksLikeRate(label) && Math.abs(num) <= 1) return (num * 100).toFixed(2) + '%';
  if (num !== 0 && Math.abs(num) < 1) return (num * 100).toFixed(2) + '%';
  if (Number.isInteger(num)) return num.toLocaleString('en-IN');
  return parseFloat(num.toFixed(2)).toLocaleString('en-IN');
}

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

    // If either variant is a fraction between 0 and 1, this metric is a rate,
    // so a value of exactly 1 on the other variant means 100% — not a count of
    // one. The metric name alone is not a reliable signal here ("LOGIN" is a
    // conversion step but reads like a count).
    const siblingIsFraction = [aVal, bVal].some(
      (v) => v != null && v > 0 && v < 1
    );
    const isRate = siblingIsFraction || looksLikeRate(label);

    const aFmt = `A \`${fmtNum(aVal, isRate ? 'rate' : label)}\``;
    const bFmt = `B \`${fmtNum(bVal, isRate ? 'rate' : label)}\``;
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
