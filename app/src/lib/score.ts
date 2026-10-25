import { assessPip, assessWca, type Dataset } from '@hs/engine';
import descriptors from '@hs/engine/descriptors.json' with { type: 'json' };
import type { Benefit } from '@hs/core';
import type { DecisionRow } from './cases.ts';

export const data = descriptors as unknown as Dataset;

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
export function score(benefit: Benefit, decisions: DecisionRow[]) {
  if (benefit === 'pip') {
    const r = assessPip(data, pipInputs(decisions));
    return { kind: 'pip' as const, result: r };
  }
  return { kind: 'wca' as const, result: assessWca(data, wcaInputs(decisions)) };
}

export function descriptorsFor(activityKey: string) {
  const [scheme, n] = activityKey.split(':');
  const num = Number(n);
  if (scheme === 'pip') return data.benefits.find(b => b.id === 'pip')!.activities.find(a => a.number === num)!.descriptors.map(d => ({ id: d.letter!, text: d.text, points: d.points ?? 0 }));
  const w = data.benefits.find(b => b.id === 'uc-wca')!;
  if (scheme === 'sch6') return w.activities.find(a => a.number === num)!.descriptors.map(d => ({ id: d.letter!, text: d.text, points: d.points ?? 0 }));
  return (w.lcwra_activities ?? []).find(a => a.number === num)!.descriptors.map(d => ({ id: d.number!, text: d.text, points: 0 }));
}
