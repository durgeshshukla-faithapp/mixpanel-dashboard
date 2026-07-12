import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { performSync } from '@/lib/sync';

export const maxDuration = 60;

export async function POST() {
  const session = await getServerSession(authOptions);
  const superAdmin = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
  if (!session || session.user.email?.toLowerCase().trim() !== superAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  try {
    const result = await performSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
