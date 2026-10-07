import { NextResponse } from "next/server";
import { transaction } from "@/lib/intake/database";
import { assertSponsorAccess, signedResume } from "@/lib/intake/storage";
import { bearer, apiError } from "@/lib/intake/http";
import { FormError } from "@/lib/intake/validation";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const after = url.searchParams.get("after");
    if ((id && !uuid.test(id)) || (after && !uuid.test(after)))
      throw new FormError({}, 400, "Invalid resume selection.");
    const rows = await transaction(async (client) => {
      const sponsor = await assertSponsorAccess(client, bearer(request));
      const result = await client.query(
        `SELECT s.id,s.resume_path,s.data,s.email FROM form_submissions s JOIN participants p ON p.user_id=s.participant_id
        WHERE s.event_id=$1 AND s.kind='hacker' AND s.email_verified_at IS NOT NULL AND s.resume_path IS NOT NULL AND s.data->>'sponsorResumeConsent'='true'
        AND p.status IN ('CONFIRMED','CHECKED_IN') AND ($2::uuid IS NULL OR s.id=$2) AND ($3::uuid IS NULL OR s.id>$3) ORDER BY s.id LIMIT 51`,
        [sponsor.event_id, id, after],
      );
      return result.rows;
    });
    if (id) {
      if (!rows[0]) throw new FormError({}, 404, "This resume is no longer available for sharing.");
      return NextResponse.json(await signedResume(rows[0].resume_path), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json(
      {
        rows: rows
          .slice(0, 50)
          .map((row) => ({
            id: row.id,
            name: row.data.preferredName || `${row.data.firstName} ${row.data.lastName}`,
            major: row.data.major,
            graduationYear: row.data.graduationYear,
            ...(row.data.sponsorContactConsent === true ? { email: row.email } : {}),
          })),
        next: rows.length > 50 ? rows[49].id : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
