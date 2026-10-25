// Which version of the law applies. A case is worked under the law in force on its
// decision date (or today, before there is a decision). The current text lives in
// descriptors.json; superseded versions are kept in history.json with the dates they
// applied. See docs/law-updates.md.

import current from '../data/descriptors.json' with { type: 'json' };
import history from '../data/history.json' with { type: 'json' };
import type { Dataset } from './engine.ts';

type Entry = Dataset['benefits'][number];

export type LawVersion = {
  /** A dataset with this benefit's entry replaced by the version in force, ready for the engine. */
  data: Dataset;
  benefit: string;
  version: string;
  inForceFrom: string | null;
  inForceTo: string | null;
  current: boolean;
  /** False when the date is before the earliest version held: the oldest text we have is used, and the adviser should be told. */
  covered: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

/** The law for one benefit on a date. Pass other versions for tests. */
export function lawFor(benefit: string, onDate?: string | null, sources: { current: Dataset; history: { benefits: Entry[] } } = { current: current as unknown as Dataset, history: history as unknown as { benefits: Entry[] } }): LawVersion {
  const date = onDate && /^\d{4}-\d{2}-\d{2}/.test(onDate) ? onDate.slice(0, 10) : today();
  const cur = sources.current.benefits.find(b => b.id === benefit);
  if (!cur) throw new Error(`No law held for ${benefit}.`);
  const versions = [cur, ...sources.history.benefits.filter(b => b.id === benefit)]
    .sort((a, b) => (b.in_force_from ?? '').localeCompare(a.in_force_from ?? ''));   // newest first
  const hit = versions.find(v => !v.in_force_from || v.in_force_from <= date);
  const pick = hit ?? versions[versions.length - 1];
  const data: Dataset = { ...sources.current, benefits: sources.current.benefits.map(b => (b.id === benefit ? pick : b)) };
  return { data, benefit, version: pick.version, inForceFrom: pick.in_force_from ?? null, inForceTo: pick.in_force_to ?? null, current: pick === cur, covered: !!hit };
}
