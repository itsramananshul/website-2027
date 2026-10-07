# RevUC 2027 registration

The public website and dashboard use the same **dedicated 2027 PostgreSQL database**. The website accepts applications through server handlers. The dashboard owns the Drizzle migrations and staff review. Do not point either application at the 2026 database.

## Setup

1. Merge the linked dashboard schema change and run its migrations on a development database first. Back up an existing 2027 database before applying the migrations there. Do not use `drizzle-kit push` to replace an existing schema.
2. Set the website's `DATABASE_URL` to the same 2027 database as the dashboard. Use a trusted server database role that can access the tables despite RLS. Never expose this connection string to browser code.
3. Configure `APP_PUBLIC_URL` with the website's HTTPS origin and the dashboard's `WEBSITE_URL` with that same origin. In local development use website port 3001 and dashboard port 3002. The deployment proxy must overwrite `x-forwarded-for`; email and token rate limits also apply.
4. Generate separate random secrets for `INTAKE_RATE_LIMIT_SECRET` and `CRON_SECRET`. Keep all database, storage, and mail credentials server-only.
5. Configure `RESEND_API_KEY`, a verified `RESEND_FROM_EMAIL`, and the organizer recipient lists in `.env.example`. Sponsor and judge/mentor lists fall back only to their own configured recipients. Applicant details are reviewed in the dashboard, rather than being copied into organizer emails.
6. Configure server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` for private resumes. The database migration creates `revuc-2027-resumes` when applied to Supabase. On a plain PostgreSQL database, create this private bucket in the separate storage project: PDFs only, 4 MB maximum, **not public**, and no anonymous or authenticated read/write policies. Never use a public URL for these files. The trusted server performs uploads and issues 60-second download URLs after checking permissions.
7. Set the GitHub repository variable `INTAKE_WEBSITE_URL` to the website HTTPS origin and repository secret `INTAKE_CRON_SECRET` to the server's `CRON_SECRET`. The included workflow requests `/api/intake/notifications` every 15 minutes and can be dispatched manually. GitHub schedules can be delayed. For more immediate delivery, use the hosting platform's scheduler or a worker with the same authenticated endpoint. Only one scheduler is needed. Each request processes up to 20 jobs; adjust frequency for expected registration volume and provider limits.
8. An approved lead or admin opens **Registration → 2027 event settings** in the dashboard. Set the actual dates, timezone, capacity, RSVP deadline, and dated role availability slots. Registration starts closed. Add only approved waiver, media, expense, privacy, and retention wording. Optional emergency/travel questions are off unless enabled. Set approved project rules and team size before opening project submissions during the event.

No live database migrations, storage changes, email deliveries, or production deployments were performed while preparing this branch.

## Applicant flow

- `/interest` collects name and email, with optional school/referral. It does not reserve attendance. Verified interest applicants receive a one-time registration announcement when registration is opened. Their email link can prefill `/register`.
- `/register` collects the full hacker form. Students must be at least 18 at the event. MLH conduct and administration agreements are required; marketing, sponsor resume sharing, sponsor recruiting contact, and media permission are independent opt-ins. The pending MLH partnership notice remains visible until an approved lead confirms the partnership in event settings. MLH export is blocked until then; the notice shown is retained with each agreement snapshot.
- `/registration#token=...` is a private email link. It is removed from the address bar and kept in that tab's session storage. Opening it reads the application; applicants must click **Verify my email** before editing, uploading, or confirming. Links expire after 30 days and can be requested again. A shared computer user should choose **Use a different application link** when finished.
- Verified hackers become dashboard participants. A collision with a pre-existing participant is handled by an organizer using **Link existing participant**, matching exactly the same email. Public submissions never overwrite an existing record. Duplicate submissions receive the same neutral response; the applicant can request a new management link.
- RSVP explicitly moves a hacker to confirmed or waitlisted. Confirmed hackers see their check-in QR. Withdrawal retains the record, releases its place, and offers it to the next waiting verified hacker. An offer reserves a place for 24 hours or until the confirmation deadline. Expired offers return to the back of the waitlist. Staff status changes and QR check-in use the same capacity lock and update the linked application.
- `/confirm` supports earlier dashboard attendance links and new fragment-based links. GET does not consume the token. Saving a response checks expiry and consumes all outstanding confirmation tokens for that participant. New dashboard confirmation tokens are stored as hashes; existing raw tokens are accepted until expiry.
- Judge/mentor, volunteer, speaker, sponsor, and sponsor-representative applications need email verification and organizer review. Applying does not create a dashboard account. Approval links expose the later logistics/onboarding fields. Role assignments, follow-up dates, private notes, and role check-in are managed by approved leads/admins.

## Resumes and privacy

Applicants can upload, replace, download, or remove a PDF. Removing it immediately removes it from the application; the worker deletes the private storage object. Replacement queues removal of the old object. Removal/download remain available after withdrawal, while new uploads are blocked. Removal also revokes sponsor resume sharing, records that decision, and queues an organizer notice about downloaded copies.

Only verified, approved sponsor representatives linked by an organizer to an approved sponsor company can load the resume book. It includes only opted-in resumes from confirmed or checked-in hackers. Recruiting email addresses appear only under the separate contact opt-in. Food, access, emergency-contact, and demographic answers are excluded. Revoking consent stops new access immediately and notifies the organizer to coordinate deletion of any already-downloaded copies. Previously issued download URLs can remain valid for up to 60 seconds.

Staff MLH, logistics, and role exports are restricted to approved leads/admins and escape spreadsheet formulas. MLH export keeps the eight core fields and agreement answers; attendance counts stay separate from interest and verification. Consent history stores the answers, wording, event, version, and timestamp. Leads should agree on the real retention period, enter the notice, and include database backups and private object deletion in their retention process. The code does not invent a retention policy or automatically publish profiles.

Project submissions are separate from initial registration and available only to verified, checked-in hackers when enabled. They include the project details, demo/source/Devpost links, prize categories, actual team registration emails, GitHub usernames, and rule disclosures. The dashboard flags missing verification/check-in, people on multiple rosters, and identity differences from organizer-recorded Devpost/GitHub rosters. Organizers link the existing Devpost-imported project and record how differences were resolved. No count mismatch automatically disqualifies a team.

## Delivery and failure handling

Submission, consent, and email job inserts commit together. The UI says the form is saved and email is queued, not that a provider delivered it. A synchronous submit guard and request UUID prevent repeat clicks/retries from creating duplicate applications. Database rate limits and a honeypot limit public form abuse. Removed legacy notification endpoints return 410 and cannot be used to send arbitrary emails.

The worker leases jobs with `FOR UPDATE SKIP LOCKED`, retries failures up to eight attempts, and uses a stable provider idempotency key. Raw management links are cleared from delivered job payloads. Jobs at the retry limit show as failed in the dashboard; a lead can retry after fixing the provider configuration. Delivery is at least once, subject to the provider's idempotency window, so an unusually delayed worker recovery may repeat a notification. Queued storage cleanup works independently of mail configuration. Keep the outbox and token tables private in backups and administration tools.

## Local checks

Use the dashboard's local database setup in its registration guide. The integration tests refuse any non-loopback database host or database name other than `revuc_forms_test`; they reset that disposable database's form fixtures.

```powershell
npm ci
npm test
$env:DATABASE_URL='postgres://revuc:revuc_local@127.0.0.1:55437/revuc_forms_test'
npm run test:integration
npx tsc --noEmit
npm run lint
npm run build
```

Integration tests cover duplicate submissions, explicit verification, hashed tokens, concurrent capacity checks, waitlist offers/expiry, sponsor permissions, legacy confirmation, project rules, restricted database reads, PDF storage transport, replacement/removal, concurrent worker leases, and delivery retries. Storage and email transport tests use local mock servers, never real providers. The actual production Supabase policies, provider sender, secrets, and approved event settings must be configured before opening registration.

Validation on this branch: unit and isolated PostgreSQL/storage/mail integration tests pass; typecheck, lint, and the production build pass. Lint retains two existing warnings. Browser checks covered keyboard school selection, validation focus, duplicate-submit protection, optional consent defaults, all form pages on mobile, and the private verify/edit/RSVP/QR flow.
