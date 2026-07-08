import { google } from 'googleapis';

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return new google.auth.JWT(email, null, key, ['https://www.googleapis.com/auth/spreadsheets.readonly']);
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
export async function getReports() {
  const rows = await readRange('Reports!A2:F1000');
  return rows
    .map((r, i) => ({
      row: i + 2,
      name: r[0] || `Report ${i + 2}`,
      link: r[1] || '',
      tag: (r[3] || '').trim(),
      postgresQuery: (r[4] || '').trim(),
      postgresLabel: (r[5] || '').trim() || 'Postgres Data',
    }))
    .filter((r) => r.link);
}

export async function getReportByRow(row) {
  const reports = await getReports();
  return reports.find((r) => r.row === Number(row)) || null;
}

// Reads the "Access" sheet: Col A = Email, Col B = AllowedSources, Col C = AllowedTags
export async function getAccessList() {
  const rows = await readRange('Access!A2:C1000');
  return rows.map((r) => ({
    email: (r[0] || '').toLowerCase().trim(),
    allowedSources: (r[1] || 'ALL').trim(),
    allowedTags: (r[2] || 'ALL').trim(),
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
