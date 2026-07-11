'use client';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-7 h-7" />;

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-[11px] hover:border-gold/40 transition font-mono text-dim hover:text-gold"
      title="Toggle theme"
    >
      {theme === 'dark' ? '☾' : '☀'}
    </button>
  );
}
