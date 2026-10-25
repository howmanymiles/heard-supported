import Link from 'next/link';

// Our own page, so Next's default (which uses an inline style the security policy blocks) is never shown.
export default function NotFound() {
  return (
    <div className="stack-lg">
      <div className="head"><h1>Page not found</h1></div>
      <p>This page doesn’t exist, or you don’t have access to it.</p>
      <p><Link href="/">Back to your caseload</Link></p>
    </div>
  );
}
