# Security and data protection

## Current status: synthetic data only

This environment is for development with **fictional** cases. It runs with `DATA_MODE=synthetic-only`, shows a banner on every page, and asks the user to confirm each upload is fictional. Those are reminders, not controls. **No real client's information may be uploaded** until every item below is done.

## What is already in place

- Sign-in with Microsoft Entra ID, single tenant. Sessions last eight hours.
- Every case table is protected by PostgreSQL row-level security on `agency_id`, **forced** so it applies even to the table owner. Tested in CI with a non-superuser.
- Cases hold the agency's reference only: no client names or contact details.
- Managed identity between services. Storage has shared-key access turned off; Document Intelligence has local (key) authentication turned off. Secrets live in Key Vault.
- GitHub deploys with OIDC, limited to jobs in the `dev` environment, with rights only over the one resource group.
- Identifiers are scrubbed before text reaches the AI model; suggested quotes are verified against the source page.
- Audit log of who did what and when (never the content).
- Security headers: HSTS, `X-Frame-Options: DENY`, `no-referrer`, `nosniff`.

## Before any real data

Technical:

1. **Modified abuse monitoring approved by Microsoft** for the Azure OpenAI / Foundry resource, so prompts and outputs are not stored for human review. Apply through Microsoft's form (Microsoft decides eligibility). Record the approval.
2. **Private networking**: database, storage, Key Vault, Document Intelligence and AI reachable only through private endpoints from the app's virtual network; public network access off.
3. **Database**: Entra-only authentication for the app (no password), zone-redundant high availability, backups checked by a restore test.
4. **Storage**: soft delete and versioning; a retention schedule that deletes documents when a case closes.
5. **Logging**: Application Insights and diagnostic logs to a Log Analytics workspace in UK South, with alerts. Confirm no document text reaches logs.
6. **Agency onboarding**: built (sign-up, our approval, invitation-only access tied to the invited email, roles, removal checked on every request). Before the pilot: switch the sign-in app to multi-tenant (`AzureADMultipleOrgs`, `AZURE_AD_TENANT_ID=organizations`) so other agencies' Microsoft accounts can sign in; agree the data processing terms that sign-up accepts; send invitations by email rather than copied links.
7. **Penetration test** by an independent tester, and fixes.
8. **Rotate development secrets**: issue a new sign-in client secret, database password and NextAuth secret, since the development ones have been displayed during setup.
9. **Dependency review**: `npm audit` at each release. Known at the time of writing: advisories in `postcss` (build time only, no user-supplied CSS), `sharp` (image optimisation, not used by the app) and `@azure/msal-node` (affects the authorisation-code flow; the app's sign-in uses next-auth, and MSAL is used only for managed identity). Upgrade when patched releases are available on the versions in use.

Organisational:

- Data protection impact assessment, and ICO registration.
- Data processing agreements with each agency (they are the controllers of their clients' data; Heard & Supported is their processor), and with Microsoft as sub-processor.
- Records of processing, retention policy, breach procedure, subject access procedure.
- Insurance and indemnity in place.
- The website's "How we use AI" page updated with the named provider, the sub-processors and evaluation results.

## Reporting a problem

Use the contact form at heardsupported.co.uk. Please don't open a public issue for a security problem.
