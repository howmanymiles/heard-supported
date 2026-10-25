import './globals.css';
import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions, type Me } from '@/lib/auth';

export const metadata: Metadata = { title: 'Heard & Supported', robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = (await getServerSession(authOptions)) as { me?: Me } | null;
  const synthetic = process.env.DATA_MODE === 'synthetic-only';
  return (
    <html lang="en-GB">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        {synthetic && <section className="banner" aria-label="Environment notice"><div className="wrap">Development environment. <strong>Fictional test data only</strong>: never upload a real client’s documents.</div></section>}
        <header className="appbar">
          <div className="wrap">
            <a className="brand" href="/">
              <svg width="26" height="26" viewBox="0 0 34 34" aria-hidden="true"><circle cx="13" cy="17" r="11" fill="none" stroke="currentColor" className="ring-a" strokeWidth="3" /><circle cx="21" cy="17" r="11" fill="none" stroke="currentColor" strokeWidth="3" /></svg>
              Heard &amp; Supported
            </a>
            {s?.me && <nav className="who" aria-label="Account"><a href="/">Cases</a><a href="/clients">Clients</a><a href="/reports">Reports</a><a href="/team">Team</a><span>{s.me.name}</span><a href="/api/auth/signout">Sign out</a></nav>}
          </div>
        </header>
        <main id="main" className="wrap page">{children}</main>
      </body>
    </html>
  );
}
