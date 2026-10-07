import { NextResponse } from "next/server";
import { transaction } from "@/lib/intake/database";
import { findOwner, ownerView, updateOwner } from "@/lib/intake/service";
import { assertOrigin, bearer, readJson, apiError } from "@/lib/intake/http";
import { z } from "zod";
import { FormError } from "@/lib/intake/validation";
const update = z.object({
  action: z.enum(["verify", "save", "confirm", "withdraw"]),
  answers: z.unknown().optional(),
});
export async function GET(request: Request) {
  try {
    const owner = await transaction(async (client) =>
      ownerView(await findOwner(client, bearer(request))),
    );
    return NextResponse.json(owner, {
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const parsed = update.safeParse(await readJson(request));
    if (!parsed.success) throw new FormError({}, 400, "Invalid application action.");
    const body = parsed.data;
    return NextResponse.json(await updateOwner(bearer(request), body.action, body.answers), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
