import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTopProperties, getTopPropertyValues, listSavedFunnels } from '@/lib/mixpanelQuery';
import { SOULSENSEI_EVENTS, EVENT_TOP_PROPERTIES } from '@/lib/mixpanelEvents';

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get('kind');

  try {
    if (kind === 'events') {
      // Use pre-loaded list — instant, no API call, no rate limit
      return NextResponse.json({ events: SOULSENSEI_EVENTS, cached: true });
    }
    if (kind === 'properties') {
      const event = searchParams.get('event');
      if (!event) return NextResponse.json({ error: 'Missing event' }, { status: 400 });
      // Try cached first
      const cached = EVENT_TOP_PROPERTIES[event];
      if (cached) return NextResponse.json({ properties: cached, cached: true });
      // Fallback to API
      return NextResponse.json({ properties: await getTopProperties(event) });
    }
    if (kind === 'values') {
      const event = searchParams.get('event');
      const prop = searchParams.get('prop');
      if (!event || !prop) return NextResponse.json({ error: 'Missing event/prop' }, { status: 400 });
      return NextResponse.json({ values: await getTopPropertyValues(event, prop) });
    }
    if (kind === 'funnels') {
      return NextResponse.json({ funnels: await listSavedFunnels() });
    }
    return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
