import { NextResponse } from "next/server";
import { createSubmission } from "@/lib/intake/service";
import { assertOrigin, requestIp, readJson, apiError } from "@/lib/intake/http";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    return NextResponse.json(await createSubmission(await readJson(request), requestIp(request)), {
      status: 202,
    });
  } catch (error) {
    return apiError(error);
  }
}
