// Activity keys and wording for each benefit, taken from the versioned
// descriptor dataset. Keys: pip:1..pip:12, sch6:1..sch6:17, sch7:1..sch7:16.

import descriptors from '@hs/engine/descriptors.json' with { type: 'json' };

export type Benefit = 'pip' | 'adp' | 'uc-wca';
export type Activity = { key: string; label: string; group: string; descriptors: string[] };

type D = { letter?: string; number?: string; text: string; points?: number };
type A = { number: number; number_in_table?: number; name: string; component?: string; part?: string; descriptors: D[] };
type B = { id: string; version: string; activities: A[]; lcwra_activities?: A[] };

const data = descriptors as unknown as { benefits: B[] };
const benefit = (id: string) => data.benefits.find(b => b.id === id)!;

export function datasetVersion(b: Benefit): string {
  return benefit(b).version;
}

export function activityList(b: Benefit): Activity[] {
  if (b === 'pip' || b === 'adp') {
    // ADP uses PIP's activity keys: the same 12 activities, its own wording.
    return benefit(b).activities.map(a => ({
      key: `pip:${a.number}`,
      label: a.component === 'mobility' ? `Mobility ${a.number_in_table}: ${a.name}` : `Daily living ${a.number}: ${a.name}`,
      group: a.component === 'mobility' ? 'Mobility' : 'Daily living',
      descriptors: a.descriptors.map(d => `${d.letter}. ${d.text} (${d.points} pts)`),
    }));
  }
  const w = benefit('uc-wca');
  return [
    ...w.activities.map(a => ({
      key: `sch6:${a.number}`,
      label: `LCW ${a.number}: ${a.name}`,
      group: a.part === 'mental' ? 'LCW mental' : 'LCW physical',
      descriptors: a.descriptors.map(d => `${d.letter}. ${d.text} (${d.points} pts)`),
    })),
    ...(w.lcwra_activities ?? []).map(a => ({
      key: `sch7:${a.number}`,
      label: `LCWRA ${a.number}: ${a.name}`,
      group: 'LCWRA',
      descriptors: a.descriptors.map(d => `${d.number}. ${d.text}`),
    })),
  ];
}
