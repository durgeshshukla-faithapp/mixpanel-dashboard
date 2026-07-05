import GoogleProvider from 'next-auth/providers/google';
import { getAllowedSourcesForEmail, getAllowedTagsForEmail } from './googleSheets';

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Only allow emails listed in the "Access" sheet
      const allowed = await getAllowedSourcesForEmail(user.email);
      // allowed === [] means the email was not found at all -> block sign-in
      if (Array.isArray(allowed) && allowed.length === 0) {
        return false;
      }
      return true;
    },
    async session({ session }) {
      session.allowedSources = await getAllowedSourcesForEmail(session.user.email);
      session.allowedTags = await getAllowedTagsForEmail(session.user.email);
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
};
