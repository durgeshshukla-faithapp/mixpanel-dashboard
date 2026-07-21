import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const authToken = process.env.MIXPANEL_AUTH_TOKEN;
  const projectId = process.env.MIXPANEL_PROJECT_ID;
  const reportId = '91164694'; // Same Leader CRM

  const today = new Date();
  const toDate = today.toISOString().slice(0, 10);
  const fromDateObj = new Date(today);
  fromDateObj.setDate(fromDateObj.getDate() - 30);
  const fromDate = fromDateObj.toISOString().slice(0, 10);

  const url = `https://mixpanel.com/api/query/insights?project_id=${projectId}&bookmark_id=${reportId}&from_date=${fromDate}&to_date=${toDate}`;

  const res = await fetch(url, {
    headers: { accept: 'application/json', authorization: `Basic ${authToken.trim()}` },
    cache: 'no-store',
  });

  const raw = await res.json();
  const topKeys = Object.keys(raw || {});

  let seriesSample = null;
  if (raw?.series) {
    const firstMetric = Object.keys(raw.series)[0];
    const breakdowns = Object.keys(raw.series[firstMetric] || {}).slice(0, 3);
    const firstBreakdown = breakdowns[0];
    const dates = firstBreakdown
      ? Object.keys(raw.series[firstMetric][firstBreakdown] || {}).slice(0, 3)
      : [];
    seriesSample = { firstMetric, breakdowns, dates };
  }

  let resultsSample = null;
  if (raw?.results) {
    const firstMetric = Object.keys(raw.results)[0];
    resultsSample = { firstMetric, rows: raw.results[firstMetric]?.rows?.slice(0, 3) };
  }

  return NextResponse.json({ status: res.status, topKeys, seriesSample, resultsSample });
}
