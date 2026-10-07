import { NextResponse } from "next/server";
import { z } from "zod";
import { assertOrigin, apiError, readJson, requestIp } from "@/lib/intake/http";
import { FormError } from "@/lib/intake/validation";
import { confirmLegacyAttendance } from "@/lib/intake/confirmation";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const parsed = z
      .object({ token: z.string().length(43), response: z.enum(["yes", "no"]) })
      .safeParse(await readJson(request));
    if (!parsed.success) throw new FormError({}, 400, "Invalid attendance response.");
    return NextResponse.json(
      await confirmLegacyAttendance(parsed.data.token, parsed.data.response, requestIp(request)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
