// Bundles the synthetic test cases' documents (not their answer files) so the
// app can load them as demo cases. Runs before dev and build.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../evals/cases');
const out = [];
for (const id of fs.readdirSync(root).sort()) {
  const c = JSON.parse(fs.readFileSync(path.join(root, id, 'case.json'), 'utf8'));
  const names = Object.fromEntries(c.documents.map(d => [path.basename(d.file), d.type]));
  const docs = fs.readdirSync(path.join(root, id, 'documents')).sort().map(f => ({
    name: `${id} ${(names[f] ?? f.replace('.md', '')).replace(/_/g, ' ')}.md`,
    text: fs.readFileSync(path.join(root, id, 'documents', f), 'utf8'),
  }));
  // Claim-stage documents only: the PA4, decision and appeal papers belong to later stages.
  const claimDocs = docs.filter(d => !/ (pa4|uc85|uc85a|decision|mr request|mr notice|sscs1|dwp response)\.md$/.test(d.name));
  // The MR papers, loaded separately on the reconsideration page.
  const paperName = { pa4: 'PA4 assessment report', uc85: 'UC85 assessment report', uc85a: 'UC85A paper-based assessment', decision: c.benefit === 'pip' ? 'decision letter' : 'decision notice' };
  const mrDocs = ['pa4', 'uc85', 'uc85a', 'decision']
    .filter(f => fs.existsSync(path.join(root, id, 'documents', `${f}.md`)))
    .map(f => ({ name: `${id} ${paperName[f]}.md`, kind: f, text: fs.readFileSync(path.join(root, id, 'documents', `${f}.md`), 'utf8') }));
  // Appeal papers: the MR notice, and the DWP response bundle assembled in the
  // order given in appeal.json, numbered consecutively as bundles are.
  const appealDocs = [];
  const appealFile = path.join(root, id, 'appeal.json');
  if (fs.existsSync(appealFile)) {
    const a = JSON.parse(fs.readFileSync(appealFile, 'utf8'));
    const read = f => fs.readFileSync(path.join(root, id, 'documents', `${f}.md`), 'utf8');
    appealDocs.push({ name: `${id} MR notice.md`, kind: 'mr_notice', text: read('mr_notice') });
    let n = 0;
    const bundlePages = a.bundle_order.flatMap(f => read(f).split(/^--- Page \d+ ---\s*$/m).map(t => t.trim()).filter(Boolean))
      .map(t => `${t}\n\nPage ${++n}`);
    appealDocs.push({ name: `${id} DWP response bundle.md`, kind: 'dwp_bundle', text: bundlePages.map((t, i) => (i ? `--- Page ${i + 1} ---\n` : '') + t).join('\n\n') });
  }
  out.push({ id, benefit: c.benefit, title: c.title, docs: claimDocs, mrDocs, appealDocs });
}
const target = path.resolve(import.meta.dirname, '../src/data/synthetic.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(out));
console.log(`Bundled ${out.length} synthetic cases.`);
