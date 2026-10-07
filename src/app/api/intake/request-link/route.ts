import { NextResponse } from "next/server";
import { z } from "zod";
import { FORM_KINDS } from "@/lib/intake/definitions";
import { requestManagementLink } from "@/lib/intake/service";
import { FormError } from "@/lib/intake/validation";
import { assertOrigin, requestIp, readJson, apiError } from "@/lib/intake/http";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const parsed = z
      .object({ email: z.email().max(254), kind: z.enum(FORM_KINDS) })
      .safeParse(await readJson(request));
    if (!parsed.success)
      throw new FormError({}, 400, "Please enter your email and application type.");
    await requestManagementLink(
      parsed.data.email.trim().toLowerCase(),
      parsed.data.kind,
      requestIp(request),
    );
    return NextResponse.json(
      { message: "If we have an application for that email, we'll send a new link." },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
