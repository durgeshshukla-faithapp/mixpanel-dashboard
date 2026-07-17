import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { performSync } from '@/lib/sync';

export const maxDuration = 60;

function isSuperAdmin(email) {
  const sa = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
  return sa && (email || '').toLowerCase().trim() === sa;
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !isSuperAdmin(session.user?.email)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    const result = await performSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
