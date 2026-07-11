import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import BackLink from '@/components/BackLink';
import ThemeToggle from '@/components/ThemeToggle';
import QueryBuilder from '@/components/QueryBuilder';

export default async function ExplorePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-dim text-sm">
        Please sign in to explore data.
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      <div className="flex justify-between items-center mb-6">
        <BackLink />
        <ThemeToggle />
      </div>
      <div className="font-display text-[11px] uppercase tracking-[0.2em] text-gold mb-1">Explore</div>
      <h1 className="font-display text-xl font-bold mb-6">Query builder</h1>
      <QueryBuilder />
    </div>
  );
}
