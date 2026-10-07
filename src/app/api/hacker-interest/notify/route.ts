import { NextResponse } from "next/server";
// Notifications are queued atomically by /api/intake. Never send caller-supplied email payloads.
export async function POST() {
  return NextResponse.json(
    { error: "Please submit the form through the current registration page." },
    { status: 410 },
  );
}
