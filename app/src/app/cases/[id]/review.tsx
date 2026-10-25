// What the adviser must check in an AI-drafted letter.
const REASON: Record<string, string> = {
  number_not_in_facts: 'a number not in the evidence it cited', quote_not_in_cited_evidence: 'a quotation not found in the evidence it cited',
  case_law: 'a case law reference', descriptor_not_in_facts: 'a descriptor neither side holds', regulation_not_listed: 'a regulation outside the list',
  unknown_citation: 'a citation to evidence that does not exist', authority_not_in_library: 'case law not in the confirmed library', too_long: 'too long',
};

export function SubmissionReview({ review, stage }: { review: { stage: string; kept: number; argument: string[]; dropped: Array<{ key: string; text: string; reason: string }>; authorities?: Array<{ name: string; citation: string; proposition: string; source_url: string }> } | null; stage: 'mr' | 'appeal' }) {
  if (!review || review.stage !== stage) return null;
  return (
    <div className="stack">
      {review.argument.length > 0 && (
        <details className="panel" open>
          <summary className="eyebrow">Check: {review.argument.length} sentence{review.argument.length > 1 ? 's' : ''} of argument with no citation</summary>
          <ul className="small">{review.argument.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </details>
      )}
      {review.authorities && review.authorities.length > 0 && (
        <details className="panel" open>
          <summary className="eyebrow">Check: {review.authorities.length} authorit{review.authorities.length > 1 ? 'ies' : 'y'} cited, from the confirmed library</summary>
          <ul className="small">{review.authorities.map((a, i) => <li key={i}><b>{a.name} {a.citation}</b>: {a.proposition} <a href={a.source_url} target="_blank" rel="noreferrer">decision</a></li>)}</ul>
        </details>
      )}
      {review.dropped.length > 0 && (
        <details className="panel">
          <summary className="eyebrow">{review.dropped.length} sentence{review.dropped.length > 1 ? 's' : ''} removed by the checks</summary>
          <ul className="small">{review.dropped.map((d, i) => <li key={i}><span className="soft">{REASON[d.reason] ?? d.reason}:</span> {d.text}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
