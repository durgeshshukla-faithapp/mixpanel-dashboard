'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export default function BackLink() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick(e) {
    e.preventDefault();
    startTransition(() => router.push('/'));
  }

  return (
    <a
      href="/"
      onClick={handleClick}
      className="text-xs text-dim hover:text-accent inline-flex items-center gap-1.5"
    >
      {isPending ? (
        <span className="w-3 h-3 border-2 border-dim border-t-transparent rounded-full animate-spin" />
      ) : (
        <span>&larr;</span>
      )}
      Dashboards
    </a>
  );
}
