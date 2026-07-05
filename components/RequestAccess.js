export default function RequestAccess({ dashboardName }) {
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!adminEmail) return null;
  const subject = encodeURIComponent(`Access request: ${dashboardName || 'dashboard'}`);
  return (
    <a
      href={`mailto:${adminEmail}?subject=${subject}`}
      className="text-accent text-sm hover:underline"
    >
      Request access
    </a>
  );
}
