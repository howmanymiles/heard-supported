# Heard & Supported synthetic cases

Six fictional cases, each with four documents and an answer file (`case.json`). They serve two purposes: demo material, and the test suite for the AI layer, which must find the `must_find` quotes, raise the listed gaps, and never assert anything in `must_not_claim`.

All drafts are proposals for expert review (`expert_review.status: "draft"`).

## The cases

| Case | Client | What it tests | Draft result (from the rules engine) |
|---|---|---|---|
| PIP-01 Fluctuating fatigue | HS-2001, 40-49, MS | reg 7 share of days, including combining descriptors under 7(1)(c); reliability on bad days | Daily living 6 (no award); mobility 0. Undecided: 2, 6, 12 |
| PIP-02 Depression and social anxiety | HS-2002, 20-29 | Prompting, medication, social support, budgeting conflict, journeys with psychological distress; five genuine no-difficulty activities | Daily living 11 (standard); mobility 12 (enhanced). Undecided: 6 |
| PIP-03 Breathless and unsteady | HS-2003, 60-64, COPD and knee OA | Stated vs measured walking distance (50 m vs 18 m); aids found only in the OT report; repeatability | Daily living 8 (standard); mobility 12 (enhanced). Undecided: 3 |
| PIP-04 Sight loss | HS-2004, 30-39, retinitis pigmentosa | Reading with a magnifier; unfamiliar journeys; cooking safety; keeping issues in the right activity (bills are reading, not budgeting) | Daily living 7 (no award); mobility 10 (standard). Undecided: 2, 6 |
| WCA-01 Back pain and anxiety | HS-3001, 50-59 | Physical and mental points combining near 15; highest descriptor per activity; good days vs bad days; UC50 vs physio conflict | LCW 18 (12 physical, 6 mental); no LCWRA |
| WCA-02 Substantial risk | HS-3002, 30-39, bipolar disorder | Schedule 8 and 9 para 4, including the medication exception; "frequently" vs "majority of the time" | LCW 12 by points, met via Sch 8 para 4; LCWRA via Sch 9 para 4 |

## Points for the expert, by case

**PIP-01**
- Preparing food reaches 1e only by combining descriptors (about 42% + 13%), and the overlap figure rests on the MS nurse's "roughly half". Close to the line by design.
- Moving around is left undecided: bad days alone don't reach 50%.

**PIP-02**
- Dressing is undecided. If prompting on most days were confirmed (6c), daily living moves from 11 to 13, enhanced. The most consequential open point in the set.
- Journeys drafted at 11f, with 11b as the fallback (12 → 4 points).
- 9c relies on her mother being an experienced supporter, which the documents show but don't state in those words.

**PIP-03**
- Daily living reaches 8 only because of a toilet frame fitted on the OT's visit day. Without it, 6.
- Moving around 12e at 70% of days is an estimate from "better days maybe 1 or 2 a week".

**PIP-04**
- Reading drafted at 8b. 8e is not defensible from these documents.
- Journeys left at 11d; 11f is arguable because she uses the cane "nearly always".
- Budgeting and engaging with others carry quotes with status "good" and descriptor a, to test that the AI doesn't misattribute reading problems. You may prefer a different status convention.

**WCA-01**
- Mobilising 1(d) rests on a walk test taken on a self-described good day.
- Standing and sitting drafted at 2(c); 2(b) may be arguable under the combination limb.

**WCA-02**
- Activity 13 deliberately sits on "frequently" (3–4 days a week), not "majority of the time".
- If you accept Schedule 7 descriptor 15(b), LCW is met on points (21) and Schedule 8 para 4 is no longer needed.
- The consultant's opinion doesn't address the least demanding work-related activity; the notes flag that as the weak point.

## Mandatory reconsideration (PIP cases)

Each PIP case also has a PA4 report (`documents/pa4.md`), a decision letter (`documents/decision.md`) and an answer file (`mr.json`, format in FORMAT-MR.md). The answer file lists the activities an adviser should dispute, the type of assessor error, and the evidence that rebuts it, plus the activities where the assessor is right.

| Case | Decision | Adviser's MR position | Challenges (points gained) |
|---|---|---|---|
| PIP-01 | DL 2 none · Mob 0 none | DL 6 none · Mob 4 none | Preparing food a→e (+4, fluctuation misapplied); moving around a→b (+4, typical day stretched) |
| PIP-02 | DL 0 none · Mob 10 standard | DL 11 standard · Mob 12 enhanced | Engaging 9a→c (+4); food, washing, budgeting (+2 each); journeys d→f (+2); medication (+1) |
| PIP-03 | DL 2 none · Mob 4 none | DL 8 standard · Mob 12 enhanced | Moving around b→e (+8, 18 m walk test dismissed); food, toilet, dressing aids (+2 each) |
| PIP-04 | DL 2 none · Mob 0 none | DL 7 none · Mob 10 standard | Journeys a→d (+10); food b→e (+2); reading a→b (+2); medication a→b (+1) |

PIP-01 is a deliberately hard case: even a successful MR on the documents as they stand gives no award, so the right advice is to gather more evidence first.

Open points for the expert: PIP-01 dressing (reasonable time not applied by the assessor, but no scoring descriptor evidenced yet); PIP-02 dressing (6c would make daily living enhanced); PIP-03 toilet frame (rests on the adviser seeing it fitted); PIP-04 medication labels (only three weeks in use at the assessment). The PIP-01 and PIP-02 assessment dates fall in November and December 2026; adjust if you want every case set in the past.

```
python3 -I validate_mr.py     # PA4, decision totals, disputes, verbatim rebuttal quotes
node run-mr.ts                # PA4s through the engine's comparison; checks challenges match
```

## Appeal (PIP-03)

PIP-03 continues to the First-tier Tribunal. Its dates were moved three months earlier so the whole history sits in the past: assessment 16 July 2026, decision 22 July, reconsideration request 12 August, notice 9 September (dressing revised to 6b, everything else refused), appeal lodged 24 September, DWP response 15 October.

New documents: `mr_request.md`, `mr_notice.md`, `sscs1.md`, `dwp_response.md`. The answer file `appeal.json` (format in FORMAT-APPEAL.md) gives the three issues (moving around, preparing food, toilet needs), the decision maker's reasoning to answer, the evidence in DWP's bundle, the evidence that is only in the adviser's notes and has to go in as further evidence, and likely hearing questions.

Points for the expert: the response deliberately leaves weaknesses for the submission to answer; the 80 m shop distance and stopping points were kept out of the MR request and SSCS1, so they reach the tribunal only as further evidence; the agency name "Ashbrae Welfare Rights Service" is invented; the decision maker's paraphrase of reg 4 should be checked against the text.

```
python3 -I validate_appeal.py   # MR notice totals, bundle contents, issues, verbatim quotes
```

## Running the checks

```
python3 -I validate.py        # format, verbatim quotes, valid descriptors
node run-drafts.ts            # drafts through the rules engine (needs ../hs-engine)
```

All invented names (practices, clinicians, hospitals) are fictional; worth a quick check that none matches a real local practice.
