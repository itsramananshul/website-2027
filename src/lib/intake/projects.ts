import { z } from "zod";
import { transaction } from "./database";
import { findOwner, getEvent, rateLimit, queueEmail } from "./service";
import { FormError, validUrl } from "./validation";
export const projectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  demoUrl: z.string().trim().max(2000).optional().default(""),
  githubUrl: z.string().trim().max(2000).optional().default(""),
  devpostUrl: z.string().trim().min(1).max(2000),
  categories: z.array(z.string().max(200)).max(30),
  memberEmails: z.array(z.email().max(254)).min(1).max(20),
  githubMembers: z
    .array(z.string().regex(/^[a-zA-Z0-9-]{1,39}$/))
    .max(20)
    .default([]),
  disclosures: z.string().trim().max(4000).default(""),
  rulesAccepted: z.literal(true),
});
export async function saveProject(token: string, input: unknown) {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success)
    throw new FormError(
      {},
      400,
      "Check your project name, description, links, team emails, and rules agreement.",
    );
  const data = parsed.data;
  for (const key of ["demoUrl", "githubUrl", "devpostUrl"] as const)
    if (data[key] && !validUrl(data[key]))
      throw new FormError({}, 400, "Use full http or https project links.");
  const devpost = new URL(data.devpostUrl);
  if (devpost.hostname !== "devpost.com" || !devpost.pathname.startsWith("/software/"))
    throw new FormError({}, 400, "Enter your Devpost project link.");
  const emails = [...new Set(data.memberEmails.map((e) => e.toLowerCase()))];
  data.memberEmails = emails;
  data.githubMembers = [...new Set(data.githubMembers.map((s) => s.toLowerCase()))];
  return transaction(async (client) => {
    const event = await getEvent(client, true);
    const owner = await findOwner(client, token, true);
    await rateLimit(client, "project", owner.id, 15);
    if (owner.kind !== "hacker" || !owner.email_verified_at || owner.status !== "CHECKED_IN")
      throw new FormError(
        {},
        403,
        "Project submissions require a verified, checked-in hacker registration.",
      );
    if (
      !event.details.projectSubmissionOpen ||
      !event.details.projectRules ||
      !event.details.maxTeamSize
    )
      throw new FormError({}, 409, "Project submissions are not open.");
    if (!emails.includes(owner.email) || emails.length > event.details.maxTeamSize)
      throw new FormError(
        {},
        400,
        "Include your registration email and stay within the event's team-size limit.",
      );
    const categories = await client.query("SELECT id FROM categories WHERE id=ANY($1::text[])", [
      data.categories,
    ]);
    if (categories.rows.length !== new Set(data.categories).size)
      throw new FormError({}, 400, "Choose listed prize categories.");
    const previous = await client.query(
      "SELECT id,status FROM project_intakes WHERE owner_id=$1 FOR UPDATE",
      [owner.id],
    );
    if (previous.rows[0]?.status === "REVIEWED")
      throw new FormError(
        {},
        409,
        "Contact an organizer to change a reviewed project or team roster.",
      );
    const stored = {
      ...data,
      rulesNotice: event.details.projectRules,
      rulesAcceptedAt: new Date().toISOString(),
    };
    await client.query(
      "INSERT INTO project_intakes(event_id,owner_id,data) VALUES($1,$2,$3) ON CONFLICT(owner_id) DO UPDATE SET data=excluded.data,updated_at=now()",
      [event.id, owner.id, JSON.stringify(stored)],
    );
    if (!previous.rows.length) await queueEmail(client, owner.id, "organizer", {});
    return { saved: true };
  });
}
