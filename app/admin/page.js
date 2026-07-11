import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import BackLink from '@/components/BackLink';
import ThemeToggle from '@/components/ThemeToggle';
import AdminPanel from '@/components/AdminPanel';

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  const superAdmin = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
  const isAdmin = session?.user?.email?.toLowerCase().trim() === superAdmin;

  if (!session || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-dim text-sm">
        Admin access only.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-5 py-8">
      <div className="flex justify-between items-center mb-6">
        <BackLink />
        <ThemeToggle />
      </div>
      <div className="font-display text-[11px] uppercase tracking-[0.2em] text-gold mb-1">Admin</div>
      <h1 className="font-display text-xl font-bold mb-6">Manage dashboards &amp; access</h1>
      <AdminPanel />
    </div>
  );
}
