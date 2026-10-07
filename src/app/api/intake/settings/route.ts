import { NextResponse } from "next/server";
import { getEvent } from "@/lib/intake/service";
import { apiError } from "@/lib/intake/http";
export async function GET() {
  try {
    return NextResponse.json(await getEvent(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
