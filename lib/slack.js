// Slack notification helpers — SoulSensei Analytics
// Features: source-level anomaly, week-over-week trend, goal tracking, A/B, grouped tables

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  if (n !== 0 && Math.abs(n) < 1) return (n * 100).toFixed(1) + '%';
  return Math.round(n).toLocaleString('en-IN');
}

function pctDiff(current, baseline) {
  if (!baseline || baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

function pctLabel(pct) {
  if (pct == null) return '—';
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`;
}

function emoji(pct) {
  if (pct == null) return '➖';
  if (pct >= 20) return '🚀';
  if (pct >= 5) return '📈';
  if (pct <= -20) return '🔴';
  if (pct <= -5) return '📉';
  return '➖';
}

// ── Post to Slack ────────────────────────────────────────────────────────────

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

// ── Metric filter ────────────────────────────────────────────────────────────

function filterMetrics(matrices, slackMetrics) {
  const keys = Object.keys(matrices);
  if (!slackMetrics || slackMetrics.toUpperCase() === 'ALL') return keys;
  const filters = slackMetrics.split(',').map((s) => s.trim().toLowerCase());
  return keys.filter((k) => filters.some((f) => k.toLowerCase().includes(f)));
}

// ── Compute stats ─────────────────────────────────────────────────────────────
// Returns per-metric: today, avg7d, avg30d, bySource, sourceBaselines,
//   weekTrend (last 7 days pct vs their own 7d baseline), goal (if set)

export function computeStats(matrices, todayIso, slackMetrics = 'ALL', goals = {}) {
  const allowedKeys = filterMetrics(matrices, slackMetrics);
  const stats = {};

  allowedKeys.forEach((metricKey) => {
    const m = matrices[metricKey];
    const label = metricKey
      .replace(/^[A-Z]\.\s*/, '')
      .replace(/\s+(of|on)\s+\S+$/i, '')
      .trim();

    function totalForDate(date) {
      return m.sources.reduce((sum, s) => sum + (m.data[s]?.[date] || 0), 0);
    }

    const sortedDates = [...m.dates].sort();
    const pastDates = sortedDates.filter((d) => d < todayIso);
    const last7 = pastDates.slice(-7);
    const last30 = pastDates.slice(-30);
    const last14 = pastDates.slice(-14);

    const avg7d = last7.length
      ? last7.map(totalForDate).reduce((a, b) => a + b, 0) / last7.length : null;
    const avg30d = last30.length
      ? last30.map(totalForDate).reduce((a, b) => a + b, 0) / last30.length : null;

    const today = totalForDate(todayIso);

    // Week-over-week: each of last 7 days vs its own baseline (prev 7 days before it)
    const weekTrend = last7.map((date, i) => {
      const dayVal = totalForDate(date);
      const prevWindow = sortedDates.slice(
        Math.max(0, sortedDates.indexOf(date) - 7),
        sortedDates.indexOf(date)
      );
      const baseline = prevWindow.length
        ? prevWindow.map(totalForDate).reduce((a, b) => a + b, 0) / prevWindow.length : null;
      return { date, value: dayVal, pct: pctDiff(dayVal, baseline) };
    });

    // Per-source: today + 7d baseline for anomaly detection
    const bySource = {};
    const sourceBaselines = {};
    m.sources.forEach((s) => {
      const todayVal = m.data[s]?.[todayIso] || 0;
      if (todayVal > 0) bySource[s] = todayVal;
      const srcLast7 = last7.map((d) => m.data[s]?.[d] || 0);
      sourceBaselines[s] = srcLast7.length
        ? srcLast7.reduce((a, b) => a + b, 0) / srcLast7.length : null;
    });

    // Goal (from Sheet Column K if set)
    const goal = goals[metricKey] || goals[label] || null;

    stats[metricKey] = { label, today, avg7d, avg30d, bySource, sourceBaselines, weekTrend, goal };
  });

  return stats;
}

// ── 4-hour snapshot ──────────────────────────────────────────────────────────

export function buildSnapshotBlocks(dashboardName, stats, todayIso) {
  const now = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  const metricLines = Object.values(stats).map((s) => {
    const d7 = pctDiff(s.today, s.avg7d);
    const goalStr = s.goal
      ? ` (${((s.today / s.goal) * 100).toFixed(0)}% of goal ${fmtNum(s.goal)})`
      : '';
    return `${emoji(d7)} *${s.label}:* ${fmtNum(s.today)}${goalStr}  ${pctLabel(d7)} vs 7d avg`;
  });

  return [
    { type: 'header', text: { type: 'plain_text', text: `📊 ${dashboardName} · ${now} IST`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: metricLines.join('\n') || '_No data_' } },
    { type: 'divider' },
  ];
}

// ── End-of-day full summary ──────────────────────────────────────────────────

export function buildSummaryBlocks(dashboardName, stats, todayIso) {
  const dateLabel = new Date(todayIso + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const metricBlocks = Object.values(stats).map((s) => {
    const d7 = pctDiff(s.today, s.avg7d);
    const d30 = pctDiff(s.today, s.avg30d);

    // Goal progress
    const goalLine = s.goal
      ? `Goal: *${fmtNum(s.today)}* / ${fmtNum(s.goal)} (${((s.today / s.goal) * 100).toFixed(0)}%)`
      : '';

    // Week-over-week trend strip (last 7 days)
    const trendStrip = s.weekTrend.length
      ? s.weekTrend.map((t) => {
          const day = DAYS[new Date(t.date + 'T00:00:00').getDay()];
          const arrow = t.pct == null ? '·' : t.pct >= 5 ? '▲' : t.pct <= -5 ? '▼' : '–';
          return `${day}${arrow}`;
        }).join('  ')
      : '';

    // Source breakdown with per-source anomaly flags
    const sourceEntries = Object.entries(s.bySource)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    let sourceLines = '';
    if (sourceEntries.length > 1) {
      const lines = sourceEntries.map(([src, val]) => {
        const baseline = s.sourceBaselines?.[src];
        const srcDelta = pctDiff(val, baseline);
        const isAnomaly = srcDelta != null && Math.abs(srcDelta) >= 25;
        return `  └─ *${src}*: ${fmtNum(val)}${srcDelta != null ? `  ${pctLabel(srcDelta)}` : ''}${isAnomaly ? '  ⚠️' : ''}`;
      });
      // Sort: anomalous sources first
      const sorted = [
        ...lines.filter((l) => l.includes('⚠️')),
        ...lines.filter((l) => !l.includes('⚠️')),
      ];
      sourceLines = '\n' + sorted.join('\n');
    }

    // Overall anomaly flag
    const overallAnomaly = d7 != null && Math.abs(d7) >= 20
      ? `⚠️ *Unusual:* ${Math.abs(d7).toFixed(0)}% ${d7 > 0 ? 'above' : 'below'} 7-day average`
      : '';

    const lines = [
      `*${s.label}*  ${emoji(d7)}`,
      `Today: *${fmtNum(s.today)}*`,
      goalLine,
      `vs 7-day avg (${fmtNum(s.avg7d)}):   *${pctLabel(d7)}*`,
      `vs 30-day avg (${fmtNum(s.avg30d)}):  *${pctLabel(d30)}*`,
      trendStrip ? `Trend (7d): \`${trendStrip}\`` : '',
      overallAnomaly,
      sourceLines,
    ].filter(Boolean).join('\n');

    return { type: 'section', text: { type: 'mrkdwn', text: lines } };
  });

  return [
    { type: 'header', text: { type: 'plain_text', text: `🌙 ${dashboardName} · End of Day`, emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: dateLabel }] },
    { type: 'divider' },
    ...metricBlocks,
    { type: 'divider' },
    { type: 'context', elements: [{ type: 'mrkdwn', text: '_SoulSensei Analytics · Auto-generated_' }] },
  ];
}

// ── Grouped table (PDP Rails / Slots) ────────────────────────────────────────

export function buildGroupTableBlocks(groupTitle, reportsData, comparisonKey = '7d') {
  if (!reportsData.length) return [];
  const metricLabels = Object.values(reportsData[0].stats).map((s) => s.label);

  function pad(str, w) {
    const s = String(str).slice(0, w);
    return s + ' '.repeat(Math.max(0, w - s.length));
  }

  const colW = 9;
  const segW = 14;
  const headerRow = pad('Segment', segW) + metricLabels.map((l) => pad(l.slice(0, colW), colW + 1)).join('');

  const dataRows = reportsData.map(({ segmentName, stats }) => {
    const cells = Object.values(stats).map((s) => {
      const baseline = comparisonKey === '30d' ? s.avg30d : s.avg7d;
      const d = pctDiff(s.today, baseline);
      const todayFmt = fmtNum(s.today);
      const arr = d == null ? '' : d >= 0 ? ' ▲' : ' ▼';
      return pad(todayFmt + arr, colW + 1);
    });
    return pad(segmentName.slice(0, segW), segW) + cells.join('');
  });

  const cmpLabel = comparisonKey === '30d' ? 'vs 30-day avg' : 'vs 7-day avg';
  const tableText = '```\n' + [headerRow, ...dataRows].join('\n') + '\n```';

  return [
    { type: 'header', text: { type: 'plain_text', text: `📊 ${groupTitle} · ${cmpLabel}`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: tableText } },
    { type: 'divider' },
  ];
}
