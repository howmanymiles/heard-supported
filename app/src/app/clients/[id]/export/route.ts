import { requireMe } from '@/lib/auth';
import { exportClient } from '@/lib/sar';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found.', { status: 404 });
  let out;
  try { out = await exportClient(me, id); } catch (e) { return new Response(e instanceof Error ? e.message : 'Something went wrong.', { status: 403 }); }
  if (!out) return new Response('Not found.', { status: 404 });
  return new Response(new Uint8Array(out.data), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${out.filename}"`, 'cache-control': 'no-store' } });
}
