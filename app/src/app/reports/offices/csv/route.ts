import { requireMe } from '@/lib/auth';
import { outcomeData, byOffice, trendAndOfficeData, officesCsv } from '@/lib/outcomes';
import { asAgency, audit } from '@/lib/db';

export const dynamic = 'force-dynamic';
const ok = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

export async function GET(req: Request) {
  const me = await requireMe();
  const u = new URL(req.url);
  const from = ok(u.searchParams.get('from')), to = ok(u.searchParams.get('to'));
  if (!from || !to) return new Response('Give a from and to date.', { status: 400 });
  const [{ rows }, { open }] = await Promise.all([outcomeData(me, from, to), trendAndOfficeData(me, from, to)]);
  const body = officesCsv(byOffice(rows, open, from, to));
  await asAgency(me.agencyId, c => audit(c, me.agencyId, me.userId, null, `Figures by office exported ${from} to ${to}`));
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="offices-${from}-to-${to}.csv"`, 'cache-control': 'no-store' } });
}
