// Dynamic Mixpanel queries using their DOCUMENTED query APIs
// (unlike lib/mixpanel.js which fetches pre-saved bookmark reports).
// Docs: https://developer.mixpanel.com/reference/query-api

const BASE = 'https://mixpanel.com/api/query';

function authHeaders() {
  const authToken = process.env.MIXPANEL_AUTH_TOKEN;
  if (!authToken) throw new Error('MIXPANEL_AUTH_TOKEN not set');
  return { accept: 'application/json', authorization: `Basic ${authToken.trim()}` };
}

async function mixpanelGet(path, params, revalidateSeconds = 300) {
  const projectId = process.env.MIXPANEL_PROJECT_ID;
  const qs = new URLSearchParams({ project_id: projectId, ...params });
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: authHeaders(),
    next: { revalidate: revalidateSeconds },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mixpanel ${path} returned ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ===== Metadata for the query-builder pickers =====

// List of event names seen in the project (most common first)
export async function getEventNames() {
  // Cached longer (1 hour) - event lists change rarely
  const data = await mixpanelGet('/events/names', { type: 'general', limit: 255 }, 3600);
  return Array.isArray(data) ? data : [];
}

// Top properties for a given event
export async function getTopProperties(event) {
  const data = await mixpanelGet('/events/properties/top', { event, limit: 60 }, 3600);
  // Response: { propName: { count: N }, ... }
  return Object.keys(data || {});
}

// Top values for a given event property (for filter value suggestions)
export async function getTopPropertyValues(event, propName) {
  const data = await mixpanelGet('/events/properties/values', {
    event, name: propName, limit: 30,
  }, 3600);
  return Array.isArray(data) ? data : [];
}

// ===== Dynamic Insights (Segmentation) =====
// where: Mixpanel expression string, e.g. properties["utm_source"] == "GE_Meta"
// on: breakdown expression, e.g. properties["utm_source"]
// type: general (total events) | unique (unique users) | average
export async function runSegmentation({ event, fromDate, toDate, where, on, type = 'general', unit = 'day' }) {
  const params = { event, from_date: fromDate, to_date: toDate, type, unit };
  if (where) params.where = where;
  if (on) params.on = on;
  const raw = await mixpanelGet('/segmentation', params);

  // Shape: { data: { series: [dates], values: { segment: { date: value } } } }
  const values = raw?.data?.values || {};
  const dates = (raw?.data?.series || []).slice().sort();
  const sources = Object.keys(values);
  const data = {};
  sources.forEach((s) => {
    data[s] = {};
    dates.forEach((d) => { data[s][d] = Number(values[s]?.[d]) || 0; });
  });
  return { sources, dates, data };
}

// ===== Funnels =====

export async function listSavedFunnels() {
  const data = await mixpanelGet('/funnels/list', {}, 3600);
  // [{funnel_id, name}]
  return Array.isArray(data) ? data : [];
}

export async function runFunnel({ funnelId, fromDate, toDate }) {
  const raw = await mixpanelGet('/funnels', {
    funnel_id: funnelId, from_date: fromDate, to_date: toDate,
  });

  const byDate = raw?.data;
  if (!byDate || typeof byDate !== 'object') {
    throw new Error('Unexpected Funnels response shape: ' + JSON.stringify(raw).slice(0, 200));
  }

  let stepLabels = null;
  let stepTotals = null;
  Object.keys(byDate).forEach((dateKey) => {
    const steps = byDate[dateKey]?.steps;
    if (!Array.isArray(steps)) return;
    if (!stepLabels) {
      stepLabels = steps.map((s) => s.step_label || s.event || s.goal || 'Step');
      stepTotals = steps.map(() => 0);
    }
    steps.forEach((s, i) => { stepTotals[i] += Number(s.count) || 0; });
  });

  if (!stepLabels) throw new Error('No steps found in Funnels response.');
  const steps = stepLabels.map((label, i) => ({ label, count: stepTotals[i] }));
  const overallConversion = steps[0]?.count > 0
    ? (steps[steps.length - 1].count / steps[0].count) * 100 : 0;
  return { steps, overallConversion };
}

// ===== Retention =====
// bornEvent: the event that defines the cohort ("did X first")
// returnEvent: the event that counts as "came back" (optional - defaults to any event)
export async function runRetention({ bornEvent, returnEvent, fromDate, toDate, unit = 'day', intervalCount = 10 }) {
  const params = {
    from_date: fromDate, to_date: toDate,
    retention_type: 'birth',
    born_event: bornEvent,
    unit,
    interval_count: intervalCount,
  };
  if (returnEvent) params.event = returnEvent;
  const raw = await mixpanelGet('/retention', params);

  // Shape: { "2026-07-01": { counts: [c0, c1, ...], first: N }, ... }
  const cohorts = Object.keys(raw || {}).sort().map((date) => {
    const entry = raw[date] || {};
    const first = Number(entry.first) || 0;
    const counts = (entry.counts || []).map((c) => Number(c) || 0);
    const percents = counts.map((c) => (first > 0 ? (c / first) * 100 : 0));
    return { date, first, counts, percents };
  });
  return { cohorts };
}
