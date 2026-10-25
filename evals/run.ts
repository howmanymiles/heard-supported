// Runs the synthetic cases through the real extraction pipeline (scrub → model →
// citation check) and scores the result. Needs AI_ENDPOINT and an Azure sign-in
// with the Cognitive Services OpenAI User role. Synthetic data only.
//
//   node run.ts              all cases, evidence stage
//   node run.ts PIP-01 WCA-02
//   node run.ts --mr         PIP cases, reading the PA4 and decision letter
import fs from 'node:fs';
import path from 'node:path';
import { usageTotals, extractEvidence, extractAssessor, extractWcaAssessor, extractResponseReasoning, draftSubmission, renderSubmission, SUBMISSION_REGULATIONS, splitTextPages, parseUkDate, type ExtractionDoc } from '@hs/core';
import { scoreCase, scoreAssessor, scoreWcaAssessor, samePassage, type CaseFile } from './score.ts';

const here = import.meta.dirname;
const casesDir = path.join(here, 'cases');
const args = process.argv.slice(2);
const mrStage = args.includes('--mr');
const appealStage = args.includes('--appeal');
const named = args.filter(a => !a.startsWith('--'));
const ids = (named.length ? named : fs.readdirSync(casesDir).sort())
  .filter(id => !mrStage || fs.existsSync(path.join(casesDir, id, 'mr.json')))
  .filter(id => !appealStage || fs.existsSync(path.join(casesDir, id, 'appeal.json')));
if (!process.env.AI_ENDPOINT) { console.error('Set AI_ENDPOINT (and sign in with az login).'); process.exit(2); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(here, 'results', mrStage ? `${stamp}-mr` : appealStage ? `${stamp}-appeal` : stamp);
fs.mkdirSync(outDir, { recursive: true });

// Prices per million tokens, GBP, Azure Data Zone (EU), October 2026, from the Azure retail prices API.
const PRICES: Record<string, [number, number]> = { 'gpt-4o': [2.1, 8.3], 'gpt-4.1-nano': [0.08, 0.3], 'gpt-4.1-mini': [0.3, 1.3], 'gpt-4.1': [1.7, 6.6] };
/** Print the result line, plus a GitHub annotation so it shows on the workflow run without signing in. */
function report(stage: string, line: string) {
  const model = process.env.EVAL_MODEL ?? process.env.AI_DEPLOYMENT ?? 'unknown';
  const [pin, pout] = PRICES[model] ?? [0, 0];
  const cost = (usageTotals.promptTokens * pin + usageTotals.completionTokens * pout) / 1e6;
  const per = ids.length ? cost / ids.length : 0;
  const usage = `${usageTotals.calls} calls, ${usageTotals.promptTokens.toLocaleString('en-GB')} tokens in, ${usageTotals.completionTokens.toLocaleString('en-GB')} out; about £${cost.toFixed(3)} (£${per.toFixed(4)} a case) at ${model} prices`;
  console.log(usage);
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=${stage} · ${model}::${line.replace(/\n/g, ' ')} | ${usage}`);
}

if (appealStage) {
  // The decision maker's reasoning on each disputed activity, found in the DWP response.
  let found = 0, of = 0, failed = 0;
  for (const id of ids) {
    const a = JSON.parse(fs.readFileSync(path.join(casesDir, id, 'appeal.json'), 'utf8'));
    const pages = splitTextPages(fs.readFileSync(path.join(casesDir, id, 'documents', 'dwp_response.md'), 'utf8'));
    process.stdout.write(`${id} … `);
    try {
      const r = await extractResponseReasoning({ id: 'response', name: 'DWP response', pages }, a.issues.map((i: any) => ({ key: `pip:${i.activity}`, label: `Activity ${i.activity}` })));
      const hits = a.issues.filter((i: any) => { const q = r.reasoning[`pip:${i.activity}`]; return q && q.page === i.dm_reasoning.page && samePassage(q.quote, i.dm_reasoning.quote); }).length;
      found += hits; of += a.issues.length;
      fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify({ hits, of: a.issues.length, result: r }, null, 2));
      console.log(`decision maker's reasoning found for ${hits}/${a.issues.length} issues; ${r.dropped.length} quotes dropped`);
      // The submission letter, from the answer file's facts.
      let n = 0;
      const facts = { stage: 'appeal' as const, benefit: 'pip' as const, summary: `The decision gave ${a.mr_notice.daily_living.points} points for daily living and ${a.mr_notice.mobility.points} points for mobility.`, regulations: SUBMISSION_REGULATIONS.pip,
        issues: a.issues.map((i: any) => ({ key: `pip:${i.activity}`, label: `Activity ${i.activity}`, dwp: `descriptor ${i.activity}${i.dm_letter}`, ours: `descriptor ${i.activity}${i.adviser_letter}`, letters: [`${i.activity}${i.dm_letter}`, `${i.activity}${i.adviser_letter}`],
          decisionMaker: { quote: i.dm_reasoning.quote, where: 'the response' },
          evidence: [...i.evidence.map((e: any) => ({ id: `E${++n}`, quote: e.quote, source: e.doc, where: `page ${e.page}`, agencyNotes: false, inBundle: true })),
                     ...i.not_in_bundle.map((e: any) => ({ id: `E${++n}`, quote: e.quote, source: 'adviser’s interview notes', where: `page ${e.page}`, agencyNotes: true, inBundle: false }))] })) };
      const sub = await draftSubmission(facts);
      const text = renderSubmission(sub, facts, []);
      const kept = [...sub.opening, ...sub.issues.flatMap(x => x.sentences), ...sub.closing];
      const claims = (a.must_not_claim as string[]).filter(c => text.toLowerCase().includes(c.toLowerCase().slice(0, 30)));
      fs.writeFileSync(path.join(outDir, `${id}-submission.json`), JSON.stringify({ kept: kept.length, dropped: sub.dropped, mustNotClaimHits: claims, text }, null, 2));
      console.log(`  submission: ${kept.length} sentences kept (${kept.filter(k => k.argument).length} argument), ${sub.dropped.length} dropped by the checks (${[...new Set(sub.dropped.map(d => d.reason))].join(', ') || 'none'}); must-not-claim hits: ${claims.length}`);
      if (claims.length) failed++;
    } catch (e) { failed++; console.log(`FAILED: ${(e as Error).message}`); }
  }
  console.log(`\nReasoning found ${found}/${of}. Results: ${path.relative(process.cwd(), outDir)}`);
  report('Appeal stage', `Decision maker's reasoning found ${found}/${of}; ${failed} cases failed or claimed what they must not.`);
  process.exit(failed ? 1 : 0);
}

if (mrStage) {
  const rows: any[] = [];
  for (const id of ids) {
    const read = (f: string) => fs.readFileSync(path.join(casesDir, id, 'documents', `${f}.md`), 'utf8');
    const mr = JSON.parse(fs.readFileSync(path.join(casesDir, id, 'mr.json'), 'utf8'));
    if (mr.report) {
      const docs = [
        { id: `${id}/decision`, name: 'decision notice', kind: 'decision' as const, pages: splitTextPages(read('decision')) },
        { id: `${id}/${mr.report.doc}`, name: mr.report.type.toUpperCase(), kind: mr.report.type, pages: splitTextPages(read(mr.report.doc)) },
      ];
      process.stdout.write(`${id} … `);
      try {
        const r = await extractWcaAssessor(docs);
        const s = scoreWcaAssessor(mr, r);
        rows.push({ id, ...s, model: r.model });
        fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify({ score: s, result: r }, null, 2));
        console.log(`findings ${s.lettersCorrect}/${s.of} right, ${s.lettersMissing} left for adviser, ${s.lettersWrong} wrong; date ${s.dateCorrect ? 'right' : 'WRONG/missing'}; award ${s.outcomeCorrect ? 'right' : 'WRONG/missing'}; dropped ${s.dropped}`);
      } catch (e) {
        console.log(`FAILED: ${(e as Error).message}`);
        rows.push({ id, error: (e as Error).message });
      }
      continue;
    }
    const adp = !!mr.determination;
    const docs = [
      { id: `${id}/decision`, name: adp ? 'notice of determination' : 'decision letter', kind: 'decision' as const, pages: splitTextPages(read('decision')) },
      ...(adp && !fs.existsSync(path.join(casesDir, id, 'documents', 'pa4.md')) ? [] : [{ id: `${id}/pa4`, name: adp ? 'consultation report' : 'PA4 assessment report', kind: 'pa4' as const, pages: splitTextPages(read('pa4')) }]),
    ];
    const letterDate = parseUkDate(read('decision').split('\n').find(l => parseUkDate(l)) ?? '');
    process.stdout.write(`${id} … `);
    try {
      const r = await extractAssessor(docs, { scheme: adp ? 'adp' : 'pip' });
      const s = scoreAssessor(mr, r, letterDate, `${id}/pa4`);
      rows.push({ id, ...s, model: r.model });
      fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify({ score: s, result: r }, null, 2));
      console.log(`descriptors ${s.lettersCorrect}/12 right, ${s.lettersMissing} left for adviser, ${s.lettersWrong} wrong; reasons found ${s.justificationsFound}/12; date ${s.dateCorrect ? 'right' : 'WRONG/missing'}; dropped ${s.dropped}`);
    } catch (e) {
      console.log(`FAILED: ${(e as Error).message}`);
      rows.push({ id, error: (e as Error).message });
    }
  }
  const ok = rows.filter(r => !r.error);
  const sum = (k: string) => ok.reduce((n, r) => n + r[k], 0);
  const summary = { at: new Date().toISOString(), stage: 'mr', cases: ids, model: ok[0]?.model ?? null, lettersCorrect: sum('lettersCorrect'), lettersWrong: sum('lettersWrong'), lettersMissing: sum('lettersMissing'), of: ok.reduce((n, r) => n + (r.of ?? 12), 0), justificationsFound: sum('justificationsFound'), datesCorrect: ok.filter(r => r.dateCorrect).length, failed: rows.length - ok.length, rows };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  const mrLine = `Findings right ${summary.lettersCorrect}/${summary.of}, wrong ${summary.lettersWrong} (the number that matters), left for the adviser ${summary.lettersMissing}. PIP reasons found ${summary.justificationsFound}. Dates right ${summary.datesCorrect}/${ok.length}.`;
  console.log(`\n${mrLine}`);
  report('Reconsideration stage', mrLine);
  console.log(`Results: ${path.relative(process.cwd(), outDir)}`);
  process.exit(summary.failed || summary.lettersWrong ? 1 : 0);
}

const scores = [];
for (const id of ids) {
  const c = JSON.parse(fs.readFileSync(path.join(casesDir, id, 'case.json'), 'utf8')) as CaseFile & { documents: Array<{ id: string; file: string; type: string }> };
  const docs: ExtractionDoc[] = c.documents.map(d => ({
    id: `${id}/${d.id}`, name: d.type,
    pages: splitTextPages(fs.readFileSync(path.join(casesDir, id, d.file), 'utf8')),
  }));
  process.stdout.write(`${id} … `);
  const t0 = Date.now();
  try {
    const r = await extractEvidence(c.benefit, docs);
    const s = scoreCase(c, doc => `${id}/${doc}`, r.verified, r.rejected.length, r.gaps);
    scores.push({ ...s, model: r.model, seconds: (Date.now() - t0) / 1000, identifiersRemoved: r.identifiersRemoved });
    fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify({ score: s, result: r }, null, 2));
    console.log(`recall ${(s.recall * 100).toFixed(0)}% (${s.found}/${s.mustFind}), dropped ${s.dropped}/${s.suggested + s.dropped}, noise ${s.noise}`);
  } catch (e) {
    console.log(`FAILED: ${(e as Error).message}`);
    scores.push({ id, error: (e as Error).message });
  }
}

const ok = scores.filter((s: any) => !s.error) as any[];
const sum = (k: string) => ok.reduce((n, s) => n + s[k], 0);
const summary = {
  at: new Date().toISOString(), cases: ids, model: ok[0]?.model ?? null,
  recall: sum('mustFind') ? sum('found') / sum('mustFind') : null,
  found: sum('found'), mustFind: sum('mustFind'), foundWrongActivity: sum('foundWrongActivity'),
  dropRate: sum('suggested') + sum('dropped') ? sum('dropped') / (sum('suggested') + sum('dropped')) : null,
  noise: sum('noise'), failed: scores.length - ok.length, scores,
};
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
const pct = (x: number | null) => x == null ? '—' : `${(x * 100).toFixed(1)}%`;
const evLine = `Overall recall ${pct(summary.recall)} (${summary.found}/${summary.mustFind}); right passage, wrong activity ${summary.foundWrongActivity}; dropped by citation check ${pct(summary.dropRate)}; noise ${summary.noise}.`;
console.log(`\n${evLine}`);
report('Evidence stage', evLine);
console.log(`Results: ${path.relative(process.cwd(), outDir)}`);
if (summary.failed) process.exit(1);
