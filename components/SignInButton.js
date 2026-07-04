'use client';
import { signIn } from 'next-auth/react';

export default function SignInButton() {
  return (
    <button
      onClick={() => signIn('google')}
      className="bg-accent text-bg font-medium text-sm px-5 py-2.5 rounded-lg hover:opacity-90 transition"
    >
      Sign in with Google
    </button>
  );
}
