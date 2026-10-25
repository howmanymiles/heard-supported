// The words that differ between the DWP benefits and Adult Disability Payment, in one place.
// ADP is assessed on the same 12 activities as PIP, so it shares PIP's activity keys
// (pip:1 … pip:12) and code paths; its descriptor wording comes from its own dataset.

import type { Benefit } from './activities.ts';

export const isPipLike = (b: string): b is 'pip' | 'adp' => b === 'pip' || b === 'adp';

export type Terms = {
  name: string;               // Personal Independence Payment
  short: string;              // PIP
  agency: string;             // the DWP
  agencyFull: string;         // the Department for Work and Pensions
  mr: string;                 // mandatory reconsideration
  mrShort: string;            // MR
  mrNotice: string;           // mandatory reconsideration notice
  decision: string;           // decision letter
  report: string;             // PA4 assessment report
  bundle: string;             // DWP response bundle
  tribunal: string;           // First-tier Tribunal (Social Entitlement Chamber)
  claimant: string;           // the claimant
  regs: string;               // the PIP Regulations 2013
  reliabilityRef: string;     // reg 4(2A)
  frequencyRef: string;       // reg 7
};

export const TERMS: Record<Benefit, Terms> = {
  pip: {
    name: 'Personal Independence Payment', short: 'PIP', agency: 'the DWP', agencyFull: 'the Department for Work and Pensions',
    mr: 'mandatory reconsideration', mrShort: 'MR', mrNotice: 'mandatory reconsideration notice', decision: 'decision letter',
    report: 'PA4 assessment report', bundle: 'DWP response bundle', tribunal: 'First-tier Tribunal (Social Entitlement Chamber)',
    claimant: 'the claimant', regs: 'the Social Security (Personal Independence Payment) Regulations 2013', reliabilityRef: 'regulation 4(2A)', frequencyRef: 'regulation 7',
  },
  adp: {
    name: 'Adult Disability Payment', short: 'ADP', agency: 'Social Security Scotland', agencyFull: 'Social Security Scotland, for the Scottish Ministers',
    mr: 're-determination', mrShort: 're-determination', mrNotice: 'notice of re-determination', decision: 'notice of determination',
    report: 'consultation report', bundle: 'Social Security Scotland’s appeal papers', tribunal: 'First-tier Tribunal for Scotland (Social Security Chamber)',
    claimant: 'the client', regs: 'the Disability Assistance for Working Age People (Scotland) Regulations 2022', reliabilityRef: 'regulation 7(2)(b)', frequencyRef: 'regulation 10',
  },
  'uc-wca': {
    name: 'Universal Credit, Work Capability Assessment', short: 'UC WCA', agency: 'the DWP', agencyFull: 'the Department for Work and Pensions',
    mr: 'mandatory reconsideration', mrShort: 'MR', mrNotice: 'mandatory reconsideration notice', decision: 'decision letter',
    report: 'healthcare professional’s report (UC85 or UC85A)', bundle: 'DWP response bundle', tribunal: 'First-tier Tribunal (Social Entitlement Chamber)',
    claimant: 'the claimant', regs: 'the Universal Credit Regulations 2013', reliabilityRef: 'regulation 39', frequencyRef: 'regulation 40',
  },
};

export const terms = (b: string): Terms => TERMS[(b in TERMS ? b : 'pip') as Benefit];
export const BENEFITS: Benefit[] = ['pip', 'adp', 'uc-wca'];

/** A benefit from a form or query string; anything unknown is PIP. */
export const parseBenefit = (v: unknown): Benefit => (v === 'uc-wca' ? 'uc-wca' : v === 'adp' ? 'adp' : 'pip');
