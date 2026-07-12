import { NextResponse } from 'next/server';
import { performSync } from '@/lib/sync';

export const maxDuration = 60; // Vercel Hobby (with Fluid Compute) allows up to 60s

export async function GET(req) {
  // Vercel's own cron sends this automatically. For an external cron service
  // (e.g. cron-job.org) for more frequent syncs than Hobby's 1/day limit,
  // configure it to call this URL with ?secret=YOUR_CRON_SECRET instead.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get('authorization');
    const urlSecret = new URL(req.url).searchParams.get('secret');
    const isVercelCron = authHeader === `Bearer ${secret}`;
    const isExternalCron = urlSecret === secret;
    if (!isVercelCron && !isExternalCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await performSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
