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

// ── Funnel Summary format ─────────────────────────────────────────────────────
// For reports with single value per metric (no dates, no breakdown).
// Shows: values, worst-performing step, and day-over-day drops if baseline given.
export function buildFunnelSummaryBlocks(reportName, rawResults, baseline = null) {
  if (!rawResults) return [];

  function extractValue(metricData) {
    if (metricData?.rows?.[0]?.[0] != null) return Number(metricData.rows[0][0]);
    if (typeof metricData === 'object') {
      const vals = Object.values(metricData);
      if (vals.length === 1) {
        const v = vals[0];
        return typeof v === 'object' ? (v.all ?? v.value ?? 0) : Number(v);
      }
    }
    return null;
  }

  function fmt(v) {
    if (v == null) return '—';
    if (v !== 0 && Math.abs(v) < 1) return (v * 100).toFixed(1) + '%';
    return Math.round(v).toLocaleString('en-IN');
  }

  // Extract all steps (skip absolute counts like "Uniques", "Total Conversions"
  // for worst-step detection — only conversion rates matter for that)
  const steps = Object.entries(rawResults).map(([key, data]) => {
    const label = key.replace(/^[A-Z]\.\s*/, '').trim();
    const value = extractValue(data);
    const isConversionRate = value != null && value !== 0 && Math.abs(value) < 1;
    return { key, label, value, isConversionRate };
  });

  // Find worst-performing conversion step (lowest rate)
  const conversionSteps = steps.filter((s) => s.isConversionRate);
  const worstStep = conversionSteps.length
    ? conversionSteps.reduce((worst, s) => s.value < worst.value ? s : worst)
    : null;

  // Detect drops vs baseline
  const drops = [];
  if (baseline?.values) {
    steps.forEach((s) => {
      const prev = baseline.values[s.key];
      if (prev == null || s.value == null || prev === 0) return;
      const pctChange = ((s.value - prev) / prev) * 100;
      // Only flag drops of 10%+ on conversion rates or 15%+ on absolute counts
      const threshold = s.isConversionRate ? 10 : 15;
      if (pctChange <= -threshold) {
        drops.push({ label: s.label, value: s.value, prev, pctChange });
      }
    });
  }

  // Build main lines
  const lines = steps.map((s) => {
    const padded = s.label.length > 28 ? s.label.slice(0, 27) + '…' : s.label.padEnd(28, ' ');
    return `\`${padded}\` *${fmt(s.value)}*`;
  });

  const now = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📊 ${reportName} · ${now}`, emoji: true },
    },
  ];

  // Worst step highlight
  if (worstStep) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `⚠️ *Weakest step:* ${worstStep.label} (${fmt(worstStep.value)})` },
    });
  }

  // Drop alerts
  if (drops.length > 0) {
    const dropLines = drops
      .sort((a, b) => a.pctChange - b.pctChange) // biggest drops first
      .map((d) => `🔴 *${d.label}:* ${fmt(d.value)} (was ${fmt(d.prev)}) ▼ ${Math.abs(d.pctChange).toFixed(0)}%`);
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Drops vs ${baseline.date}:*\n${dropLines.join('\n')}` },
    });
  }

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: lines.join('\n') || '_No data_' },
  });

  blocks.push({ type: 'divider' });
  return blocks;
}

// ── Funnel side-by-side comparison ───────────────────────────────────────────
// Takes multiple funnel reports and puts them in one table.
// funnelsData: [{ name, results }, ...]
export function buildFunnelComparisonBlocks(groupTitle, funnelsData) {
  if (!funnelsData.length) return [];

  function extractValue(metricData) {
    if (metricData?.rows?.[0]?.[0] != null) return Number(metricData.rows[0][0]);
    return null;
  }
  function fmt(v) {
    if (v == null) return '—';
    if (v !== 0 && Math.abs(v) < 1) return (v * 100).toFixed(1) + '%';
    return Math.round(v).toLocaleString('en-IN');
  }
  function pad(str, w) {
    const s = String(str).slice(0, w);
    return s + ' '.repeat(Math.max(0, w - s.length));
  }
  function stripPrefix(key) {
    return key.replace(/^[A-Z]\.\s*/, '').trim();
  }

  // Build a merged row list:
  // For each funnel, map stripped label → value.
  // Merged row order = union of all stripped labels in order of first appearance.
  const rowOrder = []; // stripped labels in order
  const rowSeen = new Set();

  // Also track if any stripped label appears with DIFFERENT prefixes across funnels
  // (e.g. "SLOT AVAILABLE PV" vs "SLOT AVAILAVLE PV" — typo) — keep both as separate rows
  const funnelMaps = funnelsData.map((f) => {
    const map = {}; // strippedLabel → value
    Object.entries(f.results).forEach(([key, data]) => {
      const stripped = stripPrefix(key);
      // Normalise minor typos: "AVAILAVLE" → "AVAILABLE"
      const normalised = stripped.replace(/AVAILAVLE/g, 'AVAILABLE');
      if (!rowSeen.has(normalised)) {
        rowSeen.add(normalised);
        rowOrder.push(normalised);
      }
      map[normalised] = extractValue(data);
    });
    return map;
  });

  const stepW = 24;
  const colW = 12;
  const shortNames = funnelsData.map((f) =>
    f.name.replace(/\s*FUNNEL\s*$/i, '').slice(0, colW - 1)
  );
  const headerRow = pad('Step', stepW) + shortNames.map((n) => pad(n, colW)).join('');

  const dataRows = rowOrder.map((label) => {
    const cells = funnelMaps.map((map) => pad(fmt(map[label] ?? null), colW));
    return pad(label.slice(0, stepW - 1), stepW) + cells.join('');
  });

  const tableText = '```\n' + [headerRow, ...dataRows].join('\n') + '\n```';
  const now = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
  });

  return [
    { type: 'header', text: { type: 'plain_text', text: `📊 ${groupTitle} · ${now}`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: tableText } },
    { type: 'divider' },
  ];
}
