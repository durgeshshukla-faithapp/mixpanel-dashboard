import './globals.css';
import Providers from '@/components/Providers';

export const metadata = {
  title: 'Mixpanel Dashboards',
  description: 'Internal analytics dashboards',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
