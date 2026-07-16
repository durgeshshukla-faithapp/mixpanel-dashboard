// Slack notification helpers for SoulSensei Analytics
// Sends end-of-day summaries with today vs 7-day avg and today vs 30-day avg

function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 10000000) return '₹' + (n / 10000000).toFixed(2) + 'Cr';
  if (Math.abs(n) >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K';
  if (n !== 0 && Math.abs(n) < 1) return (n * 100).toFixed(1) + '%';
  return Math.round(n).toLocaleString();
}

function pctDiff(current, baseline) {
  if (!baseline || baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

function pctLabel(pct) {
  if (pct == null) return '—';
  const sign = pct >= 0 ? '▲' : '▼';
  return `${sign} ${Math.abs(pct).toFixed(1)}%`;
}

function emoji(pct) {
  if (pct == null) return '➖';
  if (pct >= 20) return '🚀';
  if (pct >= 5) return '📈';
  if (pct <= -20) return '🔴';
  if (pct <= -5) return '📉';
  return '➖';
}

export async function postToSlack(blocks, fallbackText) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('SLACK_WEBHOOK_URL not set');
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: fallbackText, blocks }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Slack ${res.status}: ${await res.text()}`);
}

// Filters metrics based on the slackMetrics config from the Sheet
// "ALL" or blank = all metrics, otherwise comma-separated partial name matches
function filterMetrics(matrices, slackMetrics) {
  const keys = Object.keys(matrices);
  if (!slackMetrics || slackMetrics.toUpperCase() === 'ALL') return keys;
  const filters = slackMetrics.split(',').map((s) => s.trim().toLowerCase());
  return keys.filter((k) => filters.some((f) => k.toLowerCase().includes(f)));
}

// Computes today's total and baselines for each metric
export function computeStats(matrices, todayIso, slackMetrics = 'ALL') {
  const allowedKeys = filterMetrics(matrices, slackMetrics);
  const stats = {};

  allowedKeys.forEach((metricKey) => {
    const m = matrices[metricKey];
    // Short readable label — strip leading "A. " prefix and trailing "of event_name"
    const label = metricKey
      .replace(/^[A-Z]\.\s*/, '')
      .replace(/\s+(of|on)\s+\S+$/i, '')
      .trim();

    function totalForDate(date) {
      return m.sources.reduce((sum, s) => sum + (m.data[s]?.[date] || 0), 0);
    }

    const sortedDates = [...m.dates].sort();
    // Use dates strictly before today as the baseline window
    const pastDates = sortedDates.filter((d) => d < todayIso);

    const last7 = pastDates.slice(-7);
    const last30 = pastDates.slice(-30);

    const avg7d = last7.length
      ? last7.map(totalForDate).reduce((a, b) => a + b, 0) / last7.length
      : null;
    const avg30d = last30.length
      ? last30.map(totalForDate).reduce((a, b) => a + b, 0) / last30.length
      : null;

    const today = totalForDate(todayIso);

    // Top 3 sources for today
    const bySource = {};
    m.sources.forEach((s) => {
      const v = m.data[s]?.[todayIso] || 0;
      if (v > 0) bySource[s] = v;
    });

    stats[metricKey] = { label, today, avg7d, avg30d, bySource };
  });

  return stats;
}

// ── 4-hour snapshot: quick running totals ──────────────────────────────────
export function buildSnapshotBlocks(dashboardName, stats, todayIso) {
  const now = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  const metricLines = Object.values(stats).map((s) => {
    const d7 = pctDiff(s.today, s.avg7d);
    return `${emoji(d7)} *${s.label}:* ${fmtNum(s.today)}  ${pctLabel(d7)} vs 7d avg`;
  });

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📊 ${dashboardName} · ${now} IST`, emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: metricLines.length ? metricLines.join('\n') : '_No data for today yet_',
      },
    },
    { type: 'divider' },
  ];
}

// ── End-of-day: full comparison vs 7d avg + 30d avg ───────────────────────
export function buildSummaryBlocks(dashboardName, stats, todayIso) {
  const dateLabel = new Date(todayIso + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const metricBlocks = Object.values(stats).map((s) => {
    const d7 = pctDiff(s.today, s.avg7d);
    const d30 = pctDiff(s.today, s.avg30d);

    // Top sources line
    const topSources = Object.entries(s.bySource)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([src, val]) => `*${src}* ${fmtNum(val)}`)
      .join('  ·  ');

    // Anomaly flag
    const anomaly = d7 != null && Math.abs(d7) >= 20
      ? `\n⚠️ *Unusual:* ${Math.abs(d7).toFixed(0)}% ${d7 > 0 ? 'above' : 'below'} 7-day average`
      : '';

    const lines = [
      `*${s.label}*  ${emoji(d7)}`,
      `Today: *${fmtNum(s.today)}*`,
      `vs 7-day avg (${fmtNum(s.avg7d)}):   *${pctLabel(d7)}*`,
      `vs 30-day avg (${fmtNum(s.avg30d)}):  *${pctLabel(d30)}*`,
      topSources ? `Top: ${topSources}` : '',
      anomaly,
    ].filter(Boolean).join('\n');

    return {
      type: 'section',
      text: { type: 'mrkdwn', text: lines },
    };
  });

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🌙 ${dashboardName} · End of Day`,
        emoji: true,
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: dateLabel }],
    },
    { type: 'divider' },
    ...metricBlocks,
    { type: 'divider' },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '_SoulSensei Analytics · Auto-generated_' }],
    },
  ];
}

// ── A/B Test format ────────────────────────────────────────────────────────
// Handles breakdown patterns: "A"/"B", "Variant A"/"Variant B",
// "Control"/"Treatment", etc. Uses $overall rows for each variant.
export function buildABBlocks(reportName, rawResults) {
  if (!rawResults) return [];

  function fmt(v) {
    if (v == null || v === '' || isNaN(Number(v))) return '—';
    const n = Number(v);
    if (n !== 0 && Math.abs(n) < 1) return (n * 100).toFixed(2) + '%';
    return fmtNum(n);
  }

  // Extract variant value: prefer "$overall" rows, then first match
  function getVariantValue(rows, variantPattern) {
    const re = new RegExp(variantPattern, 'i');
    // Try to find row with both variant label AND $overall
    const overallRow = rows.find((r) => re.test(String(r[0])) && String(r[0]).includes('$overall'));
    if (overallRow) return Number(overallRow[1]);
    // Fallback: first row matching variant
    const anyRow = rows.find((r) => re.test(String(r[0])));
    return anyRow != null ? Number(anyRow[1]) : null;
  }

  const lines = Object.entries(rawResults).map(([metricKey, metricData]) => {
    const label = metricKey.replace(/^[A-Z]\.\s*/, '').trim();
    const rows = metricData?.rows || [];

    // Auto-detect variant names from breakdown values
    const allBreakdowns = rows.map((r) => String(r[0]));
    let aPattern = 'Variant A|\\bA\\b|Control';
    let bPattern = 'Variant B|\\bB\\b|Treatment';

    const aVal = getVariantValue(rows, aPattern);
    const bVal = getVariantValue(rows, bPattern);

    const aFmt = `A \`${fmt(aVal)}\``;
    const bFmt = `B \`${fmt(bVal)}\``;

    // Winner first (higher is better for most metrics)
    const winner = (bVal != null && aVal != null && bVal > aVal)
      ? `${bFmt} vs ${aFmt}`
      : `${aFmt} vs ${bFmt}`;

    return `• *${label}* — ${winner}`;
  });

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🧪 ${reportName}`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n') || '_No data_' },
    },
    { type: 'divider' },
  ];
}

// ── Grouped table format (PDP Rails / Slots) ──────────────────────────────
// Multiple reports → one table. Each report = one row (segment).
// reportsData: [{ segmentName, stats }] where stats = computeStats() result
// comparisonKey: '7d' or '30d'
export function buildGroupTableBlocks(groupTitle, reportsData, comparisonKey = '7d') {
  if (!reportsData.length) return [];

  // Collect all metric labels from first report
  const metricLabels = Object.values(reportsData[0].stats).map((s) => s.label);

  // Header row
  const colWidth = 8;
  function pad(str, w) {
    const s = String(str).slice(0, w);
    return s + ' '.repeat(Math.max(0, w - s.length));
  }

  const headerRow = pad('Segment', 14) + metricLabels.map((l) => pad(l.slice(0, colWidth), colWidth + 2)).join('');

  // Data rows
  const dataRows = reportsData.map(({ segmentName, stats }) => {
    const cells = Object.values(stats).map((s) => {
      const baseline = comparisonKey === '30d' ? s.avg30d : s.avg7d;
      const d = pctDiff(s.today, baseline);
      const todayFmt = s.today !== 0 && Math.abs(s.today) < 1
        ? (s.today * 100).toFixed(1) + '%'
        : fmtNum(s.today);
      const arr = d == null ? '' : d >= 0 ? ' ▲' : ' ▼';
      return pad(todayFmt + arr, colWidth + 2);
    });
    return pad(segmentName.slice(0, 14), 14) + cells.join('');
  });

  const tableText = '```\n' + [headerRow, ...dataRows].join('\n') + '\n```';
  const cmpLabel = comparisonKey === '30d' ? 'vs 30-day avg' : 'vs 7-day avg';

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📊 ${groupTitle} · ${cmpLabel}`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: tableText },
    },
    { type: 'divider' },
  ];
}
