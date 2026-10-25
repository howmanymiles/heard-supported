# Heard & Supported rules engine

Works an adviser's descriptor selections through the legislation and returns points, rates and flags. It never picks descriptors and never reads evidence: the output is always the adviser's assessment.

All descriptor wording and points come from `data/descriptors.json` (the versioned dataset). Every result records the dataset version it used.

## Run the tests

Needs Node 22.18 or later (runs TypeScript directly, no build step).

```
npm test
```

## What it applies

**PIP (SI 2013/377)**
- reg 7(1)(a)–(c): which descriptor applies from the share of days each is satisfied, including combining descriptors and the tie-break
- regs 5 and 6: component totals, 8 points standard rate, 12 enhanced
- reg 4(2A): flags any of safely, acceptable standard, repeatedly or reasonable time that the evidence doesn't yet address
- Flags descriptors with no frequency recorded

**UC WCA (SI 2013/376)**
- reg 39(5): highest descriptor per Schedule 6 activity counts
- reg 39(3): LCW at 15 points from physical, mental, or both combined
- reg 40(2)(a): LCWRA when at least one Schedule 7 descriptor applies
- Schedules 8 and 9, with the limits in reg 39(7) (Sch 8 paras 4 and 5) and reg 40(6) (Sch 9 para 4)
- Flags the cause condition (reg 39(4)) and the majority-of-time rule (reg 40(4)) for the adviser to check

## Not covered yet

- The required period in reg 7(3) (prospective test). Advisers enter the share of days; the engine doesn't compute the period.
- reg 40(2)(b) and (c) and reg 39(4) are flagged, not decided: they are judgments for the adviser.
- New-style ESA, ADP, and the PIP review and WCA changes. These go in as new dataset versions once the legislation is made.

## Example

```ts
import { assessPip } from './src/engine.ts';
const result = assessPip(data, [
  { activity: 1, satisfied: [{ letter: 'e', daysPercent: 70 }],
    reliability: { safely: true, acceptableStandard: true, repeatedly: false, reasonableTime: true } },
]);
// result.dailyLiving → { points: 4, rate: 'none' }
// result.activities[0].flags → reliability_not_addressed: "…repeatedly"
```
