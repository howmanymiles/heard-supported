import { requireMe } from '@/lib/auth';
import { outcomeData, byArea, trendAndAreaData, areasCsv } from '@/lib/outcomes';
import { asAgency, audit } from '@/lib/db';

export const dynamic = 'force-dynamic';
const ok = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

export async function GET(req: Request) {
  const me = await requireMe();
  const u = new URL(req.url);
  const from = ok(u.searchParams.get('from')), to = ok(u.searchParams.get('to'));
  if (!from || !to) return new Response('Give a from and to date.', { status: 400 });
  const level = u.searchParams.get('level') === 'area' ? 'area' : 'district';
  const [{ rows }, { open }] = await Promise.all([outcomeData(me, from, to), trendAndAreaData(me, from, to)]);
  const body = areasCsv(byArea(rows, open, from, to, level), level);
  await asAgency(me.agencyId, c => audit(c, me.agencyId, me.userId, null, `Figures by area exported ${from} to ${to}`));
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="areas-${level}-${from}-to-${to}.csv"`, 'cache-control': 'no-store' } });
}
