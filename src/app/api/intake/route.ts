import { NextResponse } from "next/server";
import { createSubmission } from "@/lib/intake/service";
import { assertOrigin, requestIp, readJson, readBody, apiError } from "@/lib/intake/http";
import { MAX_RESUME_BYTES } from "@/lib/intake/storage";
import { FormError } from "@/lib/intake/validation";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    let payload: unknown;
    let resume: File | undefined;
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const bytes = await readBody(request, MAX_RESUME_BYTES + 65536);
      let body: FormData;
      try {
        body = await new Request(request.url, {
          method: "POST",
          headers: { "Content-Type": request.headers.get("content-type")! },
          body: bytes as BodyInit,
        }).formData();
      } catch {
        throw new FormError({}, 400, "Invalid form submission.");
      }
      const submission = body.get("submission");
      if (typeof submission !== "string" || Buffer.byteLength(submission) > 65536)
        throw new FormError({}, 400, "Invalid form submission.");
      try {
        payload = JSON.parse(submission);
      } catch {
        throw new FormError({}, 400, "Invalid form submission.");
      }
      const attachment = body.get("resume");
      if (attachment !== null && !(attachment instanceof File))
        throw new FormError({ resume: "Please select a PDF resume." });
      if (attachment instanceof File) resume = attachment;
    } else payload = await readJson(request);
    return NextResponse.json(await createSubmission(payload, requestIp(request), resume), {
      status: 202,
    });
  } catch (error) {
    return apiError(error);
  }
}
