import { NextResponse } from "next/server";
import { transaction } from "@/lib/intake/database";
import { getEvent, findOwner } from "@/lib/intake/service";
import { saveProject } from "@/lib/intake/projects";
import { assertOrigin, bearer, readJson, apiError } from "@/lib/intake/http";
import { FormError } from "@/lib/intake/validation";
export async function GET(request: Request) {
  try {
    const result = await transaction(async (client) => {
      const owner = await findOwner(client, bearer(request));
      if (owner.kind !== "hacker" || !owner.email_verified_at)
        throw new FormError({}, 403, "Verify your hacker registration first.");
      const event = await getEvent(client);
      const project = await client.query(
        "SELECT data,status FROM project_intakes WHERE owner_id=$1",
        [owner.id],
      );
      const categories = await client.query("SELECT id,name FROM categories ORDER BY name");
      return {
        project: project.rows[0] ?? null,
        categories: categories.rows,
        rules: event.details.projectRules,
        maximum: event.details.maxTeamSize,
      };
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    return NextResponse.json(await saveProject(bearer(request), await readJson(request)));
  } catch (error) {
    return apiError(error);
  }
}
