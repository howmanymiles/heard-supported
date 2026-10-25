import Link from 'next/link';

export function CaseTabs({ id, benefit, current }: { id: string; benefit: string; current: 'evidence' | 'mr' | 'appeal' | 'outcome' }) {
  return (
    <nav className="tabs" aria-label="Case stages">
      <Link href={`/cases/${id}`} aria-current={current === 'evidence' ? 'page' : undefined}>Evidence and decisions</Link>
      <Link href={`/cases/${id}/mr`} aria-current={current === 'mr' ? 'page' : undefined}>{benefit === 'adp' ? 'Re-determination' : 'Mandatory reconsideration'}</Link>
      <Link href={`/cases/${id}/appeal`} aria-current={current === 'appeal' ? 'page' : undefined}>Appeal</Link>
      <Link href={`/cases/${id}/outcome`} aria-current={current === 'outcome' ? 'page' : undefined}>Outcome</Link>
    </nav>
  );
}
