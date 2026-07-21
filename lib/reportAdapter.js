/**
 * Universal Mixpanel Report Adapter
 * 
 * Converts ANY Mixpanel results format into our standard matrix format:
 * { [metricKey]: { sources: string[], dates: string[], data: { [source]: { [date]: number } } } }
 * 
 * Handles ALL known data shapes from Mixpanel Insights API:
 *
 * Shape 1 — Date-indexed (no source breakdown):
 *   rows: [["Jul 21, 2026", 3438], ["Jul 20, 2026", 11195], ...]
 *   Example: PDP Rails Group, Homepage Traffic
 *
 * Shape 2 — Source+Date combined key:
 *   rows: [["GE_Meta, $overall", 1825], ["GE_Meta, Jul 21, 2026", 4], ...]
 *   Example: OOO day by day revenue, Same Leader CRM
 *
 * Shape 3 — A/B variant breakdown (SKIPPED for sync, handled by slackAB):
 *   rows: [["Variant A, $overall", 1000], ["Variant B, $overall", 2000], ...]
 *   Example: Sign IN funnel, One on One A/B
 *
 * Shape 4 — Single value snapshot:
 *   rows: [[value]]
 *   Example: CHOOSE SLOT FUNNEL, OOO RESERVE NOW FUNNEL
 *
 * Shape 5 — Plain categorical (source-only, no dates):
 *   rows: [["GE_Meta", 100], ["notification", 50], ...]
 */

const MONTHS = {
  Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
};

function parseDate(str) {
  const s = String(str || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (m && MONTHS[m[1]]) return `${m[3]}-${MONTHS[m[1]]}-${m[2].padStart(2,'0')}`;
  return null;
}

function isDate(str) { return parseDate(str) !== null; }

function isABVariant(str) {
  return /variant\s+[ab]|\bcontrol\b|\btreatment\b/i.test(String(str||''));
}

/**
 * Detect the shape of a metric's rows array.
 */
function detectShape(rows) {
  if (!rows || rows.length === 0) return 'empty';
  
  const first = rows[0];
  
  // Shape 4: single value — [[number]]
  if (first.length === 1) return 'snapshot';
  
  const key0 = String(first[0] || '');
  
  // Shape 3: A/B variant
  if (isABVariant(key0)) return 'ab';
  
  // Shape 1: plain date
  if (isDate(key0)) return 'date_series';
  
  // Shape 2 vs Shape 5: key has comma?
  const lastComma = key0.lastIndexOf(', ');
  if (lastComma >= 0) {
    const afterComma = key0.slice(lastComma + 2).trim();
    // "$overall" suffix = source+date combo format
    if (afterComma === '$overall' || isDate(afterComma)) return 'source_date';
  }
  
  // Shape 5: plain categorical
  return 'categorical';
}

/**
 * Build standard matrix from a metric's rows given a detected shape.
 */
function buildMatrix(rows, shape, todayIso) {
  if (shape === 'empty' || shape === 'ab') return null;

  // Shape 4: single snapshot value
  if (shape === 'snapshot') {
    const val = rows[0]?.[0];
    if (val == null) return null;
    return {
      sources: ['Overall'],
      dates: [todayIso],
      data: { Overall: { [todayIso]: Number(val) } },
    };
  }

  // Shape 1: date-indexed time series
  if (shape === 'date_series') {
    const dateMap = {};
    rows.forEach((r) => {
      const iso = parseDate(String(r[0]||''));
      if (iso) dateMap[iso] = Number(r[1]) || 0;
    });
    const dates = Object.keys(dateMap).sort();
    if (!dates.length) return null;
    return { sources: ['Overall'], dates, data: { Overall: dateMap } };
  }

  // Shape 2: "source, date" or "source, $overall" combined keys
  if (shape === 'source_date') {
    const sourceMap = {};
    const allDates = new Set();
    rows.forEach((r) => {
      const key = String(r[0]||'');
      const lastComma = key.lastIndexOf(', ');
      if (lastComma < 0) return;
      const source = key.slice(0, lastComma).trim();
      const datePart = key.slice(lastComma + 2).trim();
      // Skip $overall rows — we want daily granularity
      if (datePart === '$overall') return;
      const iso = parseDate(datePart);
      if (!iso) return;
      if (!sourceMap[source]) sourceMap[source] = {};
      sourceMap[source][iso] = Number(r[1]) || 0;
      allDates.add(iso);
    });
    const dates = Array.from(allDates).sort();
    if (!dates.length) return null;
    return { sources: Object.keys(sourceMap), dates, data: sourceMap };
  }

  // Shape 5: plain categorical — store as snapshot per source
  if (shape === 'categorical') {
    const sourceMap = {};
    rows.forEach((r) => {
      const source = String(r[0]||'Unknown');
      sourceMap[source] = Number(r[1]) || 0;
    });
    const sources = Object.keys(sourceMap);
    const data = {};
    sources.forEach((s) => { data[s] = { [todayIso]: sourceMap[s] }; });
    return { sources, dates: [todayIso], data };
  }

  return null;
}

/**
 * Convert a Mixpanel results object into matrices.
 * results: { metricKey: { rows: [[key, value], ...] } }
 */
export function adaptResults(results, todayIso) {
  const matrices = {};
  if (!results || typeof results !== 'object') return matrices;

  Object.entries(results).forEach(([metricKey, metricData]) => {
    const rows = metricData?.rows || [];
    const shape = detectShape(rows);
    const matrix = buildMatrix(rows, shape, todayIso);
    if (matrix) matrices[metricKey] = matrix;
  });

  return matrices;
}

/**
 * Build matrices from raw Mixpanel API response.
 * Handles both { series: {...} } and { results: {...} } top-level formats.
 */
export function buildMatricesFromRaw(raw, todayIso) {
  if (!raw || typeof raw !== 'object') return {};

  // Format A: { results: { metricKey: { rows: [...] } } }
  if (raw.results && typeof raw.results === 'object' && !Array.isArray(raw.results)) {
    const firstVal = Object.values(raw.results)[0];
    if (firstVal && typeof firstVal === 'object' && 'rows' in firstVal) {
      return adaptResults(raw.results, todayIso);
    }
  }

  // Format B: { series: { metricKey: { breakdown: { date: value } } } }
  if (raw.series && typeof raw.series === 'object') {
    return buildFromSeries(raw.series, todayIso);
  }

  // Format C: raw IS the results object (keys → { rows: [...] })
  if (!Array.isArray(raw)) {
    const firstVal = Object.values(raw)[0];
    if (firstVal && typeof firstVal === 'object' && 'rows' in firstVal) {
      return adaptResults(raw, todayIso);
    }
  }

  return {};
}

/**
 * Convert the "series" format (from /query/insights endpoint) into matrices.
 * series: { metricKey: { breakdownKey: { date: value } } }
 */
function buildFromSeries(series, todayIso) {
  const matrices = {};

  Object.entries(series).forEach(([metricKey, byBreakdown]) => {
    if (!byBreakdown || typeof byBreakdown !== 'object') return;

    const breakdownKeys = Object.keys(byBreakdown);
    if (!breakdownKeys.length) return;
    const firstKey = breakdownKeys[0];

    // Skip A/B reports
    if (isABVariant(firstKey)) return;

    // Check if breakdown keys are dates (no source breakdown)
    if (isDate(firstKey)) {
      // Simple time series: breakdown = date → value (or {all: value})
      const dateMap = {};
      Object.entries(byBreakdown).forEach(([dateStr, val]) => {
        const iso = parseDate(dateStr);
        if (!iso) return;
        const n = typeof val === 'object' ? (val.all ?? val.value ?? 0) : Number(val) || 0;
        dateMap[iso] = n;
      });
      const dates = Object.keys(dateMap).sort();
      if (!dates.length) return;
      matrices[metricKey] = { sources: ['Overall'], dates, data: { Overall: dateMap } };
      return;
    }

    // Source breakdown: breakdown = source → { date: value, $overall: value }
    const sourceMap = {};
    const allDates = new Set();

    Object.entries(byBreakdown).forEach(([source, byDate]) => {
      if (!byDate || typeof byDate !== 'object') return;
      sourceMap[source] = {};
      Object.entries(byDate).forEach(([dateStr, val]) => {
        if (dateStr === '$overall') return;
        const iso = parseDate(dateStr);
        if (!iso) return;
        const n = typeof val === 'object' ? (val.all ?? val.value ?? 0) : Number(val) || 0;
        sourceMap[source][iso] = n;
        allDates.add(iso);
      });
    });

    const dates = Array.from(allDates).sort();
    if (!dates.length) return;
    matrices[metricKey] = {
      sources: Object.keys(sourceMap),
      dates,
      data: sourceMap,
    };
  });

  return matrices;
}
