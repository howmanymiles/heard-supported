import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LOW_CONFIDENCE, normalise } from '@hs/core';
import { requireMe } from '@/lib/auth';
import { getDocumentPages } from '@/lib/cases';

export const dynamic = 'force-dynamic';

type Line = { text: string; confidence: number | null; handwritten: boolean };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string; docId: string }>; searchParams: Promise<{ page?: string; q?: string }> }) {
  const { id, docId } = await params;
  const { page, q } = await searchParams;
  const me = await requireMe();
  const data = await getDocumentPages(me, id, docId);
  if (!data) notFound();
  const target = q ? normalise(q) : '';
  return (
    <div className="stack-lg">
      <p className="crumbs"><Link href={`/cases/${id}`}>← Back to the case</Link></p>
      <div className="head"><h1>{data.doc.name}</h1><p className="soft">Lines the reader was unsure of are marked; check them against the original.</p></div>
      {data.pages.map(p => (
        <section key={p.page_no} id={`p${p.page_no}`} className="panel dpage" aria-label={`Page ${p.page_no}`}>
          <p className="eyebrow">Page {p.page_no}</p>
          {(p.lines as Line[]).map((l, i) => {
            const low = l.confidence !== null && l.confidence < LOW_CONFIDENCE;
            const hit = target && String(p.page_no) === page && normalise(l.text).length > 3 && (target.includes(normalise(l.text)) || normalise(l.text).includes(target));
            return <p key={i} className={`line${low ? ' low' : ''}${hit ? ' hit' : ''}`}>{l.text || ' '}{l.handwritten && <span className="tag">handwritten</span>}{low && <span className="tag tag-warn">check: {Math.round((l.confidence ?? 0) * 100)}%</span>}</p>;
          })}
        </section>
      ))}
    </div>
  );
}
