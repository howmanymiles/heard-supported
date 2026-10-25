# Threat model

What Heard & Supported holds, who might want it or misuse it, and what stops them. Reviewed when the system changes in a way that touches client data. Last reviewed October 2026.

## What we hold

| Asset | Why it matters |
|---|---|
| Client identity: name, preferred name, date of birth, agency reference | Identifies a disabled or ill person seeking benefits |
| Benefit papers and evidence: PIP/ADP forms, assessment reports, GP and specialist letters, decision letters | Detailed health and daily-living information: special category data |
| Adviser notes, drafted letters and submissions | The client's account of their life, often more candid than the forms |
| Consent records | Proof of the lawful basis for everything else |
| Audit record | Proof of who did what; needed to answer a breach or a subject access request |
| Sign-in and secrets | Access to all of the above |

## Who might threaten it

1. **Someone outside on the internet**, probing for common web flaws, stolen passwords or exposed services.
2. **A person at one agency** trying to see another agency's clients (curiosity, or a dispute).
3. **A former adviser** whose access should have ended.
4. **An adviser looking at a client they have no reason to** (a neighbour, a relative, someone in the news).
5. **Malicious content in an uploaded document**: text written to steer the AI, or a file crafted to attack whoever opens it.
6. **A compromised dependency or build tool** (supply-chain attack).
7. **Someone with access to our Azure subscription or database** (a stolen admin credential, or an insider) trying to read data or cover their tracks.
8. **The AI provider** storing or reviewing what it is sent.

## What could go wrong, and what stops it

| # | Threat | Controls in place | Still to do |
|---|---|---|---|
| 1 | Stolen or guessed adviser password | MFA required with real data; 30-minute idle and 8-hour session limits; sign-in attempt limits; sign-in only through Microsoft | Confirm MFA detection on a live sign-in |
| 1 | Injected script (XSS) steals a session | React escapes output; nonce-based CSP blocks any script we didn't add; session cookie is HTTP-only | Penetration test |
| 1 | Clickjacking, framing | `frame-ancestors 'none'`, `X-Frame-Options: DENY` | |
| 1 | Direct attack on database, storage or Key Vault | No keys or passwords for storage and AI; firewall on the database; managed identity | Private endpoints, public access off; Entra-only database auth |
| 1 | Mass sign-ups or invitation guessing | Approval of every agency; invitation tokens are long and stored hashed; per-connection limits | Email delivery of invitations |
| 2 | One agency reads another's data | Forced row-level security on every client table, tested as a non-superuser; agency taken from the session, never the request | Penetration test aimed at this |
| 3 | Former adviser keeps access | Access checked on every request; removal immediate; sessions end within 30 minutes idle | |
| 4 | Adviser browses records without reason | Every opening of a client record, case or document is recorded; supervisors and admins can review it per client | Alert on unusual volumes of access or export |
| 5 | Document text steers the AI ("ignore your instructions…") | The AI only suggests quotes; each is checked verbatim against the page; code applies the law; the adviser confirms. The AI has no tools and sees one case at a time | Defender for AI (prompt-injection detection) |
| 5 | Malicious file (e.g. a PDF exploit) | Files are read by Document Intelligence, not by the app; the browser shows extracted text, not the original file | Malware scanning of uploads (Defender for Storage) |
| 6 | Compromised dependency or action | Dependency gate in CI; image scan before push; CodeQL; Dependabot; actions pinned to commits; no package managers in the running image | |
| 7 | Insider or stolen Azure admin reads data | Managed identity; secrets in Key Vault; deploy identity limited to one resource group | Defender for Cloud; alerts on Key Vault and database access; least-privilege review of who holds Azure roles |
| 7 | Audit entries altered to hide misuse | Append-only guards; SHA-256 chain checked on the Team page | Separate migration role (so the app can't lift the guards); daily seal copied to immutable storage |
| 7 | Data destroyed (ransom, mistake) | Database backups (7 days) | Backups 35 days with a restore test; blob soft delete and versioning; Key Vault purge protection |
| 8 | AI provider keeps prompts | Names and identifiers removed before sending; EU Data Zone; no keys | Microsoft's approval for modified abuse monitoring |

## What we accept for now

- **One replica.** Rate limits are counted in memory, which is exact with one running copy of the app. Moving to more replicas means moving the counts to the database.
- **The container registry stays public**, protected by Entra sign-in. Images contain code, not client data; a private registry needs the Premium tier (about £38 a month).
- **No high availability for the database** in the pilot. An outage would stop work but not expose data; backups protect against loss.

## How we'd know something went wrong

- The audit check on the Team page fails.
- Alerts (once set up): repeated failed sign-ins, sign-ins without MFA, Key Vault secret reads by anything other than the app, large exports, Defender findings.
- An agency reports something odd. The breach procedure (to write) covers the 72-hour ICO deadline and telling the agencies, who are the controllers.
