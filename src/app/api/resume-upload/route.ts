import { FormError } from "@/lib/intake/validation";
import { MAX_RESUME_BYTES, storeResume, discardResume } from "@/lib/intake/storage";
export const runtime = "nodejs";
async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new FormError({ resume: "Please upload a PDF of up to 4 MB." }, 413);
  const reader = request.body?.getReader();
  if (!reader) throw new FormError({}, 400, "Missing upload.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new FormError({ resume: "Please upload a PDF of up to 4 MB." }, 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof FormError
          ? error.message
          : "We couldn't complete your resume upload. Please try again.",
      fields: error instanceof FormError ? error.fields : {},
    },
    { status: error instanceof FormError ? error.status : 503 },
  );
}
export async function POST(request: Request) {
  try {
    const bytes = await boundedBody(request, MAX_RESUME_BYTES + 64 * 1024);
    const form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("resume");
    if (!(file instanceof File)) throw new FormError({ resume: "Choose a PDF resume." }, 400);
    return Response.json(await storeResume(file));
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const bytes = await boundedBody(request, 2048);
    const input = JSON.parse(bytes.toString());
    if (typeof input.receipt !== "string") throw new FormError({}, 400, "Missing upload receipt.");
    await discardResume(input.receipt);
    return Response.json({ removed: true });
  } catch (error) {
    return failure(error);
  }
}
