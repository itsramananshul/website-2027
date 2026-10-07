import test from "node:test";
import assert from "node:assert/strict";
import { validateAnswers, FormError } from "../src/lib/intake/validation";
import { consentSnapshot } from "../src/lib/intake/consents";
import { validateResume, MAX_RESUME_BYTES } from "../src/lib/intake/storage";
import { readJson, requireCron } from "../src/lib/intake/http";
import { buildMessage, type Job } from "../src/lib/intake/notifications";
import type { EventSettings } from "../src/lib/intake/definitions";
const settings: EventSettings = {
  id: "revuc-2027",
  year: 2027,
  registrationOpen: true,
  capacity: 100,
  startsAt: null,
  endsAt: null,
  confirmationDeadline: null,
  timezone: "America/New_York",
  slots: [],
  details: {},
};
export const hacker = {
  firstName: "José",
  lastName: "O’Neil-张",
  email: "person@example.com",
  phone: "+91 9876543210",
  age: 20,
  school: "School not in list",
  levelOfStudy: "Undergraduate University (3+ year)",
  country: "India",
  eligible: true,
  mlhCoc: true,
  mlhSharing: true,
  mlhEmails: false,
};
const judge = {
  fullName: "Amina O'Neil",
  email: "judge@example.com",
  phone: "+44 7911 123456",
  organization: "Independent",
  jobTitle: "Engineer",
  expertiseAreas: ["Web Development"],
  roles: ["Mentor"],
  availability: "Yes",
  shiftContact: "Email",
  orientation: true,
  confidentiality: true,
  coc: true,
};
test("Unicode names and international numbers survive validation", () => {
  const answer = validateAnswers("hacker", hacker, settings);
  assert.equal(answer.firstName, "José");
  assert.equal(answer.lastName, "O’Neil-张");
  assert.equal(answer.phone, "+919876543210");
  assert.equal(answer.major, "");
  assert.equal(answer.sponsorResumeConsent, false);
});
test("email normalizes, unknown fields cannot become approvals", () => {
  const answer = validateAnswers(
    "hacker",
    { ...hacker, email: " PERSON@EXAMPLE.COM ", status: "APPROVED", emailVerifiedAt: "today" },
    settings,
  );
  assert.equal(answer.email, "person@example.com");
  assert.equal(answer.status, undefined);
});
test("eligibility, required MLH agreements, and country are enforced", () => {
  for (const change of [
    { age: 17 },
    { eligible: false },
    { mlhSharing: false },
    { country: "Atlantis" },
    { levelOfStudy: "I'm not currently a student" },
  ])
    assert.throws(() => validateAnswers("hacker", { ...hacker, ...change }, settings), FormError);
});
test("marketing and sponsor permissions remain independent", () => {
  const answer = validateAnswers(
    "hacker",
    { ...hacker, sponsorResumeConsent: true, sponsorContactConsent: false },
    settings,
  );
  const snapshot = consentSnapshot(answer, settings);
  assert.equal(snapshot.answers.mlhEmails, false);
  assert.equal(snapshot.answers.sponsorResumeConsent, true);
  assert.equal(snapshot.answers.sponsorContactConsent, false);
  assert.match(snapshot.notices.mlhSharing, /https:\/\/dev.to/);
});
test("Other is required only when selected; multi-select answers are arrays", () => {
  assert.throws(
    () => validateAnswers("hacker", { ...hacker, dietRestrictions: ["Other"] }, settings),
    FormError,
  );
  const answers = validateAnswers(
    "hacker",
    { ...hacker, dietRestrictions: ["Vegan", "Gluten-free"] },
    settings,
  );
  assert.deepEqual(answers.dietRestrictions, ["Vegan", "Gluten-free"]);
  assert.throws(() =>
    validateAnswers("hacker", { ...hacker, dietRestrictions: ["None", "Vegan"] }, settings),
  );
});
test("LinkedIn stays optional, supplied profile links must be URLs", () => {
  assert.equal(validateAnswers("judge-mentor", judge, settings).linkedIn, "");
  assert.throws(() =>
    validateAnswers("judge-mentor", { ...judge, linkedIn: "javascript:alert(1)" }, settings),
  );
});
test("judge conflicts are required, mentor-only applicants don't get judge questions", () => {
  assert.equal(validateAnswers("judge-mentor", judge, settings).conflicts, undefined);
  assert.throws(() =>
    validateAnswers("judge-mentor", { ...judge, roles: ["Judge", "Mentor"] }, settings),
  );
  assert.equal(
    validateAnswers(
      "judge-mentor",
      { ...judge, roles: ["Judge", "Mentor"], conflicts: "None" },
      settings,
    ).conflicts,
    "None",
  );
});
test("role-specific availability rejects invented shifts", () => {
  const configured = {
    ...settings,
    slots: [
      { id: "mentor-a", label: "April 10, 10 am", roles: ["Mentor"] },
      { id: "judge-a", label: "April 11, 11 am", roles: ["Judge"] },
    ],
  };
  assert.throws(() =>
    validateAnswers("judge-mentor", { ...judge, availabilitySlots: ["judge-a"] }, configured),
  );
  assert.deepEqual(
    validateAnswers("judge-mentor", { ...judge, availabilitySlots: ["mentor-a"] }, configured)
      .availabilitySlots,
    ["mentor-a"],
  );
});
test("approved roles collect logistics; optional policy fields require configuration", () => {
  const config = {
    ...settings,
    details: { waiverUrl: "https://example.com/waiver", mediaNotice: "May we publish photos?" },
  };
  assert.throws(() => validateAnswers("hacker", hacker, config));
  const a = validateAnswers("hacker", { ...hacker, waiverConsent: true }, config);
  assert.equal(a.mediaConsent, false);
  assert.match(consentSnapshot(a, config).notices.waiverConsent, /example.com/);
});
test("private resumes reject disguised files and oversized PDFs", () => {
  validateResume("resume.pdf", "application/pdf", Buffer.from("%PDF-1.7\n"));
  assert.throws(() => validateResume("resume.pdf", "application/pdf", Buffer.from("not a pdf")));
  assert.throws(() => validateResume("resume.html", "text/html", Buffer.from("%PDF-1.7\n")));
  assert.throws(() =>
    validateResume("resume.pdf", "application/pdf", new Uint8Array(MAX_RESUME_BYTES + 1)),
  );
});
test("JSON request limits also cover streamed bodies without content-length", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(65537));
      controller.close();
    },
  });
  const request = new Request("http://localhost/api", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(
    () => readJson(request),
    (e: unknown) => e instanceof FormError && e.status === 413,
  );
  await assert.rejects(
    () => readJson(new Request("http://localhost/api", { method: "POST", body: "{" })),
    FormError,
  );
});
test("cron rejects malformed unicode credentials without crashing", () => {
  process.env.CRON_SECRET = "secret";
  assert.throws(
    () =>
      requireCron(new Request("http://localhost", { headers: { authorization: "Bearer éééééé" } })),
    FormError,
  );
});
test("Other-only applicants aren't labelled judges; HTML escapes names", () => {
  process.env.APP_PUBLIC_URL = "http://localhost:3001";
  const job = {
    id: "id",
    submission_id: "id",
    type: "receipt",
    payload: { link: "https://example.com/registration#token=abc" },
    email: "person@example.com",
    kind: "judge-mentor",
    data: { fullName: "<script>", roles: ["Other"] },
    attempts: 1,
    lease: "lease",
  } as Job;
  const message = buildMessage(job);
  assert.match(message.text, /helping with the event/);
  assert.doesNotMatch(message.text, /interest in judge/);
  assert.doesNotMatch(message.html, /<script>/);
});

test("declared unavailable judges can leave shifts blank", () => {
  const configured = {
    ...settings,
    slots: [{ id: "mentor-a", label: "April 10, 10 am", roles: ["Mentor"] }],
  };
  assert.deepEqual(
    validateAnswers("judge-mentor", { ...judge, availability: "No" }, configured).availabilitySlots,
    [],
  );
});

test("consent history retains the pending MLH notice until partnership confirmation", () => {
  const pending = consentSnapshot(hacker, settings);
  assert.match(pending.notices.mlhPartnership, /will not be shared/);
  assert.equal(
    consentSnapshot(hacker, { ...settings, details: { mlhPartnerConfirmed: true } }).notices
      .mlhPartnership,
    undefined,
  );
});
