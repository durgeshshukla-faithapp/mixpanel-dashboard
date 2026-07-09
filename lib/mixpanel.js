// Extracts a Mixpanel report/bookmark ID from either a direct report link
// or a board link where the card is referenced via editor-card-id
export function extractReportId(url) {
  let match = url.match(/#(?:report|view)\/(\d+)/);
  if (match) return match[1];

  match = url.match(/editor-card-id=%22report-(\d+)%22/);
  if (match) return match[1];

  match = url.match(/editor-card-id="?report-(\d+)"?/);
  if (match) return match[1];

  // Newer/plain format: #<alphanumeric id> with nothing else after the hash
  // (e.g. .../app/insights/#aiiqTqWudXPJ). Not yet confirmed to work with
  // bookmark_id - this is a best-effort fallback, may need adjustment.
  match = url.match(/#([a-zA-Z0-9_-]+)$/);
  if (match && !/^(report|view|id)$/.test(match[1])) return match[1];

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
    cache: 'no-store',
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

// Parses raw.series[metricName][utm_source][dateStr] = number | {all: number}
// into { metricName: { sources: [], dates: [], data: {source: {date: value}} } }
export function buildAllMatrices(raw) {
  const series = raw.series || {};
  const matrices = {};

  Object.keys(series).forEach((metricName) => {
    const bySource = series[metricName] || {};
    const sourcesSet = new Set();
    const datesSet = new Set();
    const data = {};

    Object.keys(bySource).forEach((source) => {
      if (source === '$overall') return;
      const byDate = bySource[source] || {};
      Object.keys(byDate).forEach((dateStr) => {
        if (dateStr === '$overall') return;
        const rawVal = byDate[dateStr];
        const value = rawVal && typeof rawVal === 'object' ? rawVal.all || 0 : rawVal || 0;
        if (isNaN(value)) return;

        const isoDate = toIsoDate(dateStr);
        if (!isoDate) return;

        sourcesSet.add(source);
        datesSet.add(isoDate);
        if (!data[source]) data[source] = {};
        data[source][isoDate] = value;
      });
    });

    matrices[metricName] = {
      sources: Array.from(sourcesSet).sort(),
      dates: Array.from(datesSet).sort(),
      data,
    };
  });

  return matrices;
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
    cache: 'no-store',
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
