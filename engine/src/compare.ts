// PIP mandatory reconsideration: compare the assessor's descriptors (PA4 /
// decision letter) with the adviser's evidence-based position.
//
// The engine does not decide who is right. It lines the two positions up,
// works both through the same scoring rules, and lists where they differ,
// ordered by what a successful challenge would be worth.

import { assessPip, InputError, type Dataset, type PipActivity, type PipActivityInput, type Rate, type Flag } from './engine.ts';

export type EvidenceRef = { doc: string; page: number; quote: string };

export type AssessorChoice = {
  activity: number;
  letter: string;
  justification?: EvidenceRef; // the PA4's own words, for the adviser to answer
};

export type ActivityComparison = {
  activity: number;
  name: string;
  component: 'daily_living' | 'mobility';
  assessor: { letter: string; text: string; points: number };
  adviser: { letter: string; text: string; points: number } | null;
  adviserPoints: number; // undecided activities keep the assessor's points
  difference: number; // adviser points minus assessor points
  status: 'agree' | 'challenge' | 'adviser_lower' | 'adviser_undecided';
  justification?: EvidenceRef;
  evidence: EvidenceRef[];
  flags: Flag[];
};

export type ComponentComparison = {
  assessor: { points: number; rate: Rate };
  adviser: { points: number; rate: Rate };
  rateChanges: boolean;
  /** Points still needed under the adviser's position to reach the next rate, if any. */
  pointsToNextRate: number | null;
};

export type PipComparison = {
  datasetVersion: string;
  activities: ActivityComparison[];
  dailyLiving: ComponentComparison;
  mobility: ComponentComparison;
  /** Activities to challenge, highest points gain first: the MR submission's running order. */
  challenges: ActivityComparison[];
  warnings: Flag[];
  note: string;
};

function component(points: number, t: { standard: number; enhanced: number }) {
  return points >= t.enhanced ? 'enhanced' : points >= t.standard ? 'standard' : 'none';
}

export function comparePip(
  data: Dataset,
  assessor: AssessorChoice[],
  adviser: PipActivityInput[],
  evidence: Record<number, EvidenceRef[]> = {},
): PipComparison {
  const pip = data.benefits.find(b => b.id === 'pip');
  if (!pip) throw new InputError('Dataset has no PIP benefit.');
  const acts = pip.activities as PipActivity[];
  const t = pip.thresholds!;

  if (assessor.length !== acts.length || new Set(assessor.map(a => a.activity)).size !== acts.length) {
    throw new InputError('The assessor position must give exactly one descriptor for each of the 12 activities.');
  }

  const adv = assessPip(data, adviser);

  const activities: ActivityComparison[] = acts.map(act => {
    const a = assessor.find(x => x.activity === act.number)!;
    const ad = act.descriptors.find(d => d.letter === a.letter);
    if (!ad) throw new InputError(`Activity ${act.number} has no descriptor "${a.letter}" (assessor).`);
    const input = adviser.find(x => x.activity === act.number);
    const mine = adv.activities.find(r => r.activity === act.number);
    const aPts = ad.points ?? 0;
    const undecided = !input || input.satisfied.length === 0;
    const adviserDesc = undecided ? null : (mine?.descriptor ?? null);
    // Decided but under 50% of days (reg 7): the adviser's position is 0 points.
    const advPts = undecided ? aPts : (adviserDesc?.points ?? 0);
    const diff = advPts - aPts;

    let status: ActivityComparison['status'];
    if (undecided) status = 'adviser_undecided';
    else if (diff > 0) status = 'challenge';
    else if (diff < 0) status = 'adviser_lower';
    else status = 'agree';

    return {
      activity: act.number,
      name: act.name,
      component: act.component,
      assessor: { letter: a.letter, text: ad.text, points: aPts },
      adviser: adviserDesc,
      adviserPoints: advPts,
      difference: diff,
      status,
      justification: a.justification,
      evidence: evidence[act.number] ?? [],
      flags: mine?.flags ?? [],
    };
  });

  const total = (c: 'daily_living' | 'mobility', who: 'assessor' | 'adviser') =>
    activities.filter(x => x.component === c).reduce((s, x) => s + (who === 'assessor' ? x.assessor.points : x.adviserPoints), 0);

  const comp = (c: 'daily_living' | 'mobility'): ComponentComparison => {
    const th = t[c];
    const as = total(c, 'assessor');
    const ad = total(c, 'adviser');
    const next = ad < th.standard ? th.standard - ad : ad < th.enhanced ? th.enhanced - ad : null;
    return {
      assessor: { points: as, rate: component(as, th) },
      adviser: { points: ad, rate: component(ad, th) },
      rateChanges: component(as, th) !== component(ad, th),
      pointsToNextRate: next,
    };
  };

  const warnings: Flag[] = [];
  const lower = activities.filter(x => x.status === 'adviser_lower');
  if (lower.length) {
    warnings.push({
      code: 'award_could_go_down',
      message: `The adviser's position scores lower than the assessor on activity ${lower.map(x => x.activity).join(', ')}. A reconsideration looks at the whole award, so check these before asking for one.`,
    });
  }
  const undecided = activities.filter(x => x.status === 'adviser_undecided');
  if (undecided.length) {
    warnings.push({
      code: 'adviser_position_incomplete',
      message: `No adviser position yet on activity ${undecided.map(x => x.activity).join(', ')}. The adviser totals keep the assessor's points for these.`,
    });
  }
  const noEvidence = activities.filter(x => x.status === 'challenge' && x.evidence.length === 0);
  if (noEvidence.length) {
    warnings.push({
      code: 'challenge_without_evidence',
      message: `Activity ${noEvidence.map(x => x.activity).join(', ')}: challenged with no evidence attached yet.`,
    });
  }

  const challenges = activities
    .filter(x => x.status === 'challenge')
    .sort((a, b) => b.difference - a.difference || a.activity - b.activity);

  return {
    datasetVersion: adv.datasetVersion,
    activities,
    dailyLiving: comp('daily_living'),
    mobility: comp('mobility'),
    challenges,
    warnings,
    note: "Compares the assessor's descriptors with the adviser's. It does not predict the reconsideration decision.",
  };
}
