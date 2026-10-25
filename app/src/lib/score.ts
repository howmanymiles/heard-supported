import { assessPip, assessWca, lawFor, type Dataset } from '@hs/engine';
import descriptors from '@hs/engine/descriptors.json' with { type: 'json' };
import type { Benefit } from '@hs/core';
import type { DecisionRow } from './cases.ts';

/** The current law library. Casework uses lawForCase, which picks the version in force at the decision date. */
export const data = descriptors as unknown as Dataset;

const iso = (d: unknown): string | null => {
  if (!d) return null;
  if (d instanceof Date) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(String(d)) ? String(d).slice(0, 10) : null;
};

/** The law a case is worked under: the version in force on its decision date, or today's before there is one. */
export function lawForCase(benefit: string, decisionDate?: unknown) {
  return lawFor(benefit === 'uc-wca' ? 'uc-wca' : benefit === 'adp' ? 'adp' : 'pip', iso(decisionDate));
}

/** The adviser's PIP decisions in the engine's input shape. */
export function pipInputs(decisions: DecisionRow[]) {
  return decisions.filter(d => d.activity.startsWith('pip:') && Array.isArray(d.satisfied) && d.satisfied.length)
    .map(d => ({ activity: Number(d.activity.split(':')[1]), satisfied: d.satisfied as Array<{ letter: string; daysPercent?: number }> }));
}

/** The adviser's WCA decisions in the engine's input shape, including substantial risk (Sch 8 / Sch 9 para 4). */
export function wcaInputs(decisions: DecisionRow[]) {
  const lcw = decisions.filter(d => d.activity.startsWith('sch6:') && Array.isArray(d.satisfied) && d.satisfied.length)
    .map(d => ({ activity: Number(d.activity.split(':')[1]), letters: (d.satisfied as Array<{ letter: string }>).map(s => s.letter) }));
  const lcwra = decisions.filter(d => d.activity.startsWith('sch7:')).flatMap(d => d.satisfied as string[]);
  const risk = (k: string) => (decisions.find(d => d.activity === k)?.satisfied as string[] | undefined)?.[0] === 'applies' ? [4] : [];
  return { lcw, lcwra, treatedAsLcw: risk('sch8:4'), treatedAsLcwra: risk('sch9:4') };
}

/** Works the adviser's decisions through the regulations. Never chooses anything itself. */
export function score(benefit: Benefit, decisions: DecisionRow[], decisionDate?: unknown) {
  const law = lawForCase(benefit, decisionDate).data;
  if (benefit === 'pip' || benefit === 'adp') {
    const r = assessPip(law, pipInputs(decisions), benefit);
    return { kind: 'pip' as const, result: r };
  }
  return { kind: 'wca' as const, result: assessWca(law, wcaInputs(decisions)) };
}

export function descriptorsFor(activityKey: string, benefit: string = 'pip', decisionDate?: unknown) {
  const data = lawForCase(benefit === 'adp' ? 'adp' : activityKey.startsWith('pip:') ? 'pip' : 'uc-wca', decisionDate).data;
  const [scheme, n] = activityKey.split(':');
  const num = Number(n);
  if (scheme === 'pip') return data.benefits.find(b => b.id === (benefit === 'adp' ? 'adp' : 'pip'))!.activities.find(a => a.number === num)!.descriptors.map(d => ({ id: d.letter!, text: d.text, points: d.points ?? 0 }));
  const w = data.benefits.find(b => b.id === 'uc-wca')!;
  if (scheme === 'sch6') return w.activities.find(a => a.number === num)!.descriptors.map(d => ({ id: d.letter!, text: d.text, points: d.points ?? 0 }));
  return (w.lcwra_activities ?? []).find(a => a.number === num)!.descriptors.map(d => ({ id: d.number!, text: d.text, points: 0 }));
}

/** After a decision date is set or changed: record which version of the law the case is now worked under. */
export async function syncLawVersion(c: { query: (q: string, p: unknown[]) => Promise<{ rows: any[] }> }, caseId: string) {
  const cs = (await c.query('select benefit, decision_date from cases where id = $1', [caseId])).rows[0];
  if (!cs) return;
  await c.query('update cases set dataset_version = $2 where id = $1', [caseId, lawForCase(cs.benefit, cs.decision_date).version]);
}
