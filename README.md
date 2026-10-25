# Heard & Supported

An adviser-facing tool for welfare rights and advice agencies working PIP and UC Work Capability Assessment cases from claim through mandatory reconsideration to First-tier Tribunal appeal.

It reads the client's documents (including handwriting), suggests passages of evidence for each activity with a citation to the exact page, points out gaps, and works the adviser's descriptor choices through the regulations. **It never chooses descriptors or points.** The adviser decides; the rules engine does the arithmetic.

> **Development build. Fictional data only.** Nothing in this repository or its Azure environment may hold a real person's information until the steps in [SECURITY.md](SECURITY.md) are complete.

## What's here

| Folder | What it is |
|---|---|
| `engine/` | Rules engine: PIP (reg 4(2A), reg 7, 8/12 thresholds) and UC WCA (Schedules 6–9, reg 39/40). Descriptor data from legislation.gov.uk. No AI. |
| `core/` | The AI pipeline: identifier scrubbing → model → citation check. A suggested quote is kept only if it appears word for word on the page it cites. Also Document Intelligence (OCR and handwriting) and page handling. |
| `app/` | Next.js web app for advisers: sign-in with Microsoft Entra ID, cases, document upload, evidence review, decisions, totals, audit log, and the mandatory reconsideration stage for PIP (PA4 and decision letter) and UC WCA (UC85 or UC85A, and the decision notice; Schedules 6 and 7, substantial risk under Schedules 8 and 9): time limits, the DWP's position, comparison, draft request. PostgreSQL with row-level security per agency. |
| `evals/` | Six fictional cases with expected answers, and a harness that scores the real pipeline against them. |
| `infra/` | Azure template (Bicep) and the one-off setup script. |
| `.github/workflows/` | `deploy.yml` tests and deploys on every push to `main`; `evals.yml` runs the evaluation on demand. |

## Azure, at a glance

Everything is in **UK South**, except the AI model, which runs in **Sweden Central** under an EU Data Zone deployment (data stays in the EU; the model choice in UK South is limited).

App Service (Node 22) · PostgreSQL Flexible Server · Blob Storage · Key Vault · Document Intelligence (Read) · Azure AI Foundry model deployment `review-model` · monthly budget alert. Services talk to each other with managed identity; there are no keys in app settings. GitHub signs in to Azure with OIDC, so there is no stored Azure password either.

Expect roughly £30–£50 a month while idle in development. The budget alert emails you at the amount you set.

## Setting it up

You need: an Azure subscription that is **yours, not an employer's**; a GitHub account; this repository on GitHub.

1. **Open Azure Cloud Shell** at <https://shell.azure.com> and choose Bash.
2. **Sign in to GitHub** from Cloud Shell so the script can set the secrets for you:
   ```bash
   gh auth login
   ```
3. **Get the code and run the setup script** (once):
   ```bash
   git clone https://github.com/howmanymiles/heard-supported.git
   cd heard-supported
   bash infra/bootstrap.sh howmanymiles/heard-supported you@example.org
   ```
   It asks you to confirm the subscription, then creates the resource group, the deploy identity, the sign-in app and the secrets. When it lists the available models, pick a current GPT model offered as DataZoneStandard.
4. **Deploy.** In GitHub, go to Actions → Deploy → Run workflow (or push any commit to `main`). The first run takes about 15 minutes, mostly the database.
5. **Sign in** at the address the workflow prints (`https://hs-dev-xxxxxx.azurewebsites.net`). The first person to sign in becomes the admin of the development agency.
6. **Try it.** Load one of the fictional test cases from the home page, press *Read and review*, and work through the suggestions.

### Running the evaluation

Actions → Evals → Run workflow. Leave *cases* blank for all six, or name some (`PIP-01 WCA-02`). Results are attached to the run as `eval-results`: recall against the expected evidence, how many suggestions the citation check dropped, and suggestions on activities where nothing should have been found.

## Working on it locally

Node 22.18 or later.

```bash
npm install
npm test                    # engine, core, evals scoring, app
npm run typecheck -w app
npm run build -w app
```

To try the app locally without Azure, `DATABASE_URL=... node app/scripts/seed-dev.ts` creates a fictional PIP case at the reconsideration stage.

The database tests run when `TEST_DATABASE_URL` points at a disposable PostgreSQL database, connected as a **non-superuser** (superusers bypass row-level security). CI does this with a PostgreSQL service container.

To run the app locally against Azure, copy `app/.env.example` to `app/.env.local`, fill it in, sign in with `az login`, and run `npm run dev -w app`.

## How the AI is kept honest

- **Identifiers removed first.** Names after labels, NI and NHS numbers, dates of birth, phone numbers, emails and postcodes are replaced before any text reaches the model.
- **Quotes are checked.** Every suggested passage must appear word for word on the cited page (allowing for curly quotes, dashes, line breaks and case). Anything else is dropped and counted.
- **No scoring by the model.** The model is told not to suggest descriptors or points, and the app never asks it to. Totals come only from the adviser's choices, through the rules engine.
- **Documents are data.** The model is told to treat anything in a document that looks like an instruction as content, not as an instruction.
- **The DWP's position is read, not guessed.** At reconsideration the model only points to where a finding is written in the decision letter, PA4, UC85 or UC85A. The code checks the quote is on that page and matches it to the regulations' wording to get the letter; anything it can't match is left for the adviser, who confirms all twelve. The draft request is assembled from confirmed facts, with no AI-written text.
- **Low-confidence reading is shown.** Lines Document Intelligence was unsure of, and handwritten lines, are marked in the document viewer so the adviser checks them against the original.
