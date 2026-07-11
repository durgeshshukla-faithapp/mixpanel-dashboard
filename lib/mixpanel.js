// Extracts a Mixpanel report/bookmark ID from ANY link format we've seen so far:
// 1. Classic saved report: #report/12345 or #view/12345
// 2. Board card link (URL-encoded): editor-card-id=%22report-12345%22
// 3. Board card link (unencoded): editor-card-id="report-12345"
// 4. New-style alphanumeric hash: #aiiqTqWudXPJ (newer Mixpanel UI)
// 5. Bookmark ID in query string: bookmark_id=12345
// 6. Report ID in path: /report/12345
export function extractReportId(url) {
  if (!url) return null;

  let match = url.match(/#(?:report|view)\/(\d+)/);
  if (match) return match[1];

  match = url.match(/editor-card-id=%22report-(\d+)%22/);
  if (match) return match[1];

  match = url.match(/editor-card-id="?report-(\d+)"?/);
  if (match) return match[1];

  match = url.match(/bookmark_id=(\d+)/);
  if (match) return match[1];

  match = url.match(/\/report\/(\d+)/);
  if (match) return match[1];

  match = url.match(/#([a-zA-Z0-9_-]{4,})$/);
  if (match && !/^(report|view|insights|funnels)$/.test(match[1])) return match[1];

  return null;
}

export async function fetchMixpanelReport(reportId) {
  const authToken = process.env.MIXPANEL_AUTH_TOKEN;
  const projectId = process.env.MIXPANEL_PROJECT_ID;
  if (!authToken) throw new Error('MIXPANEL_AUTH_TOKEN not set');

  const today = new Date();
  const toDate = today.toISOString().slice(0, 10);
  const fromDateObj = new Date(today);
  fromDateObj.setDate(fromDateObj.getDate() - 90);
  const fromDate = fromDateObj.toISOString().slice(0, 10);

  const endpoint =
    `https://mixpanel.com/api/query/insights?project_id=${projectId}` +
    `&bookmark_id=${reportId}&from_date=${fromDate}&to_date=${toDate}`;

  const res = await fetch(endpoint, {
    headers: { accept: 'application/json', authorization: `Basic ${authToken.trim()}` },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mixpanel API returned ${res.status}: ${text}`);
  }
  return res.json();
}

function toIsoDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Handles the plain {all: number} shape used by simple metrics (Uniques, Total Events,
// Sum of value), and falls back to trying other common keys for metric types with a
// different shape (like Funnel "Conversion Rate" columns). If nothing recognizable is
// found, records a warning (via the warnings array) instead of crashing - the dashboard
// stays usable and shows a copyable diagnostic message for that one metric.
function extractMetricValue(rawVal, metricName, warnings) {
  if (rawVal == null) return 0;
  if (typeof rawVal === 'number') return rawVal;
  if (typeof rawVal !== 'object') return Number(rawVal) || 0;

  const candidateKeys = ['all', 'value', 'rate', 'count', 'overall', 'percentage', 'pct'];
  for (const key of candidateKeys) {
    if (key in rawVal && typeof rawVal[key] === 'number') return rawVal[key];
  }

  // Fall back to the first numeric value found anywhere in the object
  const firstNumeric = Object.values(rawVal).find((v) => typeof v === 'number');
  if (firstNumeric !== undefined) return firstNumeric;

  if (warnings && !warnings.some((w) => w.metric === metricName)) {
    warnings.push({ metric: metricName, sample: rawVal });
  }
  return 0;
}

// Parses raw.series[metricName][utm_source][dateStr] = number | {all: number}
// into { metricName: { sources: [], dates: [], data: {source: {date: value}} } }
// Returns { matrices, warnings } - warnings is a list of metrics whose data shape
// wasn't recognized, meant to be shown to the user with a "copy for Claude" button
// rather than buried in server logs.
export function buildAllMatrices(raw) {
  const series = raw.series || {};
  const matrices = {};
  const warnings = [];

  function isLeafValue(v) {
    return typeof v === 'number' || (v && typeof v === 'object' && 'all' in v);
  }

  Object.keys(series).forEach((metricName) => {
    const bySource = series[metricName] || {};
    const sourcesSet = new Set();
    const datesSet = new Set();
    const data = {};

    const topLevelKeys = Object.keys(bySource).filter((k) => k !== '$overall');
    const isFlatDateMap = topLevelKeys.length > 0 && topLevelKeys.every((k) => isLeafValue(bySource[k]));

    if (isFlatDateMap) {
      // No breakdown at all (e.g. a filtered/single-segment report) - Mixpanel puts
      // dates directly under the metric: series[metric][date] = {all: value}.
      // Treat it as a single "Overall" source instead of expecting a source layer.
      topLevelKeys.forEach((dateStr) => {
        const value = extractMetricValue(bySource[dateStr], metricName, warnings);
        if (isNaN(value)) return;
        const isoDate = toIsoDate(dateStr);
        if (!isoDate) return;
        sourcesSet.add('Overall');
        datesSet.add(isoDate);
        if (!data['Overall']) data['Overall'] = {};
        data['Overall'][isoDate] = value;
      });
    } else {
      // Standard shape: series[metric][source][date] = {all: value}
      Object.keys(bySource).forEach((source) => {
        if (source === '$overall') return;
        const byDate = bySource[source] || {};
        Object.keys(byDate).forEach((dateStr) => {
          if (dateStr === '$overall') return;
          const rawVal = byDate[dateStr];
          const value = extractMetricValue(rawVal, metricName, warnings);
          if (isNaN(value)) return;

          const isoDate = toIsoDate(dateStr);
          if (!isoDate) return;

          sourcesSet.add(source);
          datesSet.add(isoDate);
          if (!data[source]) data[source] = {};
          data[source][isoDate] = value;
        });
      });
    }

    if (sourcesSet.size === 0) {
      warnings.push({ metric: metricName, sample: bySource, note: 'No data at all for this metric - shape may be entirely different than expected.' });
    }

    matrices[metricName] = {
      sources: Array.from(sourcesSet).sort(),
      dates: Array.from(datesSet).sort(),
      data,
    };
  });

  return { matrices, warnings };
}

export function filterMatricesBySources(matrices, allowedSources) {
  if (allowedSources === null) return matrices;
  const filtered = {};
  Object.keys(matrices).forEach((metric) => {
    const m = matrices[metric];
    const sources = m.sources.filter((s) => allowedSources.includes(s));
    const data = {};
    sources.forEach((s) => { data[s] = m.data[s]; });
    filtered[metric] = { sources, dates: m.dates, data };
  });
  return filtered;
}

// Removes sources that sum to zero across every metric (declutters the source chips
// and reduces the payload sent to the browser - harmless since there's nothing to show anyway)
export function pruneEmptySources(matrices) {
  const metricKeys = Object.keys(matrices);
  const hasAnyValue = {};
  metricKeys.forEach((k) => {
    const m = matrices[k];
    m.sources.forEach((s) => {
      const total = m.dates.reduce((sum, d) => sum + ((m.data[s] && m.data[s][d]) || 0), 0);
      if (total > 0) hasAnyValue[s] = true;
    });
  });

  const pruned = {};
  metricKeys.forEach((k) => {
    const m = matrices[k];
    const sources = m.sources.filter((s) => hasAnyValue[s]);
    const data = {};
    sources.forEach((s) => { data[s] = m.data[s]; });
    pruned[k] = { sources, dates: m.dates, data };
  });
  return pruned;
}

// ===== Real Mixpanel Funnel report (sequential steps) =====
// Separate from Insights - Mixpanel's Funnels API has a different shape.
// This is a best-effort implementation based on Mixpanel's documented Funnels
// Query API. It has NOT been verified against a real response yet - if the
// shape doesn't match, fetchMixpanelFunnel throws a clear diagnostic error
// instead of silently showing wrong numbers.

export function extractFunnelId(url) {
  let match = url.match(/#funnel\/(\d+)/);
  if (match) return match[1];
  match = url.match(/editor-card-id=%22funnel-(\d+)%22/);
  if (match) return match[1];
  match = url.match(/editor-card-id="?funnel-(\d+)"?/);
  if (match) return match[1];
  return null;
}

export async function fetchMixpanelFunnel(funnelId) {
  const authToken = process.env.MIXPANEL_AUTH_TOKEN;
  const projectId = process.env.MIXPANEL_PROJECT_ID;
  if (!authToken) throw new Error('MIXPANEL_AUTH_TOKEN not set');

  const today = new Date();
  const toDate = today.toISOString().slice(0, 10);
  const fromDateObj = new Date(today);
  fromDateObj.setDate(fromDateObj.getDate() - 90);
  const fromDate = fromDateObj.toISOString().slice(0, 10);

  const endpoint =
    `https://mixpanel.com/api/query/funnels?project_id=${projectId}` +
    `&funnel_id=${funnelId}&from_date=${fromDate}&to_date=${toDate}`;

  const res = await fetch(endpoint, {
    headers: { accept: 'application/json', authorization: `Basic ${authToken.trim()}` },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mixpanel Funnels API returned ${res.status}: ${text}`);
  }

  const raw = await res.json();
  return parseFunnelResponse(raw);
}

// Normalizes into: { steps: [{ label, count }], overallConversion } summed across the date range.
// Throws a clear error (rather than guessing) if the response doesn't match the expected shape,
// so the dashboard shows "couldn't read this data" instead of silently wrong numbers.
function parseFunnelResponse(raw) {
  const byDate = raw?.data;
  if (!byDate || typeof byDate !== 'object') {
    throw new Error(
      'Unexpected Funnels API response shape (no "data" object). ' +
      'This integration was written from Mixpanel\'s docs but not tested against real data yet - ' +
      'please share a sample response so it can be fixed.'
    );
  }

  const dateKeys = Object.keys(byDate).filter((k) => k !== '$overall');
  if (dateKeys.length === 0) {
    throw new Error('Funnels API returned no dated entries to sum.');
  }

  let stepLabels = null;
  let stepTotals = null;

  dateKeys.forEach((dateKey) => {
    const entry = byDate[dateKey];
    const steps = entry?.steps;
    if (!Array.isArray(steps)) return;
    if (!stepLabels) {
      stepLabels = steps.map((s) => s.step_label || s.event || s.custom_event || 'Step');
      stepTotals = steps.map(() => 0);
    }
    steps.forEach((s, i) => {
      stepTotals[i] = (stepTotals[i] || 0) + (Number(s.count) || 0);
    });
  });

  if (!stepLabels) {
    throw new Error(
      'Could not find a "steps" array inside the Funnels API response for any date. ' +
      'The response shape may differ from what this code expects - please share a sample response.'
    );
  }

  const steps = stepLabels.map((label, i) => ({ label, count: stepTotals[i] }));
  const overallConversion = steps[0]?.count > 0
    ? (steps[steps.length - 1].count / steps[0].count) * 100
    : 0;

  return { steps, overallConversion };
}
