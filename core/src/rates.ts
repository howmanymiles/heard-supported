// Benefit rates, for the value of awards gained. Source: DWP, Benefit and pension
// rates 2026 to 2027 (gov.uk), which also gives 2025/26. Add each April's rates here.
// PIP is weekly; the UC amounts are monthly elements of the maximum award.

export type RateYear = '2025-26' | '2026-27';

export const RATES: Record<RateYear, {
  pip: { daily_living: { standard: number; enhanced: number }; mobility: { standard: number; enhanced: number } };
  uc: { lcwra_standard: number; lcwra_protected: number; lcw_legacy: number };
}> = {
  '2025-26': { pip: { daily_living: { standard: 73.90, enhanced: 110.40 }, mobility: { standard: 29.20, enhanced: 77.05 } }, uc: { lcwra_standard: 423.27, lcwra_protected: 423.27, lcw_legacy: 158.76 } },
  '2026-27': { pip: { daily_living: { standard: 76.70, enhanced: 114.60 }, mobility: { standard: 30.30, enhanced: 80.00 } }, uc: { lcwra_standard: 217.26, lcwra_protected: 429.80, lcw_legacy: 158.76 } },
};
export const RATES_SOURCE = 'https://www.gov.uk/government/publications/benefit-and-pension-rates-2026-to-2027';

/** The benefit year (6 April) containing a date; the latest known year for later dates, the earliest for earlier ones. */
export function rateYear(iso: string): RateYear {
  const [y, m, d] = iso.split('-').map(Number);
  const start = m > 4 || (m === 4 && d >= 6) ? y : y - 1;
  const key = `${start}-${String((start + 1) % 100).padStart(2, '0')}` as RateYear;
  const years = Object.keys(RATES).sort() as RateYear[];
  return RATES[key] ? key : key > years[years.length - 1] ? years[years.length - 1] : years[0];
}

export type AwardValue = { daily_living?: string; mobility?: string; wca?: string };
/** UC only: which LCWRA amount applies, and whether the legacy LCW element is in payment. */
export type UcCategory = { lcwra: 'standard' | 'protected' | null; lcwLegacy: boolean };

/** Yearly value of an award at a year's rates: PIP weekly x 52; UC monthly x 12 (maximum: UC is means-tested). */
export function annualValue(benefit: 'pip' | 'adp' | 'uc-wca', a: AwardValue | null, year: RateYear, uc: UcCategory = { lcwra: null, lcwLegacy: false }): number | null {
  if (!a) return null;
  const r = RATES[year];
  // ADP's weekly rates are the same as PIP's (SSI 2022/54 reg 34, as revised for 2026/27).
  if (benefit === 'pip' || benefit === 'adp') {
    const dl = a.daily_living === 'standard' || a.daily_living === 'enhanced' ? r.pip.daily_living[a.daily_living] : 0;
    const mob = a.mobility === 'standard' || a.mobility === 'enhanced' ? r.pip.mobility[a.mobility] : 0;
    return Math.round((dl + mob) * 52 * 100) / 100;
  }
  if (a.wca === 'lcwra') {
    if (!uc.lcwra) return null;                    // the amount depends on the claimant; unknown until recorded
    return Math.round((uc.lcwra === 'protected' ? r.uc.lcwra_protected : r.uc.lcwra_standard) * 12 * 100) / 100;
  }
  if (a.wca === 'lcw') return uc.lcwLegacy ? Math.round(r.uc.lcw_legacy * 12 * 100) / 100 : 0;
  return 0;
}

/** Yearly gain from before to after, or null if either side cannot be valued. */
export function annualGain(benefit: 'pip' | 'adp' | 'uc-wca', before: AwardValue | null, after: AwardValue | null, year: RateYear, uc?: UcCategory): number | null {
  const b = annualValue(benefit, before, year, uc), a = annualValue(benefit, after, year, uc);
  return a === null || b === null ? null : Math.round((a - b) * 100) / 100;
}
