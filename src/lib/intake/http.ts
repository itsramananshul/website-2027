import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { FormError } from "./validation";
import { publicUrl } from "./service";
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== publicUrl())
    throw new FormError({}, 403, "This request is not allowed.");
}
export function requestIp(request: Request) {
  // The deployment proxy must overwrite this header. Email/token limits also apply.
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim().slice(0, 100) ?? "unknown";
}
export function bearer(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
}
export function requireCron(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = bearer(request);
  if (
    !expected ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    throw new FormError({}, 401, "Unauthorized.");
}
export async function readBody(request: Request, maximum = 65536) {
  if (Number(request.headers.get("content-length")) > maximum)
    throw new FormError({}, 413, "This submission is too large.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new FormError({}, 413, "This submission is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Uint8Array(Buffer.concat(chunks));
}
export async function readJson(request: Request) {
  const text = new TextDecoder().decode(await readBody(request));
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new FormError({}, 400, "Invalid form submission.");
  }
}
export function apiError(error: unknown) {
  if (error instanceof FormError)
    return NextResponse.json(
      { error: error.message, fields: error.fields },
      {
        status: error.status,
        headers: {
          "Cache-Control": "no-store",
          ...(error.status === 429 ? { "Retry-After": "3600" } : {}),
        },
      },
    );
  console.error("Intake request failed", error instanceof Error ? error.name : "Unknown error");
  return NextResponse.json(
    { error: "We couldn't save your request. Please try again or contact info@revolutionuc.com." },
    { status: 503 },
  );
}
