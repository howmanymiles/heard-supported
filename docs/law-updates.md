# Updating the law library

The descriptors, points, scoring rules and thresholds live in `engine/data/descriptors.json`, one entry per benefit (`pip`, `adp`, `uc-wca`). Each entry has a `version` and an `in_force_from` date. Superseded entries are kept in `engine/data/history.json`, so a case is always worked under the law in force on its decision date (`lawFor` in `engine/src/datasets.ts`). Before a case has a decision date, today's law applies.

## When the law changes

1. **Watch.** Check monthly: legislation.gov.uk for the PIP Regulations (SI 2013/377), the UC Regulations (SI 2013/376, Schedules 6 to 9) and the ADP Regulations (SSI 2022/54); DWP and Social Security Scotland announcements; the annual uprating statement; new Upper Tribunal decisions.
2. **Archive the old text.** Copy the benefit's current entry from `descriptors.json` into `history.json`'s `benefits` array, and add `in_force_to`: the day before the new text takes effect.
3. **Transcribe the new text** into `descriptors.json` from the official text on legislation.gov.uk, never from memory or the AI (`engine/scripts/transcribe-adp.py` shows how for ADP). Give the entry a new `version` (for example `pip-2027-04-06`) and set `in_force_from` to the commencement date. Copy the file to `evals/descriptors.json`.
4. **Test.** Run `npm test`. Re-run the fictional cases with known answers and explain any changed result. Add a test that a case decided the day before the change scores under the old text and one decided on the day scores under the new.
5. **Release before the commencement date**, and tell advisers what changed.

Rates (`core/src/rates.ts`) are keyed by benefit year from 6 April and are added each year in the same way. Time limits live in `core/src/deadlines.ts` with their regulation references.

## What the platform shows

Each case page says which version of the law it is worked under. If a decision date is earlier than the oldest text held for that benefit, the platform applies the oldest text but warns the adviser to check the law that applied then. At the time of writing only the current text is held, and it applies from: PIP 16 March 2017, the WCA 29 April 2013, ADP 21 March 2022. These are the earliest dates from which the descriptors, points and rules are the same, checked against legislation.gov.uk's point-in-time versions; later wording-only changes are listed in each entry's `changes_since`. To be confirmed by expert review.
