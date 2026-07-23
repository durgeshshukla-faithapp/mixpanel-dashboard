// Slack notification helpers — SoulSensei Analytics
// Features: source-level anomaly, week-over-week trend, goal tracking, A/B, grouped tables

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  if (n !== 0 && Math.abs(n) < 1) return (n * 100).toFixed(2) + '%';
  if (Number.isInteger(n)) return n.toLocaleString('en-IN');
  return parseFloat(n.toFixed(2)).toLocaleString('en-IN');
}

// Mixpanel returns conversion rates as fractions (0.978 = 97.8%). A rate of
// exactly 1.0 would otherwise print as a bare "1" and read as a count, so we
// use the metric name to tell rates and counts apart.
function looksLikeRate(label) {
  return /\bto\b|\bCR\b|conversion|rate|%/i.test(String(label || ''));
}

function fmtValue(v, label) {
  if (v == null || isNaN(v)) return '—';
  if (looksLikeRate(label) && Math.abs(v) <= 1) return (v * 100).toFixed(1) + '%';
  return fmtNum(v);
}

// Averages are quoted inside sentences. Today's number stays exact, but an
// average is rounded to something a reader can hold in their head — "around
// 8,839" rather than "8,838.86", since 0.86 of a purchase is not a real thing.
function fmtAvg(v, label) {
  if (v == null || isNaN(v)) return '—';
  if (looksLikeRate(label) && Math.abs(v) <= 1) return (v * 100).toFixed(1) + '%';
  return Math.round(v).toLocaleString('en-IN');
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
    // Keep the full descriptive name. Only the "A. " ordering prefix is dropped —
    // stripping "of <event>" made every metric read as a bare "Uniques".
    const label = metricKey.replace(/^[A-Z]\.\s*/, '').trim();

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

        // How many past days we actually have. With very little history the
    // "vs average" comparison is meaningless and we say so rather than
    // printing a confident-looking percentage.
    const historyDays = pastDates.length;

    stats[metricKey] = {
      key: metricKey, label, today, avg7d, avg30d, bySource, sourceBaselines,
      weekTrend, goal, historyDays,
    };
  });

  return stats;
}

// ── 4-hour snapshot ──────────────────────────────────────────────────────────

export function buildSnapshotBlocks(dashboardName, stats, todayIso) {
  const now = new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  });

  // Keep snapshots short — the top few numbers, in plain words
  const ordered = Object.values(stats).sort((a, b) => (b.today || 0) - (a.today || 0));
  const shown = ordered.slice(0, 5);
  const hidden = ordered.length - shown.length;

  const lines = shown.map((s) => {
    const d7 = pctDiff(s.today, s.avg7d);
    const thin = s.historyDays < 3;
    if (thin || d7 == null) {
      return `*${s.label}:* ${fmtNum(s.today)} so far today`;
    }
    const dir = d7 >= 0 ? 'above' : 'below';
    return `${emoji(d7)} *${s.label}:* ${fmtNum(s.today)} so far today — ${Math.abs(d7).toFixed(0)}% ${dir} a normal day`;
  });

  if (hidden > 0) {
    lines.push(`_+${hidden} more on the dashboard._`);
  }

  return [
    { type: 'header', text: { type: 'plain_text', text: `${dashboardName} — ${now} IST`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') || '_No activity recorded yet today._' } },
    { type: 'divider' },
  ];
}

// ── End-of-day full summary ──────────────────────────────────────────────────

export function buildSummaryBlocks(dashboardName, stats, todayIso) {
  const dateLabel = new Date(todayIso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const all = Object.values(stats);

  // The same event can appear several times in one report with different filters
  // (e.g. scroll_depth_reached at 25%, 50%, 75%). Those share a label, so when a
  // label repeats we fall back to the fuller key that still carries the "A. "
  // ordering prefix — otherwise the reader sees four identical headings.
  const labelCounts = {};
  all.forEach((s) => { labelCounts[s.label] = (labelCounts[s.label] || 0) + 1; });
  const displayName = (s) => (labelCounts[s.label] > 1 ? s.key : s.label);

  // Show at most MAX_METRICS, biggest numbers first, so the message stays readable.
  // Reports with a dozen metrics used to produce an unreadable wall of text.
  const MAX_METRICS = 6;
  const ordered = [...all].sort((a, b) => (b.today || 0) - (a.today || 0));
  const shown = ordered.slice(0, MAX_METRICS);
  const hiddenCount = ordered.length - shown.length;

  // A percentage swing on a tiny number is noise, not a signal: 1 vs an average
  // of 3 is not a "71% drop". Only call something unusual when the numbers are
  // big enough for the comparison to mean anything.
  const MIN_VALUE_FOR_ALERT = 10;
  const ALERT_THRESHOLD_PCT = 25;
  const MIN_HISTORY_DAYS = 3;

  function isMeaningful(s) {
    return s.historyDays >= MIN_HISTORY_DAYS
      && (s.today >= MIN_VALUE_FOR_ALERT || (s.avg7d || 0) >= MIN_VALUE_FOR_ALERT);
  }

  const metricBlocks = shown.map((s) => {
    const d7 = pctDiff(s.today, s.avg7d);
    const thin = s.historyDays < MIN_HISTORY_DAYS;

    const lines = [`*${displayName(s)}*`, `Today: *${fmtValue(s.today, s.label)}*`];

    if (s.goal) {
      const pct = (s.today / s.goal) * 100;
      lines.push(`Goal: ${fmtNum(s.today)} of ${fmtNum(s.goal)} — ${pct.toFixed(0)}% reached`);
    }

    if (thin) {
      // Be honest instead of printing a confident percentage off one day of data
      lines.push(s.historyDays === 0
        ? '_First day of data — there is nothing to compare against yet._'
        : `_Only ${s.historyDays} ${s.historyDays === 1 ? 'day' : 'days'} of earlier data so far — comparisons will become reliable in a few days._`);
    } else {
      const dirWord = d7 == null ? '' : d7 >= 0 ? 'higher than' : 'lower than';
      const pctWord = d7 == null ? '' : `${Math.abs(d7).toFixed(0)}% ${dirWord}`;
      if (isMeaningful(s)) {
        const flat = d7 != null && Math.abs(d7) < 3;
        lines.push(flat
          ? `${emoji(d7)} About the same as a normal day (normally around ${fmtAvg(s.avg7d, s.label)})`
          : `${emoji(d7)} ${pctWord} a normal day (normally around ${fmtAvg(s.avg7d, s.label)})`);
      } else {
        // Numbers this small swing wildly day to day; a percentage would overstate it.
        lines.push(`Normally around ${fmtAvg(s.avg7d, s.label)} a day. Numbers this small move around a lot, so day-to-day changes are usually not significant.`);
      }

      const d30 = pctDiff(s.today, s.avg30d);
      if (d30 != null && isMeaningful(s)) {
        const dir30 = d30 >= 0 ? 'above' : 'below';
        if (Math.abs(d30) >= 3) {
          lines.push(`Over the last 30 days it usually sits near ${fmtAvg(s.avg30d, s.label)} — today is ${Math.abs(d30).toFixed(0)}% ${dir30} that.`);
        } else {
          lines.push(`That is also in line with the last 30 days (usually near ${fmtAvg(s.avg30d, s.label)}).`);
        }
      }

      // Plain-English trend instead of a strip of arrows nobody can decode
      const upDays = s.weekTrend.filter((t) => t.pct != null && t.pct > 0).length;
      const rated = s.weekTrend.filter((t) => t.pct != null).length;
      if (rated >= 3 && isMeaningful(s)) {
        lines.push(`Across the last ${rated} days, ${upDays} ${upDays === 1 ? 'was' : 'were'} above the usual level.`);
      }
    }

    // Only break down by source when there is more than one and the numbers matter
    const sourceEntries = Object.entries(s.bySource).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (sourceEntries.length > 1 && !thin) {
      const srcLines = sourceEntries.map(([src, val]) => {
        const base = s.sourceBaselines?.[src];
        const sd = pctDiff(val, base);
        const flag = (sd != null && Math.abs(sd) >= ALERT_THRESHOLD_PCT && val >= MIN_VALUE_FOR_ALERT) ? '  ⚠️' : '';
        const cmp = sd == null ? '' : `  (${sd >= 0 ? 'up' : 'down'} ${Math.abs(sd).toFixed(0)}%)`;
        return `      • ${src}: ${fmtNum(val)}${cmp}${flag}`;
      });
      lines.push('Where it came from:');
      lines.push(srcLines.join('\n'));
    }

    return { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } };
  });

  // One clear callout at the top instead of an "Unusual" tag on every single line
  const flagged = shown.filter((s) => {
    const d = pctDiff(s.today, s.avg7d);
    return isMeaningful(s) && d != null && Math.abs(d) >= ALERT_THRESHOLD_PCT;
  });

  const headerNote = [];
  if (flagged.length > 0) {
    const names = flagged.map((s) => displayName(s)).join(', ');
    headerNote.push(`⚠️  *Worth a look:* ${names} ${flagged.length === 1 ? 'is' : 'are'} well outside the usual range today.`);
  }
  const thinOnes = shown.filter((s) => s.historyDays < MIN_HISTORY_DAYS);
  if (thinOnes.length === shown.length && shown.length > 0) {
    headerNote.push('ℹ️  This report is new, so there is not enough history yet to compare against.');
  }

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `${dashboardName} — End of Day`, emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: dateLabel }] },
  ];

  if (headerNote.length) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: headerNote.join('\n') } });
  }

  blocks.push({ type: 'divider' }, ...metricBlocks);

  if (hiddenCount > 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `_${hiddenCount} smaller ${hiddenCount === 1 ? 'metric is' : 'metrics are'} not shown. Open the dashboard to see everything._` }],
    });
  }

  blocks.push(
    { type: 'divider' },
    { type: 'context', elements: [{ type: 'mrkdwn', text: '_SoulSensei Analytics · sent automatically_' }] },
  );

  return blocks;
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
    const cells = funnelMaps.map((map) => pad(fmtValue(map[label] ?? null, label), colW));
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
