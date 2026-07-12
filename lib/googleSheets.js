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
// Col A = Name, Col B = Mixpanel Link, Col C = (legacy, unused), Col D = Tag,
// Col E = (optional) Postgres Query to mix into this same dashboard,
// Col F = (optional) label for that mixed-in metric (defaults to "Postgres Data")
// Col G = (optional) Owner name (shown on the card, searchable)
// Col H = (optional) Mixpanel Funnel report link (real sequential-steps funnel)
export async function getReports() {
  const rows = await readRange('Reports!A2:H1000');
  return rows
    .map((r, i) => ({
      row: i + 2,
      name: r[0] || `Report ${i + 2}`,
      link: r[1] || '',
      tag: (r[3] || '').trim(),
      postgresQuery: (r[4] || '').trim(),
      postgresLabel: (r[5] || '').trim() || 'Postgres Data',
      owner: (r[6] || '').trim(),
      funnelLink: (r[7] || '').trim(),
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

// Adds a new dashboard row to Reports:
// A=Name, B=Link, C=(legacy, empty), D=Tag, E=PostgresQuery, F=PostgresLabel, G=Owner, H=FunnelLink
export async function addReport({ name, link, tag = '', postgresQuery = '', postgresLabel = '', owner = '', funnelLink = '' }) {
  await appendRow('Reports!A:H', [name, link, '', tag, postgresQuery, postgresLabel, owner, funnelLink]);
}

// Adds a new access row: A=Email, B=AllowedSources, C=AllowedTags, D=AllowedDashboards
export async function addAccess({ email, allowedSources = 'ALL', allowedTags = 'ALL', allowedDashboards = '' }) {
  await appendRow('Access!A:D', [email.toLowerCase().trim(), allowedSources, allowedTags, allowedDashboards]);
}

// ===== Synced data (Mixpanel -> Sheet -> Dashboard architecture) =====
// The "SyncedData" tab stores flattened rows: ReportRow | Metric | Source | Date | Value
// A cron job (see app/api/cron/sync) periodically overwrites this whole tab with fresh
// data pulled from Mixpanel. Dashboards then read from here instead of live-querying
// Mixpanel on every visit - faster, immune to Mixpanel API rate limits and shape quirks
// (since parsing only happens once, during sync), at the cost of freshness lag.

export async function replaceAllSyncedData(rows) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: process.env.SHEET_ID,
    range: 'SyncedData!A2:E200000',
  });
  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: 'SyncedData!A2',
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
  }
}

export async function setSyncTimestamp() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SHEET_ID,
    range: 'SyncMeta!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [[new Date().toISOString()]] },
  });
}

export async function getSyncTimestamp() {
  try {
    const rows = await readRange('SyncMeta!A1:A1');
    return rows[0]?.[0] || null;
  } catch (err) {
    return null;
  }
}

// Reads SyncedData for one report and reconstructs the same {metric: {sources, dates, data}}
// shape that DashboardClient already expects - so DashboardClient needs zero changes.
export async function getSyncedMatrices(reportRow) {
  const rows = await readRange('SyncedData!A2:E200000');
  const byMetric = {};
  rows.forEach((r) => {
    const [rRow, metric, source, date, value] = r;
    if (String(rRow) !== String(reportRow)) return;
    if (!byMetric[metric]) byMetric[metric] = { sources: new Set(), dates: new Set(), data: {} };
    byMetric[metric].sources.add(source);
    byMetric[metric].dates.add(date);
    if (!byMetric[metric].data[source]) byMetric[metric].data[source] = {};
    byMetric[metric].data[source][date] = Number(value) || 0;
  });

  const result = {};
  Object.keys(byMetric).forEach((k) => {
    result[k] = {
      sources: Array.from(byMetric[k].sources).sort(),
      dates: Array.from(byMetric[k].dates).sort(),
      data: byMetric[k].data,
    };
  });
  return result;
}
