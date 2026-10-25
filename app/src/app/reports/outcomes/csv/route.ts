import { requireMe } from '@/lib/auth';
import { outcomeData, summariseOutcomes, outcomesCsv } from '@/lib/outcomes';
import { asAgency, audit } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ok = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

export async function GET(req: Request) {
  const me = await requireMe();
  const u = new URL(req.url);
  const from = ok(u.searchParams.get('from')), to = ok(u.searchParams.get('to'));
  if (!from || !to) return new Response('Give a from and to date.', { status: 400 });
  const withNames = u.searchParams.get('names') === '1';
  const { rows, issues } = await outcomeData(me, from, to);
  const body = outcomesCsv(summariseOutcomes(rows, issues, from, to).cases, withNames);
  await asAgency(me.agencyId, c => audit(c, me.agencyId, me.userId, null, `Outcomes exported ${from} to ${to}${withNames ? ', with client names' : ''}`));
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="outcomes-${from}-to-${to}.csv"`, 'cache-control': 'no-store' } });
}
