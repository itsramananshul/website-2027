import { NextResponse } from "next/server";
import { assertOrigin, bearer, apiError, readBody } from "@/lib/intake/http";
import { uploadResume, removeResume, ownerResumeUrl, MAX_RESUME_BYTES } from "@/lib/intake/storage";
import { FormError } from "@/lib/intake/validation";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    if (Number(request.headers.get("content-length")) > MAX_RESUME_BYTES + 65536)
      throw new FormError({}, 413, "Please upload a PDF of up to 4 MB.");
    const bytes = await readBody(request, MAX_RESUME_BYTES + 65536);
    const body = await new Response(bytes.buffer as ArrayBuffer, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = body.get("resume");
    if (!(file instanceof File)) throw new FormError({}, 400, "Please select a PDF resume.");
    return NextResponse.json(await uploadResume(bearer(request), file));
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    assertOrigin(request);
    return NextResponse.json(await removeResume(bearer(request)));
  } catch (error) {
    return apiError(error);
  }
}
export async function GET(request: Request) {
  try {
    return NextResponse.json(await ownerResumeUrl(bearer(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
