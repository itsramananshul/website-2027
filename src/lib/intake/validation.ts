import { parsePhoneNumberFromString } from "libphonenumber-js/core";
import phoneMetadata from "libphonenumber-js/metadata.max.json";
import { z } from "zod";
import {
  FORM_KINDS,
  STUDY_LEVELS,
  EXPERTISE_AREAS,
  SPONSOR_GOALS,
  SIDE_EVENTS,
  SPONSOR_TIERS,
  contactFields,
  logisticsFields,
  hackerOptionalFields,
  judgeExtraFields,
  sponsorExtraFields,
  sponsorOnboardingFields,
  volunteerFields,
  speakerFields,
  representativeFields,
  OTHER_FIELD,
  isVisible,
  type Answers,
  type Field,
  type FormKind,
  type EventSettings,
} from "./definitions";
import { COUNTRIES } from "@/app/interest/countries";
const name = (key: string, label: string): Field => ({ name: key, label, required: true });
export const fieldsByKind: Record<FormKind, Field[]> = {
  interest: [
    name("firstName", "First name"),
    name("lastName", "Last name"),
    { name: "email", label: "Email", type: "email", required: true },
    { name: "school", label: "School" },
    { name: "referralSource", label: "How did you hear about RevUC?" },
  ],
  hacker: [
    name("firstName", "First name"),
    name("lastName", "Last name"),
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone number", type: "tel", required: true },
    { name: "age", label: "Age at the event", type: "number", required: true },
    name("school", "School"),
    {
      name: "levelOfStudy",
      label: "Level of study",
      type: "select",
      required: true,
      options: STUDY_LEVELS,
    },
    OTHER_FIELD("otherLevelOfStudy", "Other level of study", "levelOfStudy"),
    name("country", "Country of residence"),
    {
      name: "eligible",
      label: "I am a student and will be at least 18 at the event.",
      type: "checkbox",
      required: true,
    },
    { name: "mlhCoc", label: "MLH Code of Conduct agreement", type: "checkbox", required: true },
    {
      name: "mlhSharing",
      label: "MLH event-information agreement",
      type: "checkbox",
      required: true,
    },
    { name: "mlhEmails", label: "MLH marketing permission", type: "checkbox" },
    ...hackerOptionalFields,
    ...logisticsFields,
  ],
  "judge-mentor": [
    ...contactFields,
    { name: "linkedIn", label: "LinkedIn profile", type: "url" },
    name("organization", "Organization"),
    name("jobTitle", "Job title"),
    {
      name: "expertiseAreas",
      label: "Expertise",
      type: "multi",
      required: true,
      options: EXPERTISE_AREAS,
    },
    OTHER_FIELD("otherExpertise", "Other expertise", "expertiseAreas"),
    {
      name: "roles",
      label: "Roles",
      type: "multi",
      required: true,
      options: ["Judge", "Mentor", "Other"],
    },
    OTHER_FIELD("otherRole", "Other role", "roles"),
    {
      name: "availability",
      label: "In-person availability",
      type: "select",
      required: true,
      options: ["Yes", "No", "Other"],
    },
    OTHER_FIELD("otherAvailability", "Other availability", "availability"),
    { name: "specialRequirements", label: "Special requirements", type: "textarea" },
    { name: "expectations", label: "Expectations", type: "textarea" },
    { name: "additionalInfo", label: "Additional information", type: "textarea" },
    ...judgeExtraFields,
  ],
  sponsor: [
    name("contactName", "Contact name"),
    { name: "email", label: "Email", type: "email", required: true },
    name("organisation", "Organization"),
    {
      name: "sponsorshipTier",
      label: "Sponsorship tier",
      type: "select",
      required: true,
      options: SPONSOR_TIERS,
    },
    {
      name: "selectedGoals",
      label: "Goals",
      type: "multi",
      required: true,
      options: SPONSOR_GOALS,
    },
    OTHER_FIELD("otherGoal", "Other goal", "selectedGoals"),
    { name: "selectedSideEvents", label: "Side events", type: "multi", options: SIDE_EVENTS },
    OTHER_FIELD("otherSideEvent", "Other side event", "selectedSideEvents"),
    { name: "additionalInfo", label: "Additional information", type: "textarea" },
    ...sponsorExtraFields,
  ],
  volunteer: volunteerFields,
  speaker: speakerFields,
  "sponsor-representative": representativeFields,
};
export class FormError extends Error {
  constructor(
    public fields: Record<string, string>,
    public status = 400,
    message = "Please check the highlighted fields.",
  ) {
    super(message);
  }
}
export function validUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function validateAnswers(
  kind: FormKind,
  input: unknown,
  settings?: EventSettings,
  onboarding = false,
): Answers {
  const parsed = z
    .record(
      z.string(),
      z.union([
        z.string().max(4000),
        z.number().finite(),
        z.boolean(),
        z.array(z.string().max(200)).max(30),
      ]),
    )
    .safeParse(input);
  if (!parsed.success)
    throw new FormError({}, 400, "Some answers are too long or invalid. Please check your form.");
  const answers: Answers = {};
  const errors: Record<string, string> = {};
  const fields = [
    ...fieldsByKind[kind],
    ...(onboarding && kind === "sponsor" ? sponsorOnboardingFields : []),
    ...(onboarding && kind !== "interest" && kind !== "hacker" ? logisticsFields : []),
  ];
  for (const field of fields) {
    if (!isVisible(field, parsed.data)) continue;
    const value = parsed.data[field.name];
    if (field.type === "checkbox") {
      if (value !== undefined && typeof value !== "boolean")
        errors[field.name] = "Please use the checkbox.";
      answers[field.name] = value === true;
      if (field.required && value !== true) errors[field.name] = "Please agree before continuing.";
    } else if (field.type === "multi") {
      const items = Array.isArray(value) ? [...new Set(value)] : [];
      answers[field.name] = items;
      if (
        (value !== undefined && !Array.isArray(value)) ||
        items.some((v) => !field.options?.includes(v))
      )
        errors[field.name] = "Please choose one of the listed options.";
      if (field.required && !items.length)
        errors[field.name] = "Please select at least one option.";
    } else {
      const text =
        typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
      answers[field.name] = text;
      if (field.required && !text) errors[field.name] = `${field.label} is required.`;
      if (text && field.type === "email") {
        if (!z.email().safeParse(text).success || text.length > 254)
          errors[field.name] = "Please enter a valid email.";
        answers[field.name] = text.toLowerCase();
      }
      if (text && field.type === "url" && !validUrl(text))
        errors[field.name] = "Please enter a full http or https URL.";
      if (text && field.type === "tel") {
        const phone = parsePhoneNumberFromString(text, phoneMetadata);
        if (!phone?.isValid())
          errors[field.name] = "Enter a valid phone number including its country code.";
        else answers[field.name] = phone.number;
      }
      if (text && field.options && !field.options.includes(text))
        errors[field.name] = "Please choose one of the listed options.";
      if (text && field.type === "number") {
        const n = Number(text);
        if (!Number.isInteger(n) || n < 1 || n > 3000)
          errors[field.name] = "Please enter a whole number.";
        else answers[field.name] = n;
      }
      if (
        (field.name.toLowerCase().includes("name") || field.type === "email") &&
        text.length > 200
      )
        errors[field.name] = "Please keep this under 200 characters.";
    }
  }
  if (kind === "hacker") {
    if (!COUNTRIES.includes(String(answers.country)))
      errors.country = "Please choose a country from the list.";
    if (Number(answers.age) < 18 || Number(answers.age) > 100)
      errors.age = "You must be at least 18 at the event.";
    if (answers.levelOfStudy === "I'm not currently a student")
      errors.levelOfStudy =
        "RevUC is open to students. Contact the organizers about other ways to participate.";
    const year = Number(answers.graduationYear);
    if (answers.graduationYear && (year < 2020 || year > 2100))
      errors.graduationYear = "Please enter a year between 2020 and 2100.";
  }
  if (Number(answers.duration) > 240)
    errors.duration = "Please choose a duration of up to 240 minutes.";
  if (kind === "sponsor" && answers.contactPreference === "Phone" && !answers.phone)
    errors.phone = "Enter a phone number or choose Email as your contact preference.";
  const diet = answers.dietRestrictions;
  if (Array.isArray(diet) && diet.includes("None") && diet.length > 1)
    errors.dietRestrictions = "Choose None by itself, or select your restrictions.";
  if (
    settings?.details.shirtSizes?.length &&
    answers.shirtSize &&
    !settings.details.shirtSizes.includes(String(answers.shirtSize)) &&
    answers.shirtSize !== "No shirt"
  )
    errors.shirtSize = "Please choose an available shirt size.";
  if (["judge-mentor", "volunteer", "speaker", "sponsor-representative"].includes(kind)) {
    const slots = parsed.data.availabilitySlots;
    const relevant =
      settings?.slots.filter(
        (s) =>
          s.roles.includes(kind) ||
          (kind === "judge-mentor" &&
            Array.isArray(answers.roles) &&
            answers.roles.some((role) => s.roles.includes(role))),
      ) ?? [];
    answers.availabilitySlots = Array.isArray(slots) ? [...new Set(slots)] : [];
    answers.availabilityNotes =
      typeof parsed.data.availabilityNotes === "string" ? parsed.data.availabilityNotes.trim() : "";
    if (
      (answers.availabilitySlots as string[]).some((id) => !relevant.some((s) => s.id === id)) ||
      (relevant.length &&
        (kind !== "judge-mentor" || answers.availability === "Yes") &&
        !(answers.availabilitySlots as string[]).length)
    )
      errors.availabilitySlots = "Please select an available session or shift.";
  }
  if (settings?.details.emergencyContact && kind === "hacker") {
    answers.emergencyContact =
      typeof parsed.data.emergencyContact === "string" ? parsed.data.emergencyContact.trim() : "";
  }
  if (settings?.details.travelQuestions && kind !== "interest") {
    answers.travelNeeds =
      typeof parsed.data.travelNeeds === "string" ? parsed.data.travelNeeds.trim() : "";
  }
  if (settings?.details.waiverUrl && kind === "hacker") {
    answers.waiverConsent = parsed.data.waiverConsent === true;
    if (!answers.waiverConsent) errors.waiverConsent = "Please read and agree to the event waiver.";
  }
  if (settings?.details.mediaNotice && kind !== "interest")
    answers.mediaConsent = parsed.data.mediaConsent === true;
  if (Object.keys(errors).length) throw new FormError(errors);
  return answers;
}
export const submissionEnvelope = z.object({
  kind: z.enum(FORM_KINDS),
  answers: z.unknown(),
  requestId: z.uuid(),
  website: z.string().max(200).optional(),
});
