import GoogleProvider from 'next-auth/providers/google';
import { getAllowedSourcesForEmail, getAllowedTagsForEmail, getAllowedDashboardsForEmail } from './googleSheets';

function isSuperAdmin(email) {
  const superAdmin = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
  return superAdmin && (email || '').toLowerCase().trim() === superAdmin;
}

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // SUPER_ADMIN_EMAIL always gets in, even if the Access sheet is broken/misconfigured/empty.
      // This is the "break glass" safety net so you can never lock yourself out by accident.
      if (isSuperAdmin(user.email)) return true;

      try {
        const allowed = await getAllowedSourcesForEmail(user.email);
        if (Array.isArray(allowed) && allowed.length === 0) return false;
        return true;
      } catch (err) {
        // If the Access sheet itself is unreachable, fail closed for everyone except super admin
        return false;
      }
    },
    async session({ session }) {
      if (isSuperAdmin(session.user.email)) {
        session.allowedSources = null;
        session.allowedTags = null;
        session.allowedDashboards = [];
        session.isSuperAdmin = true;
        return session;
      }
      try {
        session.allowedSources = await getAllowedSourcesForEmail(session.user.email);
        session.allowedTags = await getAllowedTagsForEmail(session.user.email);
        session.allowedDashboards = await getAllowedDashboardsForEmail(session.user.email);
      } catch (err) {
        session.allowedSources = [];
        session.allowedTags = [];
        session.allowedDashboards = [];
        session.sheetError = true;
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
};
