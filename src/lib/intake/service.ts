import { createHash, createHmac, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import QRCode from "qrcode";
import { EVENT_ID, type Answers, type EventSettings, type FormKind } from "./definitions";
import { getPool, transaction } from "./database";
import { FormError, submissionEnvelope, validateAnswers } from "./validation";
import { consentSnapshot } from "./consents";
export type Submission = {
  id: string;
  event_id: string;
  kind: FormKind;
  email: string;
  data: Answers;
  status: string;
  email_verified_at: Date | null;
  participant_id: string | null;
  judge_id: string | null;
  sponsor_id: string | null;
  resume_path: string | null;
  offer_expires_at: Date | null;
  qr_base64?: string | null;
};
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export function publicUrl() {
  const url = new URL(process.env.APP_PUBLIC_URL ?? "http://localhost:3000");
  if (
    process.env.NODE_ENV === "production" &&
    (url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new Error("APP_PUBLIC_URL must be the public HTTPS website.");
  return url.origin;
}
export function mapEvent(row: Record<string, unknown>): EventSettings {
  const date = (value: unknown) => (value ? new Date(String(value)).toISOString() : null);
  return {
    id: String(row.id),
    year: Number(row.year),
    registrationOpen: row.registration_open === true,
    capacity: row.capacity === null ? null : Number(row.capacity),
    startsAt: date(row.starts_at),
    endsAt: date(row.ends_at),
    confirmationDeadline: date(row.confirmation_deadline),
    timezone: String(row.timezone),
    slots: row.slots as EventSettings["slots"],
    details: row.details as EventSettings["details"],
  };
}
export async function getEvent(client?: PoolClient, lock = false) {
  const result = await (client ?? getPool()).query(
    "SELECT * FROM registration_events WHERE id=$1" + (lock ? " FOR UPDATE" : ""),
    [EVENT_ID],
  );
  if (!result.rows[0]) throw new Error("2027 event configuration is missing.");
  return mapEvent(result.rows[0]);
}
export async function rateLimit(
  client: PoolClient,
  scope: string,
  identifier: string,
  maximum: number,
) {
  if (!process.env.INTAKE_RATE_LIMIT_SECRET)
    throw new Error("Intake rate limiting is not configured.");
  const key = createHmac("sha256", process.env.INTAKE_RATE_LIMIT_SECRET)
    .update(`${scope}:${identifier}`)
    .digest("hex");
  const result = await client.query(
    `INSERT INTO form_rate_limits (key) VALUES ($1)
    ON CONFLICT (key) DO UPDATE SET count=CASE WHEN form_rate_limits.window_start < now()-interval '1 hour' THEN 1 ELSE form_rate_limits.count+1 END,
    window_start=CASE WHEN form_rate_limits.window_start < now()-interval '1 hour' THEN now() ELSE form_rate_limits.window_start END RETURNING count`,
    [key],
  );
  if (result.rows[0].count > maximum)
    throw new FormError({}, 429, "Too many requests. Please try again later.");
}
export async function queueEmail(
  client: PoolClient,
  submissionId: string,
  type: string,
  payload: Record<string, unknown>,
) {
  await client.query(
    "INSERT INTO form_notifications (submission_id,type,payload) VALUES ($1,$2,$3)",
    [submissionId, type, JSON.stringify(payload)],
  );
}
export async function issueManagementLink(client: PoolClient, id: string) {
  const token = randomBytes(32).toString("base64url");
  await client.query(
    "INSERT INTO form_tokens (submission_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '30 days')",
    [id, tokenHash(token)],
  );
  return `${publicUrl()}/registration#token=${token}`;
}
export async function saveConsents(
  client: PoolClient,
  id: string,
  answers: Answers,
  settings: EventSettings,
) {
  const snapshot = consentSnapshot(answers, settings);
  await client.query(
    "INSERT INTO form_consents (submission_id,event_id,answers,notices,version) VALUES ($1,$2,$3,$4,$5)",
    [
      id,
      settings.id,
      JSON.stringify(snapshot.answers),
      JSON.stringify(snapshot.notices),
      snapshot.version,
    ],
  );
}
export async function createSubmission(raw: unknown, ip: string, resume?: File) {
  const parsed = submissionEnvelope.safeParse(raw);
  if (!parsed.success) throw new FormError({}, 400, "Invalid form submission.");
  if (parsed.data.website) return { saved: true, notification: "queued" };
  if (resume && parsed.data.kind !== "hacker")
    throw new FormError({ resume: "Resumes can only be attached to hacker registrations." });
  const settings = await getEvent();
  if (parsed.data.kind === "hacker" && !settings.registrationOpen)
    throw new FormError(
      {},
      409,
      "Registration is not open yet. You can join the interest list instead.",
    );
  validateAnswers(parsed.data.kind, parsed.data.answers, settings);
  let uploadedPath: string | undefined;
  try {
    return await transaction(async (client) => {
      const currentSettings = await getEvent(client, true);
      if (parsed.data.kind === "hacker" && !currentSettings.registrationOpen)
        throw new FormError(
          {},
          409,
          "Registration is not open yet. You can join the interest list instead.",
        );
      const answers = validateAnswers(parsed.data.kind, parsed.data.answers, currentSettings);
      await rateLimit(client, "submit-ip", ip, 30);
      await rateLimit(client, "submit-email", String(answers.email), 5);
      const result = await client.query(
        `INSERT INTO form_submissions (event_id,kind,email,request_id,data,status)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
        [
          EVENT_ID,
          parsed.data.kind,
          answers.email,
          parsed.data.requestId,
          JSON.stringify(answers),
          parsed.data.kind === "interest" ? "INTEREST" : "RECEIVED",
        ],
      );
      // Never overwrite an existing applicant or reveal whether an email is registered.
      if (result.rows.length) {
        const id = result.rows[0].id;
        if (resume) {
          const { storeSignupResume } = await import("./storage");
          uploadedPath = await storeSignupResume(EVENT_ID, id, resume);
          await client.query("UPDATE form_submissions SET resume_path=$1 WHERE id=$2", [
            uploadedPath,
            id,
          ]);
        }
        await saveConsents(client, id, answers, currentSettings);
        const link = await issueManagementLink(client, id);
        await queueEmail(client, id, "receipt", { link });
        if (parsed.data.kind !== "interest" && parsed.data.kind !== "hacker")
          await queueEmail(client, id, "organizer", {});
      }
      return { saved: true, notification: "queued" };
    });
  } catch (error) {
    if (uploadedPath) {
      const { discardSignupResume } = await import("./storage");
      try {
        await discardSignupResume(uploadedPath);
      } catch {
        console.error("Initial resume cleanup needs retry", uploadedPath);
      }
    }
    throw error;
  }
}
export async function findOwner(
  client: PoolClient,
  token: string,
  lock = false,
): Promise<Submission> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new FormError({}, 401, "This link is invalid or expired. Request a new link.");
  const result = await client.query(
    `SELECT s.*,p.qr_base64,COALESCE(p.status::text,s.status) AS status FROM form_tokens t JOIN form_submissions s ON s.id=t.submission_id LEFT JOIN participants p ON p.user_id=s.participant_id
    WHERE t.token_hash=$1 AND t.expires_at>now() AND t.revoked_at IS NULL AND s.event_id=$2` +
      (lock ? " FOR UPDATE OF s" : ""),
    [tokenHash(token), EVENT_ID],
  );
  if (!result.rows[0])
    throw new FormError({}, 401, "This link is invalid or expired. Request a new link.");
  return result.rows[0];
}
export function ownerView(s: Submission) {
  return {
    id: s.id,
    kind: s.kind,
    data: s.data,
    status: s.status,
    verified: Boolean(s.email_verified_at),
    hasResume: Boolean(s.resume_path),
    offerExpiresAt: s.offer_expires_at?.toISOString() ?? null,
    qrDataUrl:
      ["CONFIRMED", "CHECKED_IN"].includes(s.status) && s.qr_base64
        ? s.qr_base64.startsWith("data:")
          ? s.qr_base64
          : `data:image/png;base64,${s.qr_base64}`
        : null,
  };
}
export async function requestManagementLink(email: string, kind: FormKind, ip: string) {
  await transaction(async (client) => {
    await rateLimit(client, "link-ip", ip, 15);
    await rateLimit(client, "link-email", email, 3);
    const result = await client.query(
      "SELECT id FROM form_submissions WHERE event_id=$1 AND kind=$2 AND email=$3",
      [EVENT_ID, kind, email],
    );
    if (result.rows[0]) {
      const link = await issueManagementLink(client, result.rows[0].id);
      await queueEmail(client, result.rows[0].id, "management-link", { link });
    }
  });
}
export async function syncParticipant(client: PoolClient, s: Submission, answers: Answers) {
  const values = [
    String(answers.firstName),
    String(answers.lastName),
    s.email,
    String(answers.phone),
    Number(answers.age),
    String(answers.school),
    String(answers.levelOfStudy),
    String(answers.country),
    answers.gender || null,
    answers.major || null,
    JSON.stringify(answers.dietRestrictions ?? []),
    answers.linkedinUrl || null,
    answers.githubUrl || null,
    answers.shirtSize || null,
    answers.hackathons || null,
    answers.raceEthnicity ? [String(answers.raceEthnicity)] : [],
    answers.referralSource ? [String(answers.referralSource)] : [],
  ];
  if (s.participant_id) {
    await client.query(
      `UPDATE participants SET first_name=$1,last_name=$2,email=$3,phone=$4,age=$5,school=$6,level_of_study=$7,country=$8,gender=$9,major=$10,diet_restrictions=$11,linkedin_url=$12,github_url=$13,shirt_size=$14,hackathons=$15,race_ethnicity=$16,referral_source=$17,updated_at=now() WHERE user_id=$18`,
      [...values, s.participant_id],
    );
  } else {
    // A pre-existing participant must be linked by an organizer, never silently taken over.
    const existing = await client.query("SELECT user_id FROM participants WHERE lower(email)=$1", [
      s.email,
    ]);
    if (existing.rows.length)
      throw new FormError(
        {},
        409,
        "Your registration needs an organizer to link an existing record. Please contact info@revolutionuc.com.",
      );
    const result = await client.query(
      `INSERT INTO participants (first_name,last_name,email,phone,age,school,level_of_study,country,gender,major,diet_restrictions,linkedin_url,github_url,shirt_size,hackathons,race_ethnicity,referral_source) VALUES (${values.map((_, i) => `$${i + 1}`).join(",")}) RETURNING user_id`,
      values,
    );
    s.participant_id = result.rows[0].user_id;
    await client.query(
      "UPDATE form_submissions SET participant_id=$1,status='REGISTERED' WHERE id=$2",
      [s.participant_id, s.id],
    );
    s.status = "REGISTERED";
  }
  const qr = await client.query("SELECT qr_base64 FROM participants WHERE user_id=$1", [
    s.participant_id,
  ]);
  if (!qr.rows[0]?.qr_base64) {
    s.qr_base64 = await QRCode.toDataURL(s.participant_id!, {
      width: 240,
      errorCorrectionLevel: "M",
    });
    await client.query("UPDATE participants SET qr_base64=$1 WHERE user_id=$2", [
      s.qr_base64,
      s.participant_id,
    ]);
  } else s.qr_base64 = qr.rows[0].qr_base64;
}
export async function availableSeats(client: PoolClient, settings: EventSettings, except?: string) {
  if (!settings.capacity) throw new FormError({}, 409, "Attendance confirmation is not open yet.");
  const result = await client.query(
    `SELECT count(*)::int AS count FROM participants WHERE status IN ('CONFIRMED','CHECKED_IN') AND ($1::uuid IS NULL OR user_id<>$1)`,
    [except ?? null],
  );
  const offers = await client.query(
    `SELECT count(*)::int AS count FROM form_submissions WHERE event_id=$1 AND offer_expires_at>now() AND status='REGISTERED' AND ($2::uuid IS NULL OR participant_id<>$2)`,
    [settings.id, except ?? null],
  );
  return settings.capacity - result.rows[0].count - offers.rows[0].count;
}
export async function promoteWaitlist(client: PoolClient, settings: EventSettings) {
  if (settings.confirmationDeadline && new Date(settings.confirmationDeadline) < new Date()) return;
  if (!settings.capacity || (await availableSeats(client, settings)) < 1) return;
  const next = await client.query(
    `SELECT s.* FROM form_submissions s JOIN participants p ON p.user_id=s.participant_id WHERE s.event_id=$1 AND s.status='WAITLISTED' AND p.status='WAITLISTED' AND s.email_verified_at IS NOT NULL ORDER BY s.updated_at,s.created_at LIMIT 1 FOR UPDATE OF s,p SKIP LOCKED`,
    [settings.id],
  );
  const s = next.rows[0] as Submission | undefined;
  if (!s) return;
  await client.query(
    "UPDATE form_submissions SET status='REGISTERED',offer_expires_at=LEAST(now()+interval '24 hours',COALESCE($2::timestamptz,now()+interval '24 hours')),updated_at=now() WHERE id=$1",
    [s.id, settings.confirmationDeadline],
  );
  await client.query(
    "UPDATE participants SET status='REGISTERED',updated_at=now() WHERE user_id=$1",
    [s.participant_id],
  );
  const link = await issueManagementLink(client, s.id);
  await queueEmail(client, s.id, "waitlist-offer", { link });
}
export async function updateOwner(token: string, action: string, raw?: unknown) {
  return transaction(async (client) => {
    // Always acquire the event lock before a submission lock: all capacity mutations use this order.
    const settings = await getEvent(client, true);
    const s = await findOwner(client, token, true);
    await rateLimit(client, "owner", s.id, 30);
    if (action === "verify") {
      await client.query(
        "UPDATE form_submissions SET email_verified_at=COALESCE(email_verified_at,now()),updated_at=now() WHERE id=$1",
        [s.id],
      );
      s.email_verified_at = new Date();
      if (s.kind === "hacker")
        await syncParticipant(client, s, validateAnswers("hacker", s.data, settings));
    } else {
      if (!s.email_verified_at)
        throw new FormError({}, 403, "Verify your email before updating your application.");
      if (action === "save") {
        const previousSharing = s.data.sponsorResumeConsent;
        const answers = validateAnswers(
          s.kind,
          raw,
          settings,
          ["APPROVED", "ASSIGNED"].includes(s.status),
        );
        if (answers.email !== s.email)
          throw new FormError({ email: "Contact an organizer to change your email address." });
        if (
          ["APPROVED", "ASSIGNED"].includes(s.status) &&
          (JSON.stringify(answers.roles) !== JSON.stringify(s.data.roles) ||
            answers.organization !== s.data.organization ||
            answers.organisation !== s.data.organisation)
        )
          throw new FormError(
            {},
            409,
            "Contact an organizer to change your approved role or affiliation.",
          );
        if (s.status === "WITHDRAWN" || s.status === "DECLINED")
          throw new FormError({}, 409, "Contact the organizers before reopening this application.");
        await client.query("UPDATE form_submissions SET data=$1,updated_at=now() WHERE id=$2", [
          JSON.stringify(answers),
          s.id,
        ]);
        await saveConsents(client, s.id, answers, settings);
        s.data = answers;
        if (s.kind === "hacker") await syncParticipant(client, s, answers);
        if (s.resume_path && previousSharing === true && answers.sponsorResumeConsent !== true)
          await queueEmail(client, s.id, "consent-withdrawn", {});
      } else if (
        ["confirm", "withdraw"].includes(action) &&
        s.kind === "hacker" &&
        s.participant_id
      ) {
        const current = await client.query(
          "SELECT status,checked_in FROM participants WHERE user_id=$1 FOR UPDATE",
          [s.participant_id],
        );
        if (current.rows[0]?.checked_in || current.rows[0]?.status === "CHECKED_IN")
          throw new FormError(
            {},
            409,
            "Please contact an organizer to change attendance after check-in.",
          );
        if (action === "confirm") {
          if (current.rows[0]?.status === "CONFIRMED") return ownerView(s);
          if (s.status === "WITHDRAWN")
            throw new FormError(
              {},
              409,
              "Please contact the organizers to reopen your registration.",
            );
          if (settings.confirmationDeadline && new Date(settings.confirmationDeadline) < new Date())
            throw new FormError(
              {},
              409,
              "The attendance confirmation deadline has passed. Contact the organizers.",
            );
          s.status =
            (await availableSeats(client, settings, s.participant_id)) > 0
              ? "CONFIRMED"
              : "WAITLISTED";
        } else s.status = "WITHDRAWN";
        await client.query(
          "UPDATE participants SET status=$1,checked_in=false,updated_at=now() WHERE user_id=$2",
          [s.status, s.participant_id],
        );
        await client.query(
          "UPDATE form_submissions SET status=$1,offer_expires_at=NULL,updated_at=now() WHERE id=$2",
          [s.status, s.id],
        );
        await queueEmail(client, s.id, "attendance", { status: s.status });
        if (s.status === "WITHDRAWN") await promoteWaitlist(client, settings);
      } else if (action === "withdraw") {
        s.status = "WITHDRAWN";
        await client.query(
          "UPDATE form_submissions SET status='WITHDRAWN',updated_at=now() WHERE id=$1",
          [s.id],
        );
      } else throw new FormError({}, 400, "Unknown application action.");
    }
    return ownerView(s);
  });
}
