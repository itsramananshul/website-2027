import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
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
    throw new FormError({ resume: "Please upload a PDF of up to 4 MB." }, 400);
  if (
    !name.toLowerCase().endsWith(".pdf") ||
    (type && type !== "application/pdf") ||
    Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-"
  )
    throw new FormError({ resume: "Please upload a PDF resume." }, 400);
}
function signature(value: string, key: string) {
  return createHmac("sha256", key).update(`revuc-resume-cleanup:${value}`).digest("base64url");
}
export function cleanupToken(path: string, key: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ path, expires: now + 60 * 60 * 1000 })).toString(
    "base64url",
  );
  return `${payload}.${signature(payload, key)}`;
}
export function cleanupPath(token: string, key: string, now = Date.now()) {
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra || token.length > 1024)
    throw new FormError({}, 403, "Invalid upload receipt.");
  const actual = Buffer.from(signature(payload, key));
  const received = Buffer.from(supplied);
  if (received.length !== actual.length || !timingSafeEqual(received, actual))
    throw new FormError({}, 403, "Invalid upload receipt.");
  let data: { path: string; expires: number };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    throw new FormError({}, 403, "Invalid upload receipt.");
  }
  if (
    !data ||
    typeof data.path !== "string" ||
    !/^revuc-2027\/[0-9a-f-]{36}\.pdf$/.test(data.path) ||
    !Number.isFinite(data.expires) ||
    data.expires < now
  )
    throw new FormError({}, 403, "Expired or invalid upload receipt.");
  return data.path;
}
export async function storeResume(file: File) {
  if (file.size > MAX_RESUME_BYTES)
    throw new FormError({ resume: "Please upload a PDF of up to 4 MB." }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateResume(file.name, file.type, bytes);
  const path = `revuc-2027/${randomUUID()}.pdf`;
  const result = await storageClient().storage.from(RESUME_BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
    cacheControl: "0",
  });
  if (result.error)
    throw new FormError({ resume: "We couldn't upload your resume. Please try again." }, 503);
  return { path, receipt: cleanupToken(path, process.env.SUPABASE_SECRET_KEY!) };
}
export async function discardResume(receipt: string) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Private resume storage is not configured.");
  const path = cleanupPath(receipt, key);
  const client = storageClient();
  const linked = await client.from("hacker_interest").select("id").eq("resume_path", path).limit(1);
  if (linked.error) throw new Error("Resume cleanup lookup failed.");
  if (linked.data.length) return;
  const removed = await client.storage.from(RESUME_BUCKET).remove([path]);
  if (removed.error) throw new Error("Resume cleanup failed.");
}
