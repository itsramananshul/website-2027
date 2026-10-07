# Interest form additions

This branch only extends the three existing forms: `/interest`, `/judge-mentor-interest`, and `/sponsor-interest`.

The existing inserts still go to `hacker_interest`, `judge_mentor_interest`, and `sponsor_interest`. After a successful save, the same notification endpoints are called immediately. Their code, Resend templates, sender configuration, organizer recipients, and contact segments are unchanged from main. A notification failure does not ask someone to submit their saved form again.

Added questions are optional. Hacker questions cover profile, study, hackathon experience, skills, workshops, team plans, links, dietary needs, allergies, accessibility, shirt size, and separate resume-sharing and recruiting-contact choices. Judge/mentor questions cover background, role-specific experience, category preferences, conflicts, shift contact, and availability notes. Sponsor questions cover website, contact role, phone, preferred contact method, budget, timeline, and contributions.

The existing age choices and student/non-student choices are preserved. Names accept punctuation and Unicode; phone validation accepts US numbers and international numbers with a country code. School selection works with the keyboard and allows an unlisted school. Other answers and optional links are checked when supplied.

## Supabase

The reviewed SQL is `supabase/interest-form-additions.sql`. It adds `extra_data` to the existing tables, a nullable hacker `resume_path`, and three private details tables: `hacker_interest_details`, `judge_mentor_interest_details`, and `sponsor_interest_details`. An internal trigger copies the new answers into the corresponding details table in the same save transaction. Old inserts without new answers continue to work. Existing records and access policies are preserved; the details tables cannot be read or written by public clients.

The private `revuc-2027-resumes` bucket accepts PDFs up to 4 MB. Uploads use random paths through `/api/resume-upload`, with server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. The form stores the private path with its existing hacker interest record. Failed saves attempt cleanup using a signed upload receipt; cleanup cannot remove a resume already attached to a saved interest record. Files are checked for extension, MIME type, size, and PDF signature. Sponsor sharing choices are recorded for organizers; this branch does not grant sponsor accounts or expose downloads.

The bucket already exists on RevUC-2027. The SQL additions are kept on this review branch; they have not been applied to the live project. Apply the reviewed SQL before deploying this branch. The existing site's mail environment variables remain in use. The resume server key must be set on the hosting project when this code is eventually deployed.

## Verification

`npm test` checks form validation, compatibility of the existing save/notification payloads, unchanged email handler code, and PDF validation/cleanup receipts. `npm run test:integration` uses local mock Supabase and mail transports; it never sends real email or writes live interest records.

For the isolated PostgreSQL schema test, set `REVUC_TEST_CONTAINER` to a local Docker PostgreSQL container and run `npm run test:schema`. The test uses only `revuc_interest_forms_test`, never the live database, and verifies old inserts, new answer persistence, private details tables, and rollback behavior.

No verification emails, RSVP/waitlists, account management, scheduled mail queues, participant conversion, or dashboard changes are included. No production deployment or new PR is part of this work.
