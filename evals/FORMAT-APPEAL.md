# Appeal add-on (PIP-03 first)

Fictional, as everything else. FORMAT.md rules apply (page markers, verbatim quotes).

## Timeline for PIP-03 (fixed)

| Date | Event |
|---|---|
| 16 July 2026 | PA4 assessment (already written) |
| 22 July 2026 | Decision letter (already written) |
| 12 August 2026 | Adviser's mandatory reconsideration request |
| 9 September 2026 | Mandatory reconsideration notice |
| 24 September 2026 | Appeal lodged with HMCTS on form SSCS1 |
| 15 October 2026 | DWP response to the appeal |

## New documents (`documents/`)

- `mr_request.md` (2–3 pages): the adviser's letter asking for reconsideration, written from the disputes in mr.json, citing the evidence on file. Plain, professional, activity by activity.
- `mr_notice.md` (2 pages): DWP's mandatory reconsideration notice. It **revises one activity only: dressing 6a → 6b** (accepts the long-handled shoe horn). Everything else unchanged. New totals: daily living 4 (no award), mobility 4 (no award). States the right of appeal and the one-month time limit.
- `sscs1.md` (2 pages): the appeal form as completed by the adviser: appellant ref, benefit, date of the MR notice, grounds of appeal (activities 1, 5, 12 with descriptors sought and why), hearing preference (face to face; mobility and breathlessness noted), representative details (adviser, agency — fictional).
- `dwp_response.md` (4–6 pages): the decision maker's written response to the appeal, as DWP writes them: a summary of the claim history with dates, the issues under appeal, the law (PIP regs 4, 5, 6, 7; quote no more than a line of each), the decision maker's reasoning on each disputed activity, and a conclusion asking the tribunal to confirm the decision. **It must contain realistic weaknesses**: it repeats the PA4's informal observation of walking 20–30 m as decisive, treats the 18 m walk test as "a single snapshot", says nothing about whether she can walk repeatedly, and describes the perching stool as a preference. It should get at least one thing right (for example that she has no difficulty with activities 7–10).

The adviser's interview notes (`notes.md`) are the agency's own record. **They are not in DWP's bundle.**

## appeal.json

```json
{
  "id": "PIP-03",
  "mr_notice": {
    "date": "2026-09-09",
    "activities": [ { "activity": 1, "letter": "a" } ],          // all 12
    "daily_living": { "points": 4, "rate": "none" }, "mobility": { "points": 4, "rate": "none" }
  },
  "lodged": "2026-09-24",
  "response_date": "2026-10-15",
  "bundle_order": ["dwp_response", "form", "gp", "physio", "pa4", "decision", "mr_request", "mr_notice", "sscs1"],
  "issues": [
    {
      "activity": 12,
      "dm_letter": "b",
      "adviser_letter": "e",
      "dm_reasoning": { "doc": "dwp_response", "page": 3, "quote": "exact words" },
      "rebuttal": "One or two sentences: the answer to the decision maker.",
      "evidence": [ { "doc": "physio", "page": 2, "quote": "exact words" } ],
      "not_in_bundle": [ { "doc": "notes", "page": 1, "quote": "exact words", "why_it_matters": "..." } ],
      "hearing_questions": ["Questions the panel is likely to ask the appellant about this activity"]
    }
  ],
  "agree": [2, 3, 4, 6, 7, 8, 9, 10, 11],
  "must_not_claim": ["3-6 tempting errors for an AI preparing the submission"]
}
```

Rules:
- `issues` are activities 1, 5 and 12 (the disputes the MR didn't resolve). `agree` is everything else. Dressing is now 6b in the MR notice, matching the adviser, so it is agreed.
- `dm_letter` must equal the MR notice letter. `adviser_letter` must match mr.json's dispute letter.
- `evidence` quotes come from documents in the bundle; `not_in_bundle` quotes come from `notes` only.
- 3–5 hearing questions per issue, the kind a tribunal judge or disability member actually asks (specific, about a typical day, not leading).

Run `python3 -I validate_appeal.py cases/PIP-03` until OK, and keep `validate.py` and `validate_mr.py` passing.
