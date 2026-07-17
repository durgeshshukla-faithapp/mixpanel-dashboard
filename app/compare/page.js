import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getReports } from '@/lib/googleSheets';
import BackLink from '@/components/BackLink';
import ThemeToggle from '@/components/ThemeToggle';
import CompareClient from '@/components/CompareClient';

export const revalidate = 60;

export default async function ComparePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-dim text-sm">
        Please sign in.
      </div>
    );
  }

  const reports = await getReports();

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      <div className="flex justify-between items-center mb-6">
        <BackLink />
        <ThemeToggle />
      </div>
      <div className="font-display text-[11px] uppercase tracking-[0.2em] text-gold mb-1">Compare</div>
      <h1 className="font-display text-xl font-bold mb-6">Cross-report comparison</h1>
      <CompareClient reports={reports} />
    </div>
  );
}
