# Security and data protection

## Current status: fictional data only

The live environment runs with `DATA_MODE=synthetic-only`. It shows a banner on every page and asks for each upload to be confirmed as fictional. Those are reminders, not controls. **No real client's information may be uploaded** until everything under "Before any real data" is done.

Heard & Supported now holds a client's **name, preferred name and date of birth** (with their consent recorded first), alongside their benefit papers, evidence, and the adviser's notes. That is special category data (health) about people who are often vulnerable. The standard has to match.

## What is in place

**Who can get in**
- Sign-in with Microsoft Entra ID work accounts. The app is built for any organisation's accounts (multi-tenant); the live environment is still limited to our own tenant until the switch in item 11 below. Getting in needs an invitation from the agency's admin, tied to the invited email address. New agencies sign up and are approved by us first.
- **Multi-factor sign-in is required** whenever real data is allowed. Microsoft reports how the person signed in (the `amr` claim); a password-only sign-in is refused. The Team page shows, for each person, whether their last sign-in used a second step.
- Sessions end after **30 minutes without activity** and **8 hours** after signing in, whichever comes first.
- Access is checked on every request: removing someone, or suspending an agency, takes effect immediately.
- Roles: adviser, supervisor, admin.

**Keeping agencies apart**
- Every table holding client or case data has PostgreSQL row-level security on `agency_id`, **forced** so it applies to the table owner too. Tested in CI as a non-superuser.

**The client's consent**
- Consent is recorded before the client record exists, in one transaction. Without consent to keep their information, no record is created.
- The AI is used only while the client's consent to AI help stands. Withdrawn consent stops the AI and any new uploads.
- The client's names are removed from every page before the AI sees it, along with National Insurance numbers, phone numbers, emails, postcodes and dates of birth.

**The AI**
- Azure AI Foundry in an EU Data Zone; no keys (managed identity only).
- The AI only points: every quote it suggests is checked word for word against the page. The engine's code applies the descriptors and the law; the adviser confirms. Text in an uploaded document that tries to instruct the AI can at worst produce a suggestion the adviser rejects; it cannot change a decision, a record or another case.
- Use is limited per adviser (40 steps an hour) and per agency (400 a day).

**The audit record**
- Every change is recorded, and so is every time someone opens a client's record, a case or a document. Admins and supervisors can see "Who has used this record" for any client, which answers a subject access request about access.
- The record is **append-only** (the database refuses updates and deletions) and **tamper-evident**: each entry is sealed with a SHA-256 hash of its content and the entry before. Admins see the result of a full check on the Team page.
- Exports (CSV) are recorded, including whether they included names.

**The web application**
- Content Security Policy with a fresh nonce on every response: only the scripts Next.js adds can run. No inline script, no `eval`, no framing (`frame-ancestors 'none'`), forms post only to us and Microsoft sign-in.
- HSTS, `nosniff`, `no-referrer`, `Cache-Control: no-store`.
- Limits on sign-in attempts (30 per 10 minutes per connection), agency sign-up (5 an hour) and invitation links (20 an hour).
- Our own error pages, which show no details.

**Services and secrets**
- Managed identity between services; in Azure the app uses only its own identity. Storage has shared-key access off; Document Intelligence and the AI have key authentication off. Remaining secrets live in Key Vault and reach the app as Key Vault references.
- GitHub deploys with OIDC (no stored password), limited to the `dev` environment, with rights over one resource group.

**What we ship**
- CI fails on any high or critical advisory in production dependencies, unless accepted in `scripts/audit-gate.mjs` with a reason and a review date.
- The container image is scanned (Grype) before it is pushed; fixable high or critical findings stop the deploy. The running image has security updates applied and no package managers.
- CodeQL (security-extended) on every push and weekly; Dependabot weekly; every GitHub Action pinned to a commit.

### Accepted risks

| Advisory | Why it doesn't apply | Review |
|---|---|---|
| GHSA-xcx6-jx8p-x3h5, `@azure/msal-node` | Affects MSAL's authorisation-code flow, which the app never uses (sign-in is next-auth; MSAL is used only for managed identity). The fix needs msal-node 7.1, which `@azure/identity` doesn't accept yet. | 31 January 2027 |

## Before any real data

Infrastructure (costed in the plan below; each needs a go-ahead):

1. **Private networking.** Database, storage, Key Vault, Document Intelligence and the AI reachable only through private endpoints from the app's virtual network; public access off.
2. **Database.** Entra-only authentication (no password). A separate role for migrations, so the app's own role cannot switch off the audit guards. Backups kept 35 days, with a restore tested.
3. **Storage.** Soft delete and versioning for documents. An immutable (write-once) container that receives each day's last audit seal, so even someone with full database control can't rewrite the audit record unnoticed.
4. **Key Vault.** Purge protection on, 90-day soft delete.
5. **Logging and alerts.** Diagnostic logs from every service to Log Analytics in UK South; alerts for failed sign-ins, Key Vault access, unusual exports and audit check failures. Confirm no document text reaches logs.
6. **Microsoft Defender for Cloud** on storage (with malware scanning of uploads), the database, Key Vault and the AI.
7. **Rotate the development secrets** (the sign-in client secret, database password and NextAuth secret have been displayed during setup), and set the client secret to expire within 6 months.
8. **Modified abuse monitoring approved by Microsoft** for the AI resource, so prompts and outputs aren't stored for human review. Microsoft decides eligibility; record the approval.

Application:

9. Retention and erasure: delete a closed case's documents on the agency's schedule; erase a client on request (keeping the audit entries, which hold no content).
10. Subject access export: everything held about a client, as one download.
11. Switch the sign-in app registration to multi-tenant (`AzureADMultipleOrgs`, `AZURE_AD_TENANT_ID=organizations`) so other agencies can sign in; send invitations by email rather than as copied links.
12. Confirm MFA detection with a live sign-in: the Team page should show "With a second step" for an account that used one.

Assurance and organisational:

13. **Independent penetration test**, and fixes.
14. **Cyber Essentials** (Plus preferably). Councils and Citizens Advice will ask.
15. Data protection impact assessment, and ICO registration.
16. Data processing agreements with each agency (they are the controllers; Heard & Supported is their processor), and with Microsoft as sub-processor.
17. Records of processing, retention policy, breach procedure (72 hours to the ICO), subject access procedure.
18. Insurance (cyber and professional indemnity).
19. The website's "How we use AI" page names the provider, the sub-processors and the evaluation results.

## Costed infrastructure plan

Azure list prices for UK South in GBP, October 2026, excluding VAT, from the Azure retail prices API. Monthly at pilot volumes.

| Change | Monthly | Notes |
|---|---|---|
| 1. Private networking: virtual network, 5 private endpoints, 5 private DNS zones | ~£30 | £0.0075 an hour per endpoint. The Container Apps environment has to be recreated inside the network: new app address, sign-in redirect updated, about 30 minutes' downtime |
| 2. Database: Entra-only auth, separate migration role, 35-day backups, restore test | ~£0–3 | Backup storage up to the database size is included |
| 3. Storage: soft delete, versioning, immutable audit-seal container | under £1 | £0.0145 per GB a month |
| 4. Key Vault: purge protection, 90-day soft delete | £0 | Purge protection can't be turned off once on |
| 5. Logging and alerts | ~£10–15 | £2.17 per GB ingested; 2–4 GB a month expected |
| 6. Defender for Cloud: storage with malware scanning, PostgreSQL, Key Vault, Resource Manager, AI | ~£25–30 | Storage £7.40, PostgreSQL £11.32, Resource Manager £3.80, Key Vault £0.22, malware scan £0.11 per GB, AI about £6 per 10 million tokens |
| 7. Secret rotation and expiry | £0 | |
| **Core total** | **~£70 a month** | about £840 a year |
| Optional: database high availability (General Purpose, zone-redundant) | +~£215 | Availability, not confidentiality |
| Optional: Front Door with WAF custom rules | +~£32 | Edge rate limiting and UK-only access; managed rule sets need Premium (£249) |
| Optional: private container registry (Premium) | +~£34 | Images hold code, not client data |

One-off (estimates, not quoted): independent penetration test £3,000–£6,000; Cyber Essentials about £320, Cyber Essentials Plus £1,500–£2,500; ICO registration fee.

See `docs/threat-model.md` for what each control is defending against.

## Reporting a problem

Use the contact form at heardsupported.co.uk. Please don't open a public issue for a security problem.
