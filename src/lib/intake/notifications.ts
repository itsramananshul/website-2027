import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { getPool, transaction } from "./database";
import { getEvent, promoteWaitlist, publicUrl } from "./service";
const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export type Job = {
  id: string;
  submission_id: string;
  type: string;
  payload: Record<string, unknown>;
  email: string;
  kind: string;
  data: Record<string, unknown>;
  status?: string;
  attempts: number;
  lease: string;
};
export function buildMessage(job: Job) {
  const name = String(job.data.firstName ?? job.data.fullName ?? job.data.contactName ?? "there");
  const role = Array.isArray(job.data.roles)
    ? job.data.roles
        .filter((r) => ["Judge", "Mentor"].includes(String(r)))
        .join(" and ")
        .toLowerCase() || "helping with the event"
    : job.kind;
  const body =
    job.type === "attendance"
      ? `Your attendance status is ${String(job.status ?? job.payload.status).toLowerCase()}.`
      : job.type === "management-link"
        ? `Your application status is ${String(job.status ?? "received").toLowerCase()}. Use this link to verify your email or review your details. Approved applicants can also provide their event logistics.`
        : job.type === "waitlist-offer"
          ? "A place is available. Your offer is held for up to 24 hours, or until the confirmation deadline, whichever is earlier. Use your link to respond."
          : job.type === "interest-open"
            ? "Registration for RevolutionUC 2027 is open. You can reuse your interest details when you register."
            : job.type === "reminder"
              ? "Please review your application and attendance plans using the link below."
              : job.kind === "interest"
                ? "Your interest is saved. Verify your email using the link below. This does not reserve an event spot. We'll contact you when registration opens."
                : job.kind === "hacker"
                  ? "Your registration is saved. Verify your email using the link below, then review your details and attendance plans."
                  : job.kind === "judge-mentor"
                    ? `Your interest in ${role} is saved. Verify your email using the link below. The organizers will review it and contact you about next steps.`
                    : "Your application is saved. Verify your email using the link below. The organizers will review it and contact you about next steps.";
  const link = job.payload.link
    ? `<p><a href="${escapeHtml(String(job.payload.link))}">Review your application</a></p>`
    : `<p><a href="${publicUrl()}/registration">Request an application link</a></p>`;
  return {
    subject:
      job.type === "waitlist-offer"
        ? "A RevUC place is available"
        : "Your RevolutionUC 2027 application",
    html: `<p>Hi ${escapeHtml(name)},</p><p>${escapeHtml(body)}</p>${link}<p>Questions? Contact info@revolutionuc.com.</p><p>The RevolutionUC team</p>`,
    text: `Hi ${name},\n\n${body}\n\n${String(job.payload.link ?? `${publicUrl()}/registration`)}\n\nQuestions? Contact info@revolutionuc.com.\nThe RevolutionUC team`,
  };
}
export async function deliverNotifications(limit = 20) {
  await getPool().query(
    "UPDATE form_notifications SET state='failed',locked_at=NULL,lease=NULL,last_error='Worker lease expired at the retry limit' WHERE state='sending' AND locked_at<now()-interval '5 minutes' AND attempts>=8",
  );
  const jobs = await transaction(async (client) => {
    const lease = randomUUID();
    const result = await client.query(
      `WITH candidates AS (SELECT id FROM form_notifications WHERE ((state='pending' AND available_at<=now()) OR (state='sending' AND locked_at<now()-interval '5 minutes')) AND attempts<8 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1)
      UPDATE form_notifications n SET state='sending',locked_at=now(),lease=$2,attempts=attempts+1 FROM candidates c WHERE n.id=c.id RETURNING n.*`,
      [limit, lease],
    );
    const items: Job[] = [];
    for (const row of result.rows) {
      const result = await client.query(
        "SELECT email,kind,data,status FROM form_submissions WHERE id=$1",
        [row.submission_id],
      );
      items.push({ ...row, ...result.rows[0] });
    }
    return items;
  });
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  for (const job of jobs) {
    try {
      if (job.type === "resume-delete") {
        const { storageClient, RESUME_BUCKET } = await import("./storage");
        const result = await storageClient()
          .storage.from(RESUME_BUCKET)
          .remove([String(job.payload.path)]);
        if (result.error) throw new Error("Resume cleanup failed.");
      } else {
        if (!resend || !process.env.RESEND_FROM_EMAIL)
          throw new Error("Email delivery is not configured.");
        let to: string | string[] = job.email;
        let message = buildMessage(job);
        if (job.type === "organizer" || job.type === "consent-withdrawn") {
          const env =
            job.kind === "sponsor" || job.kind === "sponsor-representative"
              ? "SPONSOR_NOTIFICATION_EMAILS"
              : job.kind === "judge-mentor"
                ? "JUDGE_MENTOR_NOTIFICATION_EMAILS"
                : "INTAKE_NOTIFICATION_EMAILS";
          to = (process.env[env] ?? "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
          if (!to.length) throw new Error("Organizer recipients are not configured.");
          message = {
            subject:
              job.type === "consent-withdrawn"
                ? "Resume-sharing permission was withdrawn"
                : `New RevUC ${job.kind} application`,
            html: `<p>Please review this application in the organizer dashboard. Reference: ${escapeHtml(job.submission_id)}.</p>`,
            text: `Review application ${job.submission_id} in the organizer dashboard.`,
          };
        }
        const result = await resend.emails.send(
          { from: process.env.RESEND_FROM_EMAIL!, to, ...message },
          { idempotencyKey: `intake-${job.id}` },
        );
        if (result.error) throw new Error("Email provider rejected delivery.");
      }
      // Raw management tokens are removed after delivery; stored access tokens are hashes only.
      await getPool().query(
        "UPDATE form_notifications SET state='sent',payload='{}'::jsonb,locked_at=NULL,lease=NULL,last_error=NULL WHERE id=$1 AND lease=$2",
        [job.id, job.lease],
      );
    } catch {
      await getPool().query(
        "UPDATE form_notifications SET state=$1,last_error='Delivery failed; review provider configuration',available_at=now()+($2*interval '1 minute'),locked_at=NULL,lease=NULL WHERE id=$3 AND lease=$4",
        [
          job.attempts >= 8 ? "failed" : "pending",
          Math.min(60, 2 ** job.attempts),
          job.id,
          job.lease,
        ],
      );
    }
  }
  return { processed: jobs.length };
}
export async function expireOffers() {
  await transaction(async (client) => {
    const settings = await getEvent(client, true);
    const result = await client.query(
      "UPDATE form_submissions SET status='WAITLISTED',offer_expires_at=NULL,updated_at=now() WHERE event_id=$1 AND status='REGISTERED' AND offer_expires_at<now() RETURNING participant_id",
      [settings.id],
    );
    for (const row of result.rows)
      await client.query(
        "UPDATE participants SET status='WAITLISTED',updated_at=now() WHERE user_id=$1 AND status='REGISTERED'",
        [row.participant_id],
      );
    // updated_at places expired offers behind the remaining waiting applicants.
    for (let i = 0; i < result.rows.length; i++) await promoteWaitlist(client, settings);
    await client.query("DELETE FROM form_rate_limits WHERE window_start<now()-interval '2 days'");
    await client.query("DELETE FROM form_tokens WHERE expires_at<now()-interval '30 days'");
  });
}
