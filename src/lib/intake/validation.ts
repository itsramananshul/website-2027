import { parsePhoneNumberFromString } from "libphonenumber-js/core";
import phoneMetadata from "libphonenumber-js/metadata.max.json";
import { z } from "zod";
import {
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
  OTHER_FIELD,
  isVisible,
  type Answers,
  type Field,
  type FormKind,
} from "./definitions";
import { COUNTRIES } from "@/app/interest/countries";
const name = (key: string, label: string): Field => ({ name: key, label, required: true });
export const fieldsByKind: Record<FormKind, Field[]> = {
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
export function validateAnswers(kind: FormKind, input: unknown): Answers {
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
  const fields = fieldsByKind[kind];
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
        const phone = parsePhoneNumberFromString(text, "US", phoneMetadata);
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
    if (Number(answers.age) < 13 || Number(answers.age) > 100)
      errors.age = "Please select an age between 13 and 100.";
    const year = Number(answers.graduationYear);
    if (answers.graduationYear && (year < 2020 || year > 2100))
      errors.graduationYear = "Please enter a year between 2020 and 2100.";
  }
  if (kind === "sponsor" && answers.contactPreference === "Phone" && !answers.phone)
    errors.phone = "Enter a phone number or choose Email as your contact preference.";
  const diet = answers.dietRestrictions;
  if (Array.isArray(diet) && diet.includes("None") && diet.length > 1)
    errors.dietRestrictions = "Choose None by itself, or select your restrictions.";
  if (kind === "judge-mentor") {
    answers.availabilityNotes =
      typeof parsed.data.availabilityNotes === "string" ? parsed.data.availabilityNotes.trim() : "";
  }
  if (Object.keys(errors).length) throw new FormError(errors);
  return answers;
}
