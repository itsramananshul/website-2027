import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { getPool, transaction } from "../src/lib/intake/database";
import {
  createSubmission,
  updateOwner,
  findOwner,
  requestManagementLink,
} from "../src/lib/intake/service";
import { confirmLegacyAttendance } from "../src/lib/intake/confirmation";
import {
  assertSponsorAccess,
  uploadResume,
  ownerResumeUrl,
  removeResume,
} from "../src/lib/intake/storage";
import { expireOffers, deliverNotifications } from "../src/lib/intake/notifications";
import { saveProject } from "../src/lib/intake/projects";
import { FormError } from "../src/lib/intake/validation";
const connection = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid");
if (
  !["127.0.0.1", "localhost"].includes(connection.hostname) ||
  connection.pathname !== "/revuc_forms_test"
)
  throw new Error(
    "Integration tests require the isolated local revuc_forms_test database. No production database is allowed.",
  );
process.env.APP_PUBLIC_URL = "http://localhost:3001";
process.env.INTAKE_RATE_LIMIT_SECRET = "local-test-only-secret";
const hacker = (email: string) => ({
  firstName: "José",
  lastName: "O’Neil-张",
  email,
  phone: "+15135550123",
  age: 20,
  school: "University of Cincinnati",
  levelOfStudy: "Undergraduate University (3+ year)",
  country: "United States",
  eligible: true,
  mlhCoc: true,
  mlhSharing: true,
});
async function apply(
  email: string,
  kind = "hacker",
  data: Record<string, unknown> = hacker(email),
) {
  await createSubmission({ kind, answers: data, requestId: randomUUID() }, email);
  const result = await getPool().query(
    "SELECT s.*,n.payload FROM form_submissions s JOIN form_notifications n ON n.submission_id=s.id WHERE s.email=$1 AND s.kind=$2 AND n.type='receipt'",
    [email, kind],
  );
  const row = result.rows[0];
  return { id: row.id, token: new URL(row.payload.link).hash.split("token=")[1] };
}
test("registration database workflow", async (t) => {
  const pool = getPool();
  await pool.query(
    "TRUNCATE form_rate_limits,project_intakes,registration_reviews,form_submissions,participants,judges,categories RESTART IDENTITY CASCADE",
  );
  await pool.query(
    "UPDATE registration_events SET registration_open=true,capacity=1,starts_at=now()+interval '3 months',ends_at=now()+interval '3 months 1 day',confirmation_deadline=now()+interval '2 months',slots='[]',details='{}' WHERE id='revuc-2027'",
  );
  await pool.query("INSERT INTO categories(id,name) VALUES('general','General')");
  let first: { id: string; token: string }, second: { id: string; token: string };
  await t.test(
    "duplicate retries save one submission and never overwrite another applicant",
    async () => {
      const id = randomUUID();
      await createSubmission(
        { kind: "hacker", answers: hacker("first@example.com"), requestId: id },
        "ip-a",
      );
      await createSubmission(
        {
          kind: "hacker",
          answers: { ...hacker("first@example.com"), firstName: "Changed" },
          requestId: id,
        },
        "ip-a",
      );
      await createSubmission(
        { kind: "hacker", answers: hacker("first@example.com"), requestId: randomUUID() },
        "ip-a",
      );
      const r = await pool.query(
        "SELECT s.id,s.data,n.payload FROM form_submissions s JOIN form_notifications n ON n.submission_id=s.id WHERE s.email='first@example.com' AND n.type='receipt'",
      );
      assert.equal(r.rows.length, 1);
      assert.equal(r.rows[0].data.firstName, "José");
      first = { id: r.rows[0].id, token: new URL(r.rows[0].payload.link).hash.split("token=")[1] };
      assert.equal((await pool.query("SELECT count(*) FROM participants")).rows[0].count, "0");
    },
  );
  await t.test("owner links are hashed and edits require explicit email verification", async () => {
    const hash = (
      await pool.query("SELECT token_hash FROM form_tokens WHERE submission_id=$1", [first.id])
    ).rows[0].token_hash;
    assert.notEqual(hash, first.token);
    await assert.rejects(
      () => updateOwner(first.token, "save", hacker("first@example.com")),
      (e: unknown) => e instanceof FormError && e.status === 403,
    );
    const view = await transaction((c) => findOwner(c, first.token));
    assert.equal(view.email_verified_at, null);
    assert.equal((await updateOwner(first.token, "verify")).status, "REGISTERED");
    await assert.rejects(() => updateOwner(first.token, "save", hacker("other@example.com")));
  });
  await t.test("concurrent confirmations respect capacity and waitlist", async () => {
    second = await apply("second@example.com");
    await updateOwner(second.token, "verify");
    const responses = await Promise.all([
      updateOwner(first.token, "confirm"),
      updateOwner(second.token, "confirm"),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), ["CONFIRMED", "WAITLISTED"]);
    assert.equal(
      (await pool.query("SELECT count(*) FROM participants WHERE status='CONFIRMED'")).rows[0]
        .count,
      "1",
    );
  });
  await t.test("withdrawal reserves an offer for the next waiting hacker", async () => {
    const confirmed = (await pool.query("SELECT id FROM form_submissions WHERE status='CONFIRMED'"))
      .rows[0].id;
    const waiting = confirmed === first.id ? second : first;
    await updateOwner(confirmed === first.id ? first.token : second.token, "withdraw");
    const offer = (
      await pool.query("SELECT status,offer_expires_at FROM form_submissions WHERE id=$1", [
        waiting.id,
      ])
    ).rows[0];
    assert.equal(offer.status, "REGISTERED");
    assert.ok(offer.offer_expires_at > new Date());
    const third = await apply("third@example.com");
    await updateOwner(third.token, "verify");
    assert.equal((await updateOwner(third.token, "confirm")).status, "WAITLISTED");
    await pool.query(
      "UPDATE form_submissions SET offer_expires_at=now()-interval '1 minute' WHERE id=$1",
      [waiting.id],
    );
    await expireOffers();
    assert.equal(
      (await pool.query("SELECT status FROM form_submissions WHERE id=$1", [waiting.id])).rows[0]
        .status,
      "WAITLISTED",
    );
    assert.equal(
      (await pool.query("SELECT status FROM form_submissions WHERE id=$1", [third.id])).rows[0]
        .status,
      "REGISTERED",
    );
  });
  await t.test("invalid, expired, and revoked management tokens are rejected", async () => {
    await assert.rejects(() => updateOwner(randomBytes(32).toString("base64url"), "verify"));
    await pool.query(
      "UPDATE form_tokens SET expires_at=now()-interval '1 second' WHERE submission_id=$1",
      [first.id],
    );
    await assert.rejects(() => updateOwner(first.token, "verify"));
    const revoked = await apply("revoked@example.com");
    await pool.query("UPDATE form_tokens SET revoked_at=now() WHERE submission_id=$1", [
      revoked.id,
    ]);
    await assert.rejects(() => updateOwner(revoked.token, "verify"));
  });
  await t.test("approval and sponsor-company linkage gate resume access", async () => {
    const sponsor = await apply("sponsor@example.com", "sponsor", {
      contactName: "Sponsor",
      email: "sponsor@example.com",
      organisation: "Company",
      sponsorshipTier: "In-kind support",
      selectedGoals: ["Recruit Top Talent"],
      website: "https://example.com",
    });
    const rep = await apply("rep@example.com", "sponsor-representative", {
      fullName: "Rep",
      email: "rep@example.com",
      phone: "+15135550124",
      organization: "Company",
      coc: true,
      resumeUseAgreement: true,
    });
    await updateOwner(rep.token, "verify");
    await assert.rejects(() => transaction((c) => assertSponsorAccess(c, rep.token)));
    await pool.query(
      "UPDATE form_submissions SET status='APPROVED',email_verified_at=now() WHERE id=$1",
      [sponsor.id],
    );
    await pool.query("UPDATE form_submissions SET status='APPROVED',sponsor_id=$1 WHERE id=$2", [
      sponsor.id,
      rep.id,
    ]);
    assert.equal((await transaction((c) => assertSponsorAccess(c, rep.token))).id, rep.id);
    await pool.query("UPDATE form_submissions SET status='DECLINED' WHERE id=$1", [sponsor.id]);
    await assert.rejects(() => transaction((c) => assertSponsorAccess(c, rep.token)));
  });
  await t.test("legacy confirmation tokens expire and can only be consumed once", async () => {
    const a = await apply("legacy@example.com");
    await updateOwner(a.token, "verify");
    const p = (await pool.query("SELECT participant_id FROM form_submissions WHERE id=$1", [a.id]))
      .rows[0].participant_id;
    const token = randomBytes(32).toString("base64url");
    await pool.query(
      "INSERT INTO confirm_tokens(token,participant_id,email,expires_at) VALUES($1,$2,'legacy@example.com',now()+interval '1 day')",
      [token, p],
    );
    assert.equal((await confirmLegacyAttendance(token, "no", "legacy-ip")).status, "WITHDRAWN");
    await assert.rejects(() => confirmLegacyAttendance(token, "yes", "legacy-ip"));
  });
  await t.test(
    "project submission requires check-in and records rules and actual roster",
    async () => {
      const a = await apply("project@example.com");
      await updateOwner(a.token, "verify");
      const data = {
        name: "Test project",
        description: "Built at the event",
        devpostUrl: "https://devpost.com/software/test",
        githubUrl: "https://github.com/example/project",
        memberEmails: ["project@example.com"],
        githubMembers: ["example"],
        categories: ["general"],
        disclosures: "None",
        rulesAccepted: true,
      };
      await assert.rejects(() => saveProject(a.token, data));
      await pool.query(
        "UPDATE participants SET status='CHECKED_IN',checked_in=true WHERE email='project@example.com'",
      );
      await pool.query(
        "UPDATE registration_events SET details='{" +
          '"projectSubmissionOpen":true,"maxTeamSize":4,"projectRules":"Approved event rules"' +
          "}' WHERE id='revuc-2027'",
      );
      await saveProject(a.token, data);
      const saved = (await pool.query("SELECT data FROM project_intakes WHERE owner_id=$1", [a.id]))
        .rows[0].data;
      assert.equal(saved.rulesNotice, "Approved event rules");
      assert.deepEqual(saved.memberEmails, ["project@example.com"]);
    },
  );
  await t.test(
    "email provider failures leave retryable queued jobs instead of losing notifications",
    async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.RESEND_FROM_EMAIL;
      await deliverNotifications();
      const r = await pool.query(
        "SELECT count(*) FROM form_notifications WHERE attempts=1 AND state='pending' AND last_error IS NOT NULL",
      );
      assert.ok(Number(r.rows[0].count) > 0);
    },
  );
  await t.test(
    "unprivileged database roles cannot read submissions, tokens, or consent history",
    async () => {
      await pool.query(
        "DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='intake_test_reader') THEN CREATE ROLE intake_test_reader; END IF; END $$",
      );
      const client = await pool.connect();
      try {
        await client.query("SET ROLE intake_test_reader");
        for (const table of [
          "form_submissions",
          "form_tokens",
          "form_consents",
          "registration_reviews",
          "project_intakes",
        ])
          await assert.rejects(() => client.query(`SELECT * FROM ${table}`));
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    },
  );
  await t.test("link requests don't reveal registration existence", async () => {
    assert.equal(
      await requestManagementLink("unknown@example.com", "hacker", "link-ip"),
      undefined,
    );
  });
});
test("resume upload, replacement, download, and removal with isolated storage transport", async () => {
  const requests: { method: string; path: string; body: string }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString();
    requests.push({ method: req.method!, path: req.url!, body });
    res.setHeader("Content-Type", "application/json");
    if (req.url?.includes("/object/sign/"))
      res.end(
        JSON.stringify({ signedURL: "/object/sign/revuc-2027-resumes/resume.pdf?token=test" }),
      );
    else if (req.method === "DELETE") res.end("[]");
    else res.end(JSON.stringify({ Key: req.url?.replace("/storage/v1/object/", "") }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_SECRET_KEY = "local-test-only-storage-key";
  try {
    const a = await apply("resume-test@example.com");
    await updateOwner(a.token, "verify");
    const pdf = new File(["%PDF-1.7\nlocal test resume"], "resume.pdf", {
      type: "application/pdf",
    });
    await uploadResume(a.token, pdf);
    const original = (
      await getPool().query("SELECT resume_path FROM form_submissions WHERE id=$1", [a.id])
    ).rows[0].resume_path;
    assert.match(original, /revuc-2027/);
    await uploadResume(a.token, pdf);
    const replaced = (
      await getPool().query("SELECT resume_path FROM form_submissions WHERE id=$1", [a.id])
    ).rows[0].resume_path;
    assert.notEqual(original, replaced);
    assert.equal(
      (
        await getPool().query(
          "SELECT count(*) FROM form_notifications WHERE type='resume-delete' AND payload->>'path'=$1",
          [original],
        )
      ).rows[0].count,
      "1",
    );
    const download = await ownerResumeUrl(a.token);
    assert.match(download.url, /object\/sign\/revuc-2027-resumes/);
    assert.equal(
      JSON.parse(requests.find((r) => r.path.includes("/object/sign/"))!.body).expiresIn,
      60,
    );
    await updateOwner(a.token, "save", {
      ...hacker("resume-test@example.com"),
      sponsorResumeConsent: true,
    });
    await updateOwner(a.token, "withdraw");
    await assert.rejects(() => uploadResume(a.token, pdf));
    await removeResume(a.token);
    assert.equal(
      (await getPool().query("SELECT resume_path FROM form_submissions WHERE id=$1", [a.id]))
        .rows[0].resume_path,
      null,
    );
    const removed = (await getPool().query("SELECT data FROM form_submissions WHERE id=$1", [a.id]))
      .rows[0];
    assert.equal(removed.data.sponsorResumeConsent, false);
    assert.equal(
      (
        await getPool().query(
          "SELECT count(*) FROM form_notifications WHERE submission_id=$1 AND type='consent-withdrawn'",
          [a.id],
        )
      ).rows[0].count,
      "1",
    );
    await deliverNotifications();
    assert.ok(requests.some((r) => r.method === "DELETE" && r.body.includes(original)));
    assert.ok(requests.some((r) => r.method === "DELETE" && r.body.includes(replaced)));
    for (const r of requests.filter(
      (r) => r.method === "POST" && !r.path.includes("/object/sign/"),
    ))
      assert.match(r.path, /\/revuc-2027-resumes\/revuc-2027\//);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  }
});
test("concurrent notification workers claim one job and clear delivered raw tokens", async () => {
  const calls: { key: string; to: unknown }[] = [];
  let reject = false;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    calls.push({ key: String(req.headers["idempotency-key"]), to: body.to });
    res.setHeader("Content-Type", "application/json");
    if (reject) {
      res.statusCode = 429;
      res.end(JSON.stringify({ name: "rate_limit_exceeded", message: "Test failure" }));
    } else res.end(JSON.stringify({ id: randomUUID() }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  process.env.RESEND_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.RESEND_API_KEY = "local-test-only-resend";
  process.env.RESEND_FROM_EMAIL = "forms@example.com";
  try {
    const owner = await apply("outbox-test@example.com");
    const job = (
      await getPool().query(
        "SELECT id FROM form_notifications WHERE submission_id=$1 AND type='receipt'",
        [owner.id],
      )
    ).rows[0].id;
    await getPool().query(
      "UPDATE form_notifications SET available_at=now()+interval '1 day' WHERE state='pending' AND id<>$1",
      [job],
    );
    await Promise.all([deliverNotifications(1), deliverNotifications(1)]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].key, `intake-${job}`);
    const sent = (
      await getPool().query("SELECT state,payload,attempts FROM form_notifications WHERE id=$1", [
        job,
      ])
    ).rows[0];
    assert.equal(sent.state, "sent");
    assert.deepEqual(sent.payload, {});
    assert.equal(sent.attempts, 1);
    await getPool().query(
      "INSERT INTO form_notifications(submission_id,type,payload) VALUES($1,'reminder',$2)",
      [
        owner.id,
        JSON.stringify({ link: `http://localhost:3001/registration#token=${owner.token}` }),
      ],
    );
    reject = true;
    await deliverNotifications(1);
    const retry = (
      await getPool().query(
        "SELECT id,state,attempts FROM form_notifications WHERE submission_id=$1 AND type='reminder'",
        [owner.id],
      )
    ).rows[0];
    assert.equal(retry.state, "pending");
    assert.equal(retry.attempts, 1);
    await getPool().query("UPDATE form_notifications SET available_at=now() WHERE id=$1", [
      retry.id,
    ]);
    reject = false;
    await deliverNotifications(1);
    assert.equal(calls[1].key, calls[2].key);
    assert.equal(
      (await getPool().query("SELECT state FROM form_notifications WHERE id=$1", [retry.id]))
        .rows[0].state,
      "sent",
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.RESEND_BASE_URL;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  }
});
test.after(async () => {
  await getPool().end();
});
