import { transaction } from "./database";
import {
  getEvent,
  availableSeats,
  promoteWaitlist,
  queueEmail,
  tokenHash,
  rateLimit,
} from "./service";
import { FormError } from "./validation";
export async function confirmLegacyAttendance(token: string, response: "yes" | "no", ip: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new FormError(
      {},
      401,
      "This confirmation link is invalid or expired. Contact the organizers.",
    );
  return transaction(async (client) => {
    const event = await getEvent(client, true);
    await rateLimit(client, "confirm-ip", ip, 30);
    // Accept previously-issued links while new links store only a token hash.
    const result = await client.query(
      "SELECT * FROM confirm_tokens WHERE (token=$1 OR token=$2) AND expires_at>now() AND used_at IS NULL FOR UPDATE",
      [token, `sha256:${tokenHash(token)}`],
    );
    if (!result.rows[0])
      throw new FormError(
        {},
        401,
        "This confirmation link is invalid, expired, or already used. Request an application link or contact the organizers.",
      );
    const t = result.rows[0];
    const application = await client.query(
      "SELECT * FROM form_submissions WHERE event_id=$1 AND participant_id=$2 FOR UPDATE",
      [event.id, t.participant_id],
    );
    const participant = await client.query(
      "SELECT * FROM participants WHERE user_id=$1 FOR UPDATE",
      [t.participant_id],
    );
    const p = participant.rows[0];
    if (!p || p.email.toLowerCase() !== t.email.toLowerCase())
      throw new FormError({}, 401, "This confirmation link is no longer valid.");
    if (p.checked_in || p.status === "CHECKED_IN")
      throw new FormError({}, 409, "Contact an organizer to change attendance after check-in.");
    if (response === "yes" && p.status === "WITHDRAWN")
      throw new FormError({}, 409, "Contact the organizers to reopen your registration.");
    if (
      response === "yes" &&
      event.confirmationDeadline &&
      new Date(event.confirmationDeadline) < new Date()
    )
      throw new FormError({}, 409, "The confirmation deadline has passed. Contact the organizers.");
    const status =
      response === "no"
        ? "WITHDRAWN"
        : p.status === "CONFIRMED"
          ? "CONFIRMED"
          : (await availableSeats(client, event, p.user_id)) > 0
            ? "CONFIRMED"
            : "WAITLISTED";
    await client.query("UPDATE participants SET status=$1,updated_at=now() WHERE user_id=$2", [
      status,
      p.user_id,
    ]);
    await client.query(
      "UPDATE confirm_tokens SET used_at=now() WHERE participant_id=$1 AND used_at IS NULL",
      [p.user_id],
    );
    await client.query(
      "UPDATE form_submissions SET status=$1,email_verified_at=COALESCE(email_verified_at,now()),offer_expires_at=NULL,updated_at=now() WHERE participant_id=$2 AND event_id=$3",
      [status, p.user_id, event.id],
    );
    if (application.rows[0] && p.status !== status)
      await queueEmail(client, application.rows[0].id, "attendance", { status });
    if (status === "WITHDRAWN") await promoteWaitlist(client, event);
    return { status };
  });
}
