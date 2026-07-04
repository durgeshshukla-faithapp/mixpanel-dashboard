// Extracts a Mixpanel report/bookmark ID from either a direct report link
// or a board link where the card is referenced via editor-card-id
export function extractReportId(url) {
  let match = url.match(/#(?:report|view)\/(\d+)/);
  if (match) return match[1];

  match = url.match(/editor-card-id=%22report-(\d+)%22/);
  if (match) return match[1];

  match = url.match(/editor-card-id="?report-(\d+)"?/);
  if (match) return match[1];

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
