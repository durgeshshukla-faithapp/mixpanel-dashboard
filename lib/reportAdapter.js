// Report Adapter — converts ANY Mixpanel results format into our standard
// time-series matrix format { [metric]: { sources, dates, data } }
// so ALL reports can be synced to Sheet and displayed in dashboards.
//
// Handles these cases automatically:
// 1. Date-indexed: rows = [["Jul 17, 2026", value], ...] → time-series per date
// 2. Single-value: rows = [[value]] → stored as a single "snapshot" date
// 3. A/B breakdown: rows = [["Variant A, $overall", value], ...] → skipped for sync
//    (A/B handled separately via slackAB.js)
// 4. Source breakdown: rows = [["GE_Meta", value], ...] → each source as separate series

const DATE_PATTERNS = [
  // "Jul 17, 2026" → "2026-07-17"
  /^(\w{3})\s+(\d{1,2}),\s+(\d{4})$/,
  // "2026-07-17"
  /^\d{4}-\d{2}-\d{2}$/,
];

const MONTHS = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

function parseDate(str) {
  const s = String(str || '').trim();
  // "2026-07-17" already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // "Jul 17, 2026"
  const m = s.match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (m && MONTHS[m[1]]) {
    return `${m[3]}-${MONTHS[m[1]]}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

function isDateStr(str) {
  return parseDate(str) !== null;
}

function isABVariant(str) {
  return /variant\s+[ab]|\$overall|control|treatment/i.test(String(str || ''));
}

// Detect the "shape" of a metric's results
function detectShape(rows) {
  if (!rows || rows.length === 0) return 'empty';
  const firstKey = String(rows[0]?.[0] ?? '');
  if (rows.length === 1 && rows[0].length === 1) return 'single'; // [[value]]
  if (rows[0].length === 1) return 'single_multi'; // multiple single values
  if (isABVariant(firstKey)) return 'ab'; // A/B breakdown
  if (isDateStr(firstKey)) return 'date_series'; // time series
  return 'categorical'; // other breakdown (source names, cities etc.)
}

// Convert results → { [metricKey]: { sources, dates, data } }
// todayIso: used as the date key for snapshot (single-value) metrics
export function adaptResults(results, todayIso) {
  const matrices = {};
  if (!results || typeof results !== 'object') return matrices;

  Object.entries(results).forEach(([metricKey, metricData]) => {
    const rows = metricData?.rows || [];
    const shape = detectShape(rows);

    if (shape === 'empty') return;

    if (shape === 'ab') {
      // A/B reports: skip from time-series sync
      // They are handled via slackAB.js and fetchMixpanelABReport
      return;
    }

    if (shape === 'single' || shape === 'single_multi') {
      // Single-value snapshot: store under "Overall" source + todayIso date
      const value = rows[0]?.[0] ?? null;
      if (value == null) return;
      matrices[metricKey] = {
        sources: ['Overall'],
        dates: [todayIso],
        data: { Overall: { [todayIso]: Number(value) } },
      };
      return;
    }

    if (shape === 'date_series') {
      // Date-indexed time series (no source breakdown)
      const dateMap = {};
      rows.forEach((r) => {
        const dateStr = String(r[0] || '');
        const isoDate = parseDate(dateStr);
        if (!isoDate) return;
        dateMap[isoDate] = Number(r[1]) || 0;
      });
      const dates = Object.keys(dateMap).sort();
      if (dates.length === 0) return;
      matrices[metricKey] = {
        sources: ['Overall'],
        dates,
        data: { Overall: dateMap },
      };
      return;
    }

    if (shape === 'categorical') {
      // Source/category breakdown — treat each category as a "source"
      const sourceMap = {};
      rows.forEach((r) => {
        const source = String(r[0] || 'Unknown');
        const value = Number(r[1]) || 0;
        sourceMap[source] = value;
      });
      // Store as a single date snapshot
      const sources = Object.keys(sourceMap);
      const data = {};
      sources.forEach((s) => { data[s] = { [todayIso]: sourceMap[s] }; });
      matrices[metricKey] = { sources, dates: [todayIso], data };
    }
  });

  return matrices;
}

// Build matrices from raw Mixpanel API response (handles both series and results formats)
export function buildMatricesFromRaw(raw, todayIso) {
  // Format 1: { series: { metricName: { breakdown: { date: value } } } }
  if (raw?.series && typeof raw.series === 'object') {
    return buildFromSeries(raw.series, todayIso);
  }
  // Format 2: { results: { metricName: { rows: [[key, value], ...] } } }
  if (raw?.results && typeof raw.results === 'object') {
    return adaptResults(raw.results, todayIso);
  }
  // Format 3: raw IS the results object already
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const firstVal = Object.values(raw)[0];
    if (firstVal?.rows) return adaptResults(raw, todayIso);
  }
  return {};
}

function buildFromSeries(series, todayIso) {
  const matrices = {};
  Object.entries(series).forEach(([metricKey, byBreakdown]) => {
    if (!byBreakdown || typeof byBreakdown !== 'object') return;
    const breakdownKeys = Object.keys(byBreakdown);
    if (breakdownKeys.length === 0) return;
    const firstBreakdown = breakdownKeys[0];

    // Check if breakdown keys are sources (not dates)
    const breakdownIsDates = isDateStr(firstBreakdown);

    if (breakdownIsDates) {
      // No source breakdown — single "Overall" source, breakdowns ARE dates
      const dateMap = {};
      Object.entries(byBreakdown).forEach(([dateStr, val]) => {
        const iso = parseDate(dateStr);
        if (!iso) return;
        const n = typeof val === 'object' ? (val.all ?? val.value ?? 0) : Number(val) || 0;
        dateMap[iso] = n;
      });
      const dates = Object.keys(dateMap).sort();
      if (dates.length === 0) return;
      matrices[metricKey] = { sources: ['Overall'], dates, data: { Overall: dateMap } };
    } else if (isABVariant(firstBreakdown)) {
      // A/B — skip
      return;
    } else {
      // Source breakdown: byBreakdown = { source: { date: value, $overall: val } }
      const sourceMap = {};
      const allDates = new Set();
      Object.entries(byBreakdown).forEach(([source, byDate]) => {
        sourceMap[source] = {};
        Object.entries(byDate || {}).forEach(([dateStr, val]) => {
          if (dateStr === '$overall') return;
          const iso = parseDate(dateStr);
          if (!iso) return;
          const n = typeof val === 'object' ? (val.all ?? val.value ?? 0) : Number(val) || 0;
          sourceMap[source][iso] = n;
          allDates.add(iso);
        });
      });
      const dates = Array.from(allDates).sort();
      if (dates.length === 0) return;
      const sources = Object.keys(sourceMap);
      matrices[metricKey] = { sources, dates, data: sourceMap };
    }
  });
  return matrices;
}
