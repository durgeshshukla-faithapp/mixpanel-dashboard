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

// Reads the "Reports" sheet: Col A = Name, Col B = Mixpanel Link
export async function getReports() {
  const rows = await readRange('Reports!A2:B1000');
  return rows
    .map((r, i) => ({ row: i + 2, name: r[0] || `Report ${i + 2}`, link: r[1] || '' }))
    .filter((r) => r.link);
}

export async function getReportByRow(row) {
  const reports = await getReports();
  return reports.find((r) => r.row === Number(row)) || null;
}

// Reads the "Access" sheet: Col A = Email, Col B = AllowedSources
export async function getAccessList() {
  const rows = await readRange('Access!A2:B1000');
  return rows.map((r) => ({
    email: (r[0] || '').toLowerCase().trim(),
    allowedSources: (r[1] || 'ALL').trim(),
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
