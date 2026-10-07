import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { transaction } from "./database";
import { findOwner, queueEmail, getEvent, saveConsents, type Submission } from "./service";
import { FormError } from "./validation";
export const RESUME_BUCKET = "revuc-2027-resumes";
export const MAX_RESUME_BYTES = 4 * 1024 * 1024;
export function storageClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Private resume storage is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function validateResume(name: string, type: string, bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > MAX_RESUME_BYTES)
    throw new FormError({}, 400, "Please upload a PDF of up to 4 MB.");
  if (
    !name.toLowerCase().endsWith(".pdf") ||
    (type && type !== "application/pdf") ||
    Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-"
  )
    throw new FormError({}, 400, "Please upload a PDF resume.");
}
async function resumeOwner(token: string, uploading = false) {
  return transaction(async (client) => {
    const s = await findOwner(client, token);
    if (
      s.kind !== "hacker" ||
      !s.email_verified_at ||
      !s.participant_id ||
      (uploading && ["WITHDRAWN", "DECLINED"].includes(s.status))
    )
      throw new FormError(
        {},
        403,
        "Verify an active hacker registration before uploading a resume.",
      );
    return s;
  });
}
export async function uploadResume(token: string, file: File) {
  const owner = await resumeOwner(token, true);
  if (file.size > MAX_RESUME_BYTES)
    throw new FormError({}, 413, "Please upload a PDF of up to 4 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateResume(file.name, file.type, bytes);
  const path = `${owner.event_id}/${owner.id}/${randomUUID()}.pdf`;
  const storage = storageClient().storage.from(RESUME_BUCKET);
  const upload = await storage.upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
    cacheControl: "0",
  });
  if (upload.error) throw new Error("Resume upload failed.");
  try {
    await transaction(async (client) => {
      const current = await findOwner(client, token, true);
      if (
        !current.email_verified_at ||
        current.kind !== "hacker" ||
        ["WITHDRAWN", "DECLINED"].includes(current.status)
      )
        throw new FormError({}, 403, "This registration cannot upload a resume.");
      await client.query(
        "UPDATE form_submissions SET resume_path=$1,updated_at=now() WHERE id=$2",
        [path, owner.id],
      );
      if (current.resume_path)
        await queueEmail(client, owner.id, "resume-delete", { path: current.resume_path });
    });
  } catch (error) {
    const removed = await storage.remove([path]);
    if (removed.error)
      await transaction((client) => queueEmail(client, owner.id, "resume-delete", { path }));
    throw error;
  }
  return { saved: true };
}
export async function removeResume(token: string) {
  await resumeOwner(token);
  await transaction(async (client) => {
    const settings = await getEvent(client, true);
    const s = await findOwner(client, token, true);
    if (s.resume_path) await queueEmail(client, s.id, "resume-delete", { path: s.resume_path });
    if (s.data.sponsorResumeConsent === true) {
      s.data.sponsorResumeConsent = false;
      await saveConsents(client, s.id, s.data, settings);
      if (s.resume_path) await queueEmail(client, s.id, "consent-withdrawn", {});
    }
    await client.query(
      "UPDATE form_submissions SET resume_path=NULL,data=$2,updated_at=now() WHERE id=$1",
      [s.id, JSON.stringify(s.data)],
    );
  });
  return { removed: true };
}
export async function ownerResumeUrl(token: string) {
  const s = await resumeOwner(token);
  if (!s.resume_path) throw new FormError({}, 404, "No resume has been uploaded.");
  return signedResume(s.resume_path);
}
export async function signedResume(path: string) {
  const result = await storageClient()
    .storage.from(RESUME_BUCKET)
    .createSignedUrl(path, 60, { download: "resume.pdf" });
  if (result.error) throw new Error("Resume download failed.");
  return { url: result.data.signedUrl };
}
export async function assertSponsorAccess(
  client: import("pg").PoolClient,
  token: string,
): Promise<Submission> {
  const s = await findOwner(client, token);
  if (
    s.kind !== "sponsor-representative" ||
    !s.email_verified_at ||
    s.status !== "APPROVED" ||
    s.data.resumeUseAgreement !== true ||
    !s.sponsor_id
  )
    throw new FormError({}, 403, "Resume access requires approval from the sponsorship team.");
  const company = await client.query(
    "SELECT id FROM form_submissions WHERE id=$1 AND event_id=$2 AND kind='sponsor' AND status='APPROVED'",
    [s.sponsor_id, s.event_id],
  );
  if (!company.rows[0])
    throw new FormError({}, 403, "The sponsorship team needs to confirm your company's access.");
  return s;
}
