# Synthetic case format

Every case is fictional. No real person, practice, address or NHS number. Clients are identified by a case reference only.

## Folder

```
cases/<CASE-ID>/
  case.json            expected answers (the test oracle)
  documents/<doc>.md   one file per document
```

## Documents

Plain Markdown. Pages are separated by a line that is exactly:

```
--- Page 2 ---
```

Page 1 needs no marker. Write each document in its real register:
- **form**: the client's own words, first person, plain and sometimes vague or minimising (people often describe their best days). For PIP use the PIP2 question structure ("Q3 Preparing food"); for UC use UC50 headings.
- **gp**: a short GP summary letter: diagnoses, medication, referrals, brief functional comments. Clinical, terse.
- **specialist / OT / physio / CPN letter**: functional detail, sometimes measurements.
- **notes**: adviser interview notes, third person, abbreviated, often the richest source.

Documents should disagree sometimes, leave things out, and include irrelevant detail, as real files do. Never exaggerate to make a case look stronger.

## case.json

```json
{
  "id": "PIP-01",
  "benefit": "pip",                       // "pip" or "uc-wca"
  "title": "Fluctuating fatigue",
  "summary": "Two or three sentences for a reviewer.",
  "exercises": ["reg 7 share of days", "reliability: repeatedly"],
  "client": { "ref": "HS-2001", "age_band": "40-49", "living": "Lives alone", "conditions_in_documents": ["..."] },
  "documents": [ { "id": "form", "file": "documents/form.md", "type": "form", "pages": 3 } ],
  "activities": [
    {
      "key": "pip:1",                     // PIP: "pip:1".."pip:12" (12 = moving around)
                                          // WCA: "sch6:1".."sch6:17", "sch7:1".."sch7:16"
      "evidence_status": "partial",       // good | partial | conflict | not_on_form | nodiff
      "must_find": [ { "doc": "notes", "page": 1, "quote": "exact words from that page" } ],
      "gaps": ["What a good reviewer should point out is missing"],
      "draft_descriptor": { "satisfied": [ { "letter": "e", "daysPercent": 70 } ] },
      "draft_note": "Why, in one line."
    }
  ],
  "treated_as": { "sch8": [], "sch9": [] },   // WCA only: paragraph numbers a reviewer should consider
  "must_not_claim": ["Facts an AI might invent that are NOT in the documents"],
  "expert_review": { "status": "draft", "notes": "" }
}
```

Rules:
- **Every PIP case lists all 12 activities.** WCA cases list all 17 Schedule 6 activities and only the Schedule 7 descriptors that are in play.
- `must_find` quotes are copied **exactly** from the stated page, 4–30 words.
- `nodiff` activities have empty `must_find` and `draft_descriptor: null`.
- `draft_descriptor` uses real descriptor letters (PIP) or letters (Sch 6). For Sch 7 use `{ "satisfied": ["15(a)"] }`. Use `null` where the evidence doesn't support choosing one yet.
- Drafts are proposals for the expert to confirm; they must be defensible from the documents alone.
- `must_not_claim` lists 3–6 tempting inventions (a diagnosis not given, a distance not stated, an aid not mentioned, a frequency not recorded).

Run `python3 -I validate.py cases/<CASE-ID>` until it prints OK.
