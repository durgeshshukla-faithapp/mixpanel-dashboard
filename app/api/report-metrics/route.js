import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSyncedMatrices } from '@/lib/googleSheets';

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const row = new URL(req.url).searchParams.get('row');
  if (!row) return NextResponse.json({ error: 'Missing row' }, { status: 400 });

  try {
    const matrices = await getSyncedMatrices(row);
    return NextResponse.json({ metrics: Object.keys(matrices) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { row, metric, fromDate, toDate } = await req.json();
  if (!row || !metric) return NextResponse.json({ error: 'Missing row/metric' }, { status: 400 });

  try {
    const matrices = await getSyncedMatrices(row);
    const m = matrices[metric];
    if (!m) return NextResponse.json({ error: `Metric "${metric}" not found` }, { status: 404 });

    const dates = m.dates.filter((d) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate));
    const totals = {};
    dates.forEach((d) => {
      totals[d] = m.sources.reduce((sum, s) => sum + (m.data[s]?.[d] || 0), 0);
    });
    return NextResponse.json({ dates, totals });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
