import { google } from 'googleapis';

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return new google.auth.JWT(email, null, key, ['https://www.googleapis.com/auth/spreadsheets']);
}

async function readRange(range) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range,
  });
  return res.data.values || [];
}

// Reads the "Reports" sheet:
// Col A (0) = Name, Col B (1) = Mixpanel Link, Col C (2) = Tag,
// Col D (3) = Postgres Query, Col E (4) = Postgres Metric Name,
// Col F (5) = Owner, Col G (6) = Slack Notify, Col H (7) = Slack Metrics,
// Col I (8) = Slack Format (ab/group_row/blank=normal), Col J (9) = Slack Group
export async function getReports() {
  const rows = await readRange('Reports!A2:J1000');
  return rows
    .map((r, i) => ({
      row: i + 2,
      name: r[0] || `Report ${i + 2}`,
      link: r[1] || '',
      tag: (r[2] || '').trim(),
      postgresQuery: (r[3] || '').trim(),
      postgresLabel: (r[4] || '').trim() || 'Postgres Data',
      owner: (r[5] || '').trim(),
      funnelLink: '',
      slackNotify: /^(yes|y|1)$/i.test((r[6] || '').trim()),
      slackMetrics: (r[7] || '').trim() || 'ALL',
      slackFormat: (r[8] || '').trim().toLowerCase(), // 'ab', 'group_row', or ''
      slackGroup: (r[9] || '').trim().toLowerCase(),  // e.g. 'pdp_rails', 'slots'
    }))
    .filter((r) => r.link);
}

export async function getReportByRow(row) {
  const reports = await getReports();
  return reports.find((r) => r.row === Number(row)) || null;
}

// Reads the "Access" sheet: Col A = Email, Col B = AllowedSources, Col C = AllowedTags,
// Col D = (optional) AllowedDashboards - comma-separated exact dashboard names,
// for granting access to specific individual dashboards regardless of tag.
export async function getAccessList() {
  const rows = await readRange('Access!A2:D1000');
  return rows.map((r) => ({
    email: (r[0] || '').toLowerCase().trim(),
    allowedSources: (r[1] || 'ALL').trim(),
    allowedTags: (r[2] || 'ALL').trim(),
    allowedDashboards: (r[3] || '').trim(),
  }));
}

// Returns null (no restriction) or an array of allowed source strings, or [] (no access)
export async function getAllowedSourcesForEmail(email) {
  const list = await getAccessList();
  const entry = list.find((e) => e.email === (email || '').toLowerCase().trim());
  if (!entry) return [];
  if (entry.allowedSources.toUpperCase() === 'ALL') return null;
  return entry.allowedSources.split(',').map((s) => s.trim());
}

// Returns null (no restriction, all tags allowed) or an array of allowed tag strings (case-insensitive)
export async function getAllowedTagsForEmail(email) {
  const list = await getAccessList();
  const entry = list.find((e) => e.email === (email || '').toLowerCase().trim());
  if (!entry) return [];
  if (entry.allowedTags.toUpperCase() === 'ALL') return null;
  return entry.allowedTags.split(',').map((s) => s.trim().toLowerCase());
}

// Returns [] (no extra access) or an array of exact dashboard names granted individually,
// on top of whatever tags already allow
export async function getAllowedDashboardsForEmail(email) {
  const list = await getAccessList();
  const entry = list.find((e) => e.email === (email || '').toLowerCase().trim());
  if (!entry || !entry.allowedDashboards) return [];
  return entry.allowedDashboards.split(',').map((s) => s.trim().toLowerCase());
}

// A dashboard is visible if its tag is allowed OR its exact name was granted individually
export function isDashboardAllowed(name, tag, allowedTags, allowedDashboards) {
  if (isTagAllowed(tag, allowedTags)) return true;
  return allowedDashboards.includes((name || '').toLowerCase().trim());
}

export function isTagAllowed(tag, allowedTags) {
  if (allowedTags === null) return true; // ALL = no restriction
  if (!tag) return false; // untagged reports are hidden from tag-restricted users
  return allowedTags.includes(tag.toLowerCase());
}

// Reads the "PostgresQueries" sheet: Col A = Name, Col B = SQL Query, Col C = Tag
// Kept as a completely separate list from Mixpanel "Reports" - never merged.
export async function getPostgresQueries() {
  const rows = await readRange('PostgresQueries!A2:C1000');
  return rows
    .map((r, i) => ({
      row: i + 2,
      name: r[0] || `Query ${i + 2}`,
      sql: r[1] || '',
      tag: (r[2] || '').trim(),
    }))
    .filter((r) => r.sql);
}

export async function getPostgresQueryByRow(row) {
  const queries = await getPostgresQueries();
  return queries.find((q) => q.row === Number(row)) || null;
}

// ===== Write operations (used by the /admin panel) =====
// NOTE: the service account must be shared on the Sheet as EDITOR (not just Viewer)
// for these to work.

async function appendRow(range, values) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  });
}

// A=Name, B=Link, C=Tag, D=PostgresQuery, E=PostgresMetricName, F=Owner
export async function addReport({ name, link, tag = '', postgresQuery = '', postgresLabel = '', owner = '' }) {
  await appendRow('Reports!A:F', [name, link, tag, postgresQuery, postgresLabel, owner]);
}

// Adds a new access row: A=Email, B=AllowedSources, C=AllowedTags, D=AllowedDashboards
export async function addAccess({ email, allowedSources = 'ALL', allowedTags = 'ALL', allowedDashboards = '' }) {
  await appendRow('Access!A:D', [email.toLowerCase().trim(), allowedSources, allowedTags, allowedDashboards]);
}

// ===== Synced data (Mixpanel -> Sheet -> Dashboard architecture) =====
// ===== Per-dashboard Sheet tabs (clean, human-readable) =====
// Instead of one big "SyncedData" tab, each dashboard gets its own tab named
// "Sync_<row>" (e.g. "Sync_2", "Sync_3"). This makes the Sheet readable:
// each tab has clean headers + data for just that one dashboard.
//
// Tab format:
//   Row 1:  Synced At: <timestamp>  |  Dashboard: <name>
//   Row 2:  Date | Source | <Metric A> | <Metric B> | ...
//   Row 3+: data rows, one per (date, source) combination
//
// "SyncedData" + "SyncMeta" tabs are no longer used - kept for backward compat
// only (won't be written to, safe to delete manually from the Sheet).

function syncTabName(reportRow) {
  return `Sync_${reportRow}`;
}

async function ensureTabExists(sheets, tabName) {
  // Try to read the tab first - if it works it exists already
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: `${tabName}!A1`,
    });
    return; // tab exists
  } catch (err) {
    // Tab doesn't exist - create it
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    });
  }
}

export async function writeSyncedDashboard(reportRow, reportName, matrices) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const tabName = syncTabName(reportRow);
  await ensureTabExists(sheets, tabName);

  const metricKeys = Object.keys(matrices);
  const allSources = Array.from(new Set(metricKeys.flatMap((k) => matrices[k].sources))).sort();
  const allDates = Array.from(new Set(metricKeys.flatMap((k) => matrices[k].dates))).sort();

  // Build rows: header info + column headers + data
  const headerRow1 = [`Synced At: ${new Date().toISOString()}`, `Dashboard: ${reportName}`];
  const headerRow2 = ['Date', 'Source', ...metricKeys];
  const dataRows = [];

  allDates.forEach((date) => {
    allSources.forEach((source) => {
      const values = metricKeys.map((k) => matrices[k].data[source]?.[date] ?? '');
      // Only write the row if at least one metric has a value
      if (values.some((v) => v !== '')) {
        dataRows.push([date, source, ...values]);
      }
    });
  });

  const allRows = [headerRow1, headerRow2, ...dataRows];

  // Clear and rewrite the tab
  await sheets.spreadsheets.values.clear({
    spreadsheetId: process.env.SHEET_ID,
    range: `${tabName}!A1:ZZ100000`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: allRows },
  });
}

export async function getSyncedMatrices(reportRow) {
  const tabName = syncTabName(reportRow);
  let rows;
  try {
    rows = await readRange(`${tabName}!A1:ZZ10000`);
  } catch (err) {
    return {}; // Tab doesn't exist yet - fall through to live fetch
  }
  if (!rows || rows.length < 3) return {}; // No data yet

  // Row 0: header info (Synced At, Dashboard name)
  // Row 1: column headers (Date, Source, Metric A, Metric B, ...)
  // Row 2+: data
  const colHeaders = rows[1] || [];
  const metricKeys = colHeaders.slice(2); // skip Date and Source columns
  if (metricKeys.length === 0) return {};

  const byMetric = {};
  metricKeys.forEach((k) => {
    byMetric[k] = { sources: new Set(), dates: new Set(), data: {} };
  });

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const date = row[0];
    const source = row[1];
    if (!date || !source) continue;
    metricKeys.forEach((k, j) => {
      const val = row[2 + j];
      if (val === '' || val === undefined) return;
      const num = Number(val);
      if (isNaN(num)) return;
      byMetric[k].sources.add(source);
      byMetric[k].dates.add(date);
      if (!byMetric[k].data[source]) byMetric[k].data[source] = {};
      byMetric[k].data[source][date] = num;
    });
  }

  const result = {};
  Object.keys(byMetric).forEach((k) => {
    if (byMetric[k].sources.size === 0) return; // skip empty metrics
    result[k] = {
      sources: Array.from(byMetric[k].sources).sort(),
      dates: Array.from(byMetric[k].dates).sort(),
      data: byMetric[k].data,
    };
  });
  return result;
}

export async function getSyncTimestamp(reportRow) {
  try {
    const tabName = syncTabName(reportRow);
    const rows = await readRange(`${tabName}!A1:A1`);
    const cell = rows[0]?.[0] || '';
    const match = cell.match(/Synced At: (.+)/);
    return match ? match[1] : null;
  } catch (err) {
    return null;
  }
}

// Legacy functions kept for backward compat — no longer written to
export async function replaceAllSyncedData() {}
export async function setSyncTimestamp() {}

// Returns all reports grouped by Slack Group (Column J)
// Used for combined table messages (PDP Rails, Slots etc.)
export async function getReportsBySlackGroup() {
  const reports = await getReports();
  const groups = {};
  reports.forEach((r) => {
    if (!r.slackNotify) return;
    const group = (r.slackGroup || '').trim();
    if (!group) return; // ungrouped reports use normal format
    if (!groups[group]) groups[group] = [];
    groups[group].push(r);
  });
  return groups;
}
