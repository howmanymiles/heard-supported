// Heard & Supported descriptor rules engine.
//
// Applies the scoring rules in the PIP Regulations 2013 (regs 4–7), the
// Adult Disability Payment Regulations 2022 (SSI 2022/54, regs 7–10), and the
// Universal Credit Regulations 2013 (regs 39–40, Schedules 6–9) to the
// descriptors an ADVISER has selected. It never chooses descriptors itself and
// never reads evidence: its output is the adviser's own assessment, worked
// through the legislation, with flags for anything the rules need that the
// adviser has not recorded.
//
// All descriptor data comes from the versioned dataset (descriptors.json).
// Nothing about points or wording is hard-coded here.

// ---------- Dataset types (the parts the engine reads) ----------

export type Descriptor = { letter?: string; number?: string; text: string; points?: number };
export type PipActivity = {
  component: 'daily_living' | 'mobility';
  number: number;
  number_in_table?: number;
  name: string;
  descriptors: Descriptor[];
};
export type WcaActivity = { schedule: string; part: 'physical' | 'mental'; number: number; name: string; descriptors: Descriptor[] };
export type LcwraActivity = { schedule: string; number: number; name: string; descriptors: Descriptor[] };
export type TreatedAsPara = { schedule: string; para: number; title?: string; text: string; ref: string };

export type Dataset = {
  meta: { compiled: string };
  benefits: Array<{
    id: string;
    version: string;
    in_force_from?: string;   // the date this text became the law
    in_force_to?: string;     // archived versions only: the last day it was the law
    thresholds?: Record<'daily_living' | 'mobility', { standard: number; enhanced: number }>;
    activities: Array<PipActivity | WcaActivity>;
    lcw_threshold?: number;
    lcwra_activities?: LcwraActivity[];
    treated_as_lcw?: TreatedAsPara[];
    treated_as_lcwra?: TreatedAsPara[];
  }>;
};

// ---------- Shared ----------

export type Reliability = {
  safely?: boolean;
  acceptableStandard?: boolean;
  repeatedly?: boolean;
  reasonableTime?: boolean;
};

export type Flag = { code: string; message: string; ref?: string };

export class InputError extends Error {}

const RELIABILITY_LABELS: Array<[keyof Reliability, string]> = [
  ['safely', 'safely'],
  ['acceptableStandard', 'to an acceptable standard'],
  ['repeatedly', 'repeatedly'],
  ['reasonableTime', 'within a reasonable time period'],
];

function benefit(data: Dataset, id: string) {
  const b = data.benefits.find(x => x.id === id);
  if (!b) throw new InputError(`Dataset has no benefit "${id}".`);
  return b;
}

// ---------- PIP ----------

/** One descriptor the adviser considers satisfied, with the share of days in
 * the required period on which it is satisfied (reg 7). Leave daysPercent out
 * if it has not been worked out yet; the engine then treats it as satisfied on
 * over 50% of days and flags that frequency is not recorded. */
export type PipClaimedDescriptor = { letter: string; daysPercent?: number };

export type PipActivityInput = {
  activity: number; // 1–10 daily living, 11–12 mobility
  satisfied: PipClaimedDescriptor[];
  reliability?: Reliability; // which reg 4(2A) criteria the evidence addresses
};

export type PipActivityResult = {
  activity: number;
  name: string;
  component: 'daily_living' | 'mobility';
  descriptor: { letter: string; text: string; points: number } | null;
  points: number;
  basis: string;
  flags: Flag[];
};

export type Rate = 'none' | 'standard' | 'enhanced';

export type PipResult = {
  datasetVersion: string;
  activities: PipActivityResult[];
  dailyLiving: { points: number; rate: Rate };
  mobility: { points: number; rate: Rate };
  undecided: number[];
  note: string;
};

function pipRate(points: number, t: { standard: number; enhanced: number }): Rate {
  if (points >= t.enhanced) return 'enhanced';
  if (points >= t.standard) return 'standard';
  return 'none';
}

/** Apply reg 7(1) to the descriptors claimed for one activity. */
/** Where each rule sits: PIP and ADP have the same rules under different regulation numbers. */
export const PIP_LIKE_REFS = {
  pip: { frequency: 'reg 7(1)', reliability: 'reg 4(2A)' },
  adp: { frequency: 'reg 10(1)', reliability: 'reg 7(2)(b)' },
} as const;
export type PipLike = keyof typeof PIP_LIKE_REFS;

export function applyReg7(
  act: PipActivity,
  claimed: PipClaimedDescriptor[],
  scheme: PipLike = 'pip',
): { descriptor: Descriptor | null; basis: string; flags: Flag[] } {
  const ref = PIP_LIKE_REFS[scheme].frequency;
  const flags: Flag[] = [];
  const rows = claimed.map(c => {
    const d = act.descriptors.find(x => x.letter === c.letter);
    if (!d) throw new InputError(`Activity ${act.number} (${act.name}) has no descriptor "${c.letter}".`);
    if (c.daysPercent !== undefined && (c.daysPercent < 0 || c.daysPercent > 100)) {
      throw new InputError(`daysPercent for ${act.number}${c.letter} must be between 0 and 100.`);
    }
    return { d, pct: c.daysPercent, points: d.points ?? 0 };
  });

  if (rows.length === 0) return { descriptor: null, basis: 'No descriptor selected yet.', flags };

  if (rows.some(r => r.pct === undefined)) {
    flags.push({
      code: 'frequency_not_recorded',
      message: 'How often the descriptor is satisfied is not recorded. It is treated as over 50% of days; check the evidence supports that.',
      ref,
    });
  }
  const pct = (r: { pct?: number }) => (r.pct === undefined ? 100 : r.pct);
  const byPointsThenProportion = (a: typeof rows[number], b: typeof rows[number]) =>
    b.points - a.points || pct(b) - pct(a);

  // (a) and (b): descriptors satisfied on over 50% of days; highest points wins.
  const over50 = rows.filter(r => pct(r) > 50).sort(byPointsThenProportion);
  if (over50.length === 1) return { descriptor: over50[0].d, basis: 'Satisfied on over 50% of days.', flags };
  if (over50.length > 1) {
    return { descriptor: over50[0].d, basis: 'Two or more descriptors satisfied on over 50% of days: the highest scoring applies.', flags };
  }

  // (c): no single descriptor over 50%, but scoring descriptors together exceed 50%.
  const scoring = rows.filter(r => r.points > 0);
  const total = scoring.reduce((s, r) => s + pct(r), 0);
  if (scoring.length >= 2 && total > 50) {
    const pick = [...scoring].sort((a, b) => pct(b) - pct(a) || b.points - a.points)[0];
    return {
      descriptor: pick.d,
      basis: 'No single descriptor over 50% of days, but scoring descriptors together exceed 50%: the one satisfied on the most days applies (highest points if tied).',
      flags,
    };
  }

  flags.push({
    code: 'under_50_percent',
    message: 'No descriptor, alone or combined with others, is satisfied on over 50% of days, so no points score for this activity.',
    ref,
  });
  return { descriptor: null, basis: 'Not satisfied on over 50% of days.', flags };
}

/** PIP, or ADP with scheme 'adp': the same scoring, each from its own descriptor data. */
export function assessPip(data: Dataset, inputs: PipActivityInput[], scheme: PipLike = 'pip'): PipResult {
  const pip = benefit(data, scheme);
  const acts = pip.activities as PipActivity[];
  const seen = new Set<number>();

  const results: PipActivityResult[] = inputs.map(input => {
    const act = acts.find(a => a.number === input.activity);
    if (!act) throw new InputError(`${scheme === 'adp' ? 'ADP' : 'PIP'} has no activity ${input.activity}.`);
    if (seen.has(input.activity)) throw new InputError(`Activity ${input.activity} is listed twice.`);
    seen.add(input.activity);

    const { descriptor, basis, flags } = applyReg7(act, input.satisfied, scheme);

    if (input.satisfied.length > 0) {
      const r = input.reliability ?? {};
      const missing = RELIABILITY_LABELS.filter(([k]) => r[k] !== true).map(([, label]) => label);
      if (missing.length) {
        flags.push({
          code: 'reliability_not_addressed',
          message: `Evidence does not yet show whether the client can do this ${missing.join(', ')}.`,
          ref: PIP_LIKE_REFS[scheme].reliability,
        });
      }
    }

    return {
      activity: act.number,
      name: act.name,
      component: act.component,
      descriptor: descriptor ? { letter: descriptor.letter ?? '', text: descriptor.text, points: descriptor.points ?? 0 } : null,
      points: descriptor?.points ?? 0,
      basis,
      flags,
    };
  });

  const sum = (c: 'daily_living' | 'mobility') => results.filter(r => r.component === c).reduce((s, r) => s + r.points, 0);
  const t = pip.thresholds!;
  const dl = sum('daily_living');
  const mob = sum('mobility');

  return {
    datasetVersion: pip.version,
    activities: results.sort((a, b) => a.activity - b.activity),
    dailyLiving: { points: dl, rate: pipRate(dl, t.daily_living) },
    mobility: { points: mob, rate: pipRate(mob, t.mobility) },
    undecided: acts.map(a => a.number).filter(n => !seen.has(n)),
    note: "Worked from the adviser's selected descriptors. This is the adviser's assessment, not a prediction of the decision.",
  };
}

// ---------- UC Work Capability Assessment ----------

export type WcaInput = {
  /** Schedule 6 descriptors the adviser considers apply: activity number → letters. */
  lcw: Array<{ activity: number; letters: string[] }>;
  /** Schedule 7 descriptors that apply for the majority of the time (reg 40(4)), e.g. "1", "15(a)". */
  lcwra: string[];
  /** Schedule 8 paragraph numbers that apply (treated as LCW). */
  treatedAsLcw?: number[];
  /** Schedule 9 paragraph numbers that apply (treated as LCWRA). */
  treatedAsLcwra?: number[];
};

export type WcaActivityResult = {
  activity: number;
  part: 'physical' | 'mental';
  name: string;
  descriptor: { letter: string; text: string; points: number } | null;
  points: number;
};

export type WcaResult = {
  datasetVersion: string;
  lcw: {
    activities: WcaActivityResult[];
    physicalPoints: number;
    mentalPoints: number;
    totalPoints: number;
    threshold: number;
    byAssessment: boolean;
    treatedAs: Array<{ para: number; title?: string; ref: string; applies: boolean; reason?: string }>;
    result: boolean;
  };
  lcwra: {
    descriptors: Array<{ id: string; activity: number; name: string; text: string }>;
    byAssessment: boolean;
    treatedAs: Array<{ para: number; title?: string; ref: string; applies: boolean; reason?: string }>;
    result: boolean;
  };
  flags: Flag[];
  note: string;
};

export function assessWca(data: Dataset, input: WcaInput): WcaResult {
  const wca = benefit(data, 'uc-wca');
  const sch6 = wca.activities as WcaActivity[];
  const sch7 = wca.lcwra_activities ?? [];
  const flags: Flag[] = [];
  const seen = new Set<number>();

  // LCW: highest scoring descriptor per activity counts (reg 39(5)).
  const lcwActs: WcaActivityResult[] = input.lcw.map(sel => {
    const act = sch6.find(a => a.number === sel.activity);
    if (!act) throw new InputError(`Schedule 6 has no activity ${sel.activity}.`);
    if (seen.has(sel.activity)) throw new InputError(`Schedule 6 activity ${sel.activity} is listed twice.`);
    seen.add(sel.activity);
    const ds = sel.letters.map(l => {
      const d = act.descriptors.find(x => x.letter === l);
      if (!d) throw new InputError(`Schedule 6 activity ${act.number} has no descriptor "${l}".`);
      return d;
    });
    const best = ds.sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];
    return {
      activity: act.number,
      part: act.part,
      name: act.name,
      descriptor: best ? { letter: best.letter ?? '', text: best.text, points: best.points ?? 0 } : null,
      points: best?.points ?? 0,
    };
  });

  const physical = lcwActs.filter(a => a.part === 'physical').reduce((s, a) => s + a.points, 0);
  const mental = lcwActs.filter(a => a.part === 'mental').reduce((s, a) => s + a.points, 0);
  const threshold = wca.lcw_threshold ?? 15;
  // reg 39(3)(a)–(c): 15 from Part 1, from Part 2, or from both combined.
  const lcwByAssessment = physical >= threshold || mental >= threshold || physical + mental >= threshold;

  if (lcwActs.some(a => a.points > 0)) {
    flags.push({
      code: 'cause_condition',
      message: 'Physical descriptors must arise from a specific bodily disease or disablement, mental ones from a specific mental illness or disablement, or from treatment for them. Check the evidence links each one to a condition.',
      ref: 'reg 39(4)',
    });
  }

  // LCWRA: at least one Schedule 7 descriptor (reg 40(2)(a)).
  const lcwraDescs = input.lcwra.map(id => {
    for (const a of sch7) {
      const d = a.descriptors.find(x => x.number === id);
      if (d) return { id, activity: a.number, name: a.name, text: d.text };
    }
    throw new InputError(`Schedule 7 has no descriptor "${id}".`);
  });
  const lcwraByAssessment = lcwraDescs.length > 0;
  if (lcwraByAssessment) {
    flags.push({
      code: 'majority_of_time',
      message: 'A Schedule 7 descriptor applies only if it applies for the majority of the time, or on the majority of occasions the activity is attempted. Check the evidence shows this.',
      ref: 'reg 40(4)',
    });
  }

  // Treated-as provisions, with the "only if not assessed" limits.
  const treat = (paras: TreatedAsPara[] | undefined, chosen: number[], limited: number[], assessed: boolean, limitRef: string) =>
    chosen.map(p => {
      const para = (paras ?? []).find(x => x.para === p);
      if (!para) throw new InputError(`Schedule ${paras?.[0]?.schedule ?? '?'} has no paragraph ${p}.`);
      const blocked = limited.includes(p) && assessed;
      return {
        para: p,
        title: para.title,
        ref: para.ref,
        applies: !blocked,
        reason: blocked ? `Not needed: already met by assessment, and this paragraph only applies otherwise (${limitRef}).` : undefined,
      };
    });

  const lcwTreated = treat(wca.treated_as_lcw, input.treatedAsLcw ?? [], [4, 5], lcwByAssessment, 'reg 39(7)');
  const lcwraTreated = treat(wca.treated_as_lcwra, input.treatedAsLcwra ?? [], [4], lcwraByAssessment, 'reg 40(6)');

  const lcwra = lcwraByAssessment || lcwraTreated.some(t => t.applies);
  if (lcwra && !lcwByAssessment && !lcwTreated.some(t => t.applies)) {
    flags.push({
      code: 'lcwra_without_lcw',
      message: 'LCWRA is indicated but LCW is not. A claimant with LCWRA also has LCW, so check the Schedule 6 selections are complete.',
    });
  }

  return {
    datasetVersion: wca.version,
    lcw: {
      activities: lcwActs.sort((a, b) => a.activity - b.activity),
      physicalPoints: physical,
      mentalPoints: mental,
      totalPoints: physical + mental,
      threshold,
      byAssessment: lcwByAssessment,
      treatedAs: lcwTreated,
      result: lcwByAssessment || lcwTreated.some(t => t.applies) || lcwra,
    },
    lcwra: {
      descriptors: lcwraDescs,
      byAssessment: lcwraByAssessment,
      treatedAs: lcwraTreated,
      result: lcwra,
    },
    flags,
    note: "Worked from the adviser's selected descriptors. This is the adviser's assessment, not a prediction of the decision.",
  };
}
