import type { Answers, FormKind } from "./definitions";
type Database = {
  from(table: string): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
};
const text = (value: Answers[string] | undefined) => String(value ?? "").trim();
const optional = (value: Answers[string] | undefined) => text(value) || null;
function choices(value: Answers[string] | undefined, other: Answers[string] | undefined) {
  return (
    (Array.isArray(value) ? value : [])
      .map((item) => (item === "Other" && text(other) ? `Other: ${text(other)}` : item))
      .join(", ") || null
  );
}
// Preserve main's existing columns and notification payloads. Extra answers are additive.
export function submissionData(kind: FormKind, answers: Answers, resumePath?: string) {
  const originalFields: Record<FormKind, string[]> = {
    hacker: [
      "firstName",
      "lastName",
      "age",
      "phone",
      "email",
      "school",
      "levelOfStudy",
      "otherLevelOfStudy",
      "country",
      "mlhCoc",
      "mlhSharing",
      "mlhEmails",
    ],
    "judge-mentor": [
      "fullName",
      "email",
      "linkedIn",
      "phone",
      "organization",
      "jobTitle",
      "expertiseAreas",
      "otherExpertise",
      "roles",
      "otherRole",
      "availability",
      "otherAvailability",
      "specialRequirements",
      "expectations",
      "additionalInfo",
    ],
    sponsor: [
      "contactName",
      "email",
      "organisation",
      "sponsorshipTier",
      "selectedGoals",
      "otherGoal",
      "selectedSideEvents",
      "otherSideEvent",
      "additionalInfo",
    ],
  };
  const extra_data = Object.fromEntries(
    Object.entries(answers).filter(([key]) => !originalFields[kind].includes(key)),
  );
  if (kind === "hacker") {
    const notification = {
      firstName: text(answers.firstName),
      lastName: text(answers.lastName),
      age: text(answers.age),
      phone: text(answers.phone),
      email: text(answers.email),
      school: text(answers.school),
      levelOfStudy: text(answers.levelOfStudy),
      otherLevelOfStudy: optional(answers.otherLevelOfStudy),
      country: text(answers.country),
    };
    return {
      table: "hacker_interest",
      endpoint: "/api/hacker-interest/notify",
      notification,
      row: {
        first_name: notification.firstName,
        last_name: notification.lastName,
        age: notification.age,
        phone: notification.phone,
        email: notification.email,
        school: notification.school,
        level_of_study: notification.levelOfStudy,
        other_level_of_study: notification.otherLevelOfStudy,
        country: notification.country,
        mlh_coc: answers.mlhCoc === true,
        mlh_sharing: answers.mlhSharing === true,
        mlh_emails: answers.mlhEmails === true,
        extra_data,
        resume_path: resumePath ?? null,
      },
    };
  }
  if (kind === "judge-mentor") {
    const notification = {
      fullName: text(answers.fullName),
      email: text(answers.email),
      linkedIn: text(answers.linkedIn),
      phone: text(answers.phone),
      organization: text(answers.organization),
      jobTitle: text(answers.jobTitle),
      expertiseAreas: choices(answers.expertiseAreas, answers.otherExpertise),
      roles: choices(answers.roles, answers.otherRole),
      selectedRoles: answers.roles,
      availability:
        answers.availability === "Other" && text(answers.otherAvailability)
          ? `Other: ${text(answers.otherAvailability)}`
          : text(answers.availability),
      specialRequirements: optional(answers.specialRequirements),
      expectations: optional(answers.expectations),
      additionalInfo: optional(answers.additionalInfo),
    };
    return {
      table: "judge_mentor_interest",
      endpoint: "/api/judge-mentor-interest/notify",
      notification,
      row: {
        full_name: notification.fullName,
        email: notification.email,
        linkedin_url: notification.linkedIn,
        phone: notification.phone,
        organization: notification.organization,
        job_title: notification.jobTitle,
        expertise_areas: notification.expertiseAreas,
        roles: notification.roles,
        availability: notification.availability,
        special_requirements: notification.specialRequirements,
        expectations: notification.expectations,
        additional_info: notification.additionalInfo,
        extra_data,
      },
    };
  }
  if (kind === "sponsor") {
    const amounts: Record<string, string> = {
      Bronze: "~$1k",
      Silver: "~$1k-3k",
      Gold: "~$3k-5k",
      Platinum: "~$5k+",
    };
    const tier = text(answers.sponsorshipTier);
    const notification = {
      contactName: text(answers.contactName),
      email: text(answers.email),
      organisation: text(answers.organisation),
      sponsorshipLevel: amounts[tier] ? `${tier} - ${amounts[tier]}` : tier,
      primaryGoal: choices(answers.selectedGoals, answers.otherGoal),
      sideEvents: choices(answers.selectedSideEvents, answers.otherSideEvent),
      additionalInfo: optional(answers.additionalInfo),
    };
    return {
      table: "sponsor_interest",
      endpoint: "/api/sponsor-interest/notify",
      notification,
      row: {
        contact_name: notification.contactName,
        email: notification.email,
        organisation: notification.organisation,
        sponsorship_level: notification.sponsorshipLevel,
        primary_goal: notification.primaryGoal,
        side_events: notification.sideEvents,
        additional_info: notification.additionalInfo,
        extra_data,
      },
    };
  }
  throw new Error("Unsupported interest form.");
}
export async function saveForm(
  database: Database,
  kind: FormKind,
  answers: Answers,
  resumePath?: string,
  send: typeof fetch = fetch,
) {
  const submission = submissionData(kind, answers, resumePath);
  const { error } = await database.from(submission.table).insert(submission.row);
  if (error)
    throw new Error("We couldn't save your form. Your answers are still here. Please try again.");
  if (!submission.endpoint) return { saved: true, notificationWarning: "" };
  try {
    const response = await send(submission.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission.notification),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Notification failed");
    return { saved: true, notificationWarning: "" };
  } catch {
    return {
      saved: true,
      notificationWarning:
        "Your response is saved, but we couldn't send the confirmation email. You don't need to submit again.",
    };
  }
}
