import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { addReport, addAccess, getReports, getAccessList } from '@/lib/googleSheets';

function isSuperAdmin(session) {
  const superAdmin = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
  return superAdmin && session?.user?.email?.toLowerCase().trim() === superAdmin;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSuperAdmin(session)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const [reports, access] = await Promise.all([getReports(), getAccessList()]);
    return NextResponse.json({ reports, access });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSuperAdmin(session)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  try {
    if (body.kind === 'report') {
      const { name, link } = body;
      if (!name || !link) return NextResponse.json({ error: 'Name and link are required' }, { status: 400 });
      await addReport(body);
      return NextResponse.json({ ok: true });
    }
    if (body.kind === 'access') {
      const { email } = body;
      if (!email || !email.includes('@')) return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
      await addAccess(body);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
  } catch (err) {
    // Most common failure: service account only has Viewer access on the Sheet
    const hint = /permission/i.test(err.message)
      ? ' — make sure the service account email is shared on the Sheet as EDITOR, not just Viewer.'
      : '';
    return NextResponse.json({ error: err.message + hint }, { status: 500 });
  }
}
