'use client';
import { signIn } from 'next-auth/react';

export default function SignInButton() {
  return (
    <button
      onClick={() => signIn('google')}
      className="bg-gold text-bg font-display font-medium text-sm px-5 py-2.5 rounded-md hover:opacity-90 transition"
    >
      Sign in with Google
    </button>
  );
}
