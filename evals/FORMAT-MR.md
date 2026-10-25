# Mandatory reconsideration add-on (PIP cases)

Each PIP case gets two more fictional documents and an answer file for the MR stage. Everything in FORMAT.md still applies (fiction only, page markers, verbatim quotes).

## New documents

- `documents/pa4.md`: the health professional's assessment report (PA4). Realistic structure:
  - page 1: assessment details (date, telephone or face to face, duration, who attended), conditions, history of conditions and medication;
  - then social and occupational history, a typical day, and **informal observations** (how the client presented, sat, moved, interacted);
  - then **one block per activity**: `Activity N: <name>` · `Descriptor chosen: <letter>` · `Justification:` 2–4 sentences the assessor gives;
  - a short summary and "prognosis / review" line.
  Write it in the brisk, templated register these reports use. The assessor should be plausible and partly right.
- `documents/decision.md`: the DWP decision letter (1–2 pages): award or no award for each component, rate, points per activity in a table, and the one-month MR deadline sentence. Points must equal the PA4 descriptors' points from descriptors.json.

## Errors to build in (pick 3–5 per case, realistic, not cartoonish)

- Evidence on file ignored or misread (a measured walk test, an OT finding, a CPN letter)
- Reliability not considered (can do it once, not repeatedly; unsafe; takes over twice as long)
- Informal observation over-relied on ("sat comfortably for 40 minutes", "walked from waiting room without difficulty")
- A "typical day" detail stretched into a conclusion it doesn't support
- An aid or prompting mentioned in the report but no descriptor given for it
- Fluctuation not applied correctly (the 50% rule)

Also keep 1–3 activities where the assessor **is right** and the adviser should not dispute. Not every disagreement is an error.

## mr.json

```json
{
  "id": "PIP-01",
  "pa4": {
    "assessment": { "date": "2026-09-12", "type": "telephone", "duration_minutes": 55 },
    "activities": [
      { "activity": 1, "letter": "a",
        "justification_quote": { "doc": "pa4", "page": 3, "quote": "exact words from the PA4" } }
    ]
  },
  "decision": { "daily_living": { "points": 2, "rate": "none" }, "mobility": { "points": 4, "rate": "none" } },
  "expected_disputes": [
    {
      "activity": 12,
      "adviser_letter": "e",
      "error_type": "evidence_ignored",
      "why": "One or two sentences: what the assessor got wrong.",
      "rebuttal_evidence": [ { "doc": "physio", "page": 2, "quote": "exact words" } ]
    }
  ],
  "agree": [ 7, 8 ],
  "must_not_claim": [ "3–6 things an AI reviewing the PA4 might wrongly assert" ]
}
```

Rules:
- `pa4.activities` lists all 12 activities, letters from descriptors.json.
- `decision` totals must equal the sum of the PA4 descriptors' points; rate: 8+ standard, 12+ enhanced.
- `expected_disputes[].adviser_letter` should match the case's `draft_descriptor` in case.json where that is set. Where case.json's draft is null, you may dispute with the descriptor the MR evidence would support, and say so in `why`.
- `error_type` is one of: `evidence_ignored`, `reliability_not_considered`, `observation_overrelied`, `typical_day_overstretched`, `aid_or_prompting_missed`, `fluctuation_misapplied`, `other`.
- `rebuttal_evidence` quotes come from the existing case documents (not the PA4), verbatim.
- Every activity is either in `expected_disputes` or in `agree`, never both.

Run `python3 -I validate_mr.py cases/PIP-01` until it prints OK.
