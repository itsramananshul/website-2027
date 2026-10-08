import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { validateAnswers, FormError } from "../src/lib/intake/validation";
import { submissionData, saveForm } from "../src/lib/intake/submission";
import {
  validateResume,
  MAX_RESUME_BYTES,
  cleanupToken,
  cleanupPath,
} from "../src/lib/intake/storage";
import { hacker, judge, sponsor } from "./fixtures";

test("existing hacker interest choices work without new answers or verification", () => {
  const result = validateAnswers("hacker", {
    ...hacker,
    age: "13",
    levelOfStudy: "I'm not currently a student",
  });
  assert.equal(result.age, 13);
  assert.equal(result.firstName, "Zoë");
  assert.equal(result.lastName, "O'Connor");
  assert.equal(result.phone, "+15135550123");
  assert.equal(result.sponsorResumeConsent, false);
  assert.equal(result.sponsorContactConsent, false);
  assert.equal(result.mlhEmails, false);
  assert.equal(
    validateAnswers("hacker", { ...hacker, phone: "+91 98765 43210" }).phone,
    "+919876543210",
  );
});
test("the existing MLH requirements remain required and marketing stays optional", () => {
  assert.throws(
    () => validateAnswers("hacker", { ...hacker, mlhCoc: false, mlhSharing: false }),
    (error: unknown) =>
      error instanceof FormError && Boolean(error.fields.mlhCoc && error.fields.mlhSharing),
  );
});
test("new optional answers validate without adding eligibility or approval gates", () => {
  const result = validateAnswers("hacker", {
    ...hacker,
    dietRestrictions: ["Other"],
    otherDiet: "Nut-free",
    sponsorResumeConsent: true,
    githubUrl: "https://github.com/example",
  });
  assert.deepEqual(result.dietRestrictions, ["Other"]);
  assert.equal(result.sponsorResumeConsent, true);
  assert.equal(result.sponsorContactConsent, false);
  assert.throws(
    () => validateAnswers("hacker", { ...hacker, githubUrl: "javascript:alert(1)" }),
    FormError,
  );
  assert.throws(
    () => validateAnswers("hacker", { ...hacker, dietRestrictions: ["None", "Vegan"] }),
    FormError,
  );
  assert.throws(
    () => validateAnswers("hacker", { ...hacker, levelOfStudy: "Other", otherLevelOfStudy: "" }),
    FormError,
  );
});
test("judges can omit all extra questions and LinkedIn; conditional details still validate", () => {
  const result = validateAnswers("judge-mentor", judge);
  assert.equal(result.linkedIn, "");
  assert.equal(result.shiftContact, "");
  assert.equal(result.orientation, false);
  assert.throws(
    () => validateAnswers("judge-mentor", { ...judge, roles: ["Other"], otherRole: "" }),
    FormError,
  );
});
test("existing database columns and notification payloads stay compatible", () => {
  const h = submissionData("hacker", validateAnswers("hacker", hacker), "revuc-2027/test.pdf");
  assert.equal(h.table, "hacker_interest");
  assert.equal(h.endpoint, "/api/hacker-interest/notify");
  assert.equal(h.row.age, "20");
  assert.equal(h.row.first_name, "Zoë");
  assert.equal(h.row.resume_path, "revuc-2027/test.pdf");
  assert.ok(!("email" in h.row.extra_data));
  const j = submissionData("judge-mentor", validateAnswers("judge-mentor", judge));
  assert.equal(j.table, "judge_mentor_interest");
  assert.equal(j.row.expertise_areas, "Software Development, Other: Robotics");
  assert.equal(j.row.roles, "Judge, Mentor");
  assert.equal(j.row.availability, "Other: Afternoon");
  assert.equal(j.row.linkedin_url, "");
  assert.ok("selectedRoles" in j.notification);
  assert.deepEqual(j.notification.selectedRoles, ["Judge", "Mentor"]);
  const s = submissionData("sponsor", validateAnswers("sponsor", sponsor));
  assert.equal(s.table, "sponsor_interest");
  assert.equal(s.row.sponsorship_level, "Silver - ~$1k-3k");
  assert.equal(s.row.primary_goal, "Recruit Top Talent, Other: Student projects");
  assert.equal(s.row.side_events, "Workshop, Other: Demo night");
});
test("a failed database save never triggers email", async () => {
  let mail = 0;
  const database = {
    from: () => ({ insert: async () => ({ error: { message: "Unavailable" } }) }),
  };
  await assert.rejects(
    saveForm(database, "hacker", hacker, undefined, async () => {
      mail++;
      return new Response();
    }),
  );
  assert.equal(mail, 0);
});
test("email is called immediately after save and email failure keeps the saved result", async () => {
  const calls: string[] = [];
  const database = {
    from: (table: string) => ({
      insert: async () => {
        calls.push(table);
        return { error: null };
      },
    }),
  };
  const result = await saveForm(database, "sponsor", sponsor, undefined, async (url) => {
    calls.push(String(url));
    return new Response("", { status: 503 });
  });
  assert.deepEqual(calls, ["sponsor_interest", "/api/sponsor-interest/notify"]);
  assert.equal(result.saved, true);
  assert.match(result.notificationWarning, /don't need to submit again/);
});
test("all three original Resend handlers are unchanged from main", () => {
  for (const kind of ["hacker-interest", "judge-mentor-interest", "sponsor-interest"]) {
    const file = `src/app/api/${kind}/notify/route.ts`;
    const original = execFileSync("git", ["show", `origin/main:${file}`], {
      encoding: "utf8",
    }).replace(/\r\n/g, "\n");
    assert.equal(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), original);
  }
});
test("resume checks reject invalid PDFs and oversized files", () => {
  assert.doesNotThrow(() =>
    validateResume("resume.pdf", "application/pdf", Buffer.from("%PDF-1.7\nexample")),
  );
  for (const [name, type, bytes] of [
    ["resume.exe", "application/pdf", Buffer.from("%PDF-")],
    ["resume.pdf", "text/plain", Buffer.from("%PDF-")],
    ["resume.pdf", "application/pdf", Buffer.from("not a pdf")],
    ["resume.pdf", "application/pdf", new Uint8Array(MAX_RESUME_BYTES + 1)],
  ] as const)
    assert.throws(() => validateResume(name, type, bytes), FormError);
});
test("cleanup receipts are scoped to their own upload, expire, and cannot be forged", () => {
  const path = "revuc-2027/11111111-1111-4111-8111-111111111111.pdf";
  const token = cleanupToken(path, "test-secret", 1000);
  assert.equal(cleanupPath(token, "test-secret", 2000), path);
  assert.throws(() => cleanupPath(token, "different-secret", 2000), FormError);
  assert.throws(() => cleanupPath(token, "test-secret", 3601001), FormError);
  const [payload, signature] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({ path: "someone-elses.pdf", expires: 9999999 }),
  ).toString("base64url");
  assert.throws(() => cleanupPath(`${forged}.${signature}`, "test-secret", 2000), FormError);
  assert.throws(() => cleanupPath(`${payload}.bad.extra`, "test-secret", 2000), FormError);
});
