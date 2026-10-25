import Link from 'next/link';
import { requireMe } from '@/lib/auth';
import { CONSENT_STATEMENT } from '@/lib/claimants';
import { NewClientForm } from '../forms';

export const dynamic = 'force-dynamic';

export default async function NewClient() {
  await requireMe();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="stack-lg">
      <p className="crumbs"><Link href="/clients">← Clients</Link></p>
      <div className="head"><h1>New client</h1><p className="soft">Consent comes first. Nothing is saved until you have recorded it.</p></div>
      <NewClientForm statement={CONSENT_STATEMENT} today={today} />
    </div>
  );
}
