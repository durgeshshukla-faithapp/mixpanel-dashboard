import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runSegmentation, runFunnel, runRetention } from '@/lib/mixpanelQuery';

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await req.json();
  const { kind } = body;

  try {
    if (kind === 'segmentation') {
      const { event, fromDate, toDate, where, on, type, unit } = body;
      if (!event || !fromDate || !toDate) {
        return NextResponse.json({ error: 'Missing event/fromDate/toDate' }, { status: 400 });
      }
      const result = await runSegmentation({ event, fromDate, toDate, where, on, type, unit });
      return NextResponse.json(result);
    }
    if (kind === 'funnel') {
      const { funnelId, fromDate, toDate } = body;
      if (!funnelId || !fromDate || !toDate) {
        return NextResponse.json({ error: 'Missing funnelId/fromDate/toDate' }, { status: 400 });
      }
      const result = await runFunnel({ funnelId, fromDate, toDate });
      return NextResponse.json(result);
    }
    if (kind === 'retention') {
      const { bornEvent, returnEvent, fromDate, toDate, unit, intervalCount } = body;
      if (!bornEvent || !fromDate || !toDate) {
        return NextResponse.json({ error: 'Missing bornEvent/fromDate/toDate' }, { status: 400 });
      }
      const result = await runRetention({ bornEvent, returnEvent, fromDate, toDate, unit, intervalCount });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
