export const EVENT_ID = "revuc-2027";
export const FORM_KINDS = [
  "interest",
  "hacker",
  "judge-mentor",
  "sponsor",
  "volunteer",
  "speaker",
  "sponsor-representative",
] as const;
export type FormKind = (typeof FORM_KINDS)[number];
export type Answers = Record<string, string | number | boolean | string[]>;
export type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "url" | "textarea" | "select" | "multi" | "checkbox" | "number";
  required?: boolean;
  options?: readonly string[];
  help?: string;
  when?: { field: string; value: string };
  autoComplete?: string;
};
export const STUDY_LEVELS = [
  "Less than Secondary / High School",
  "Secondary / High School",
  "Undergraduate University (2 year - community college or similar)",
  "Undergraduate University (3+ year)",
  "Graduate University (Masters, Professional, Doctoral, etc)",
  "Code School / Bootcamp",
  "Other Vocational / Trade Program or Apprenticeship",
  "Post Doctorate",
  "Other",
  "I'm not currently a student",
  "Prefer not to answer",
];
export const EXPERTISE_AREAS = [
  "Software Development",
  "Hardware Engineering",
  "UI/UX",
  "Graphic Design",
  "Data Science & Analytics",
  "Artificial Intelligence & Machine Learning",
  "Cybersecurity",
  "Cloud",
  "Web Development",
  "Business & Entrepreneurship",
  "Product Management",
  "Marketing & Communications",
  "Other",
];
export const SPONSOR_GOALS = [
  "Recruit Top Talent",
  "Build Brand Loyalty",
  "Promote Specific Products or Services",
  "Gain Fresh Perspectives on Business Challenges",
  "Gather Insights on Emerging Technologies",
  "Engage with Local Community",
  "Support Diversity and Inclusion in Tech",
  "Support innovation and education in tech",
  "Demonstrate corporate social responsibility",
  "Foster relationships with emerging tech communities",
  "Teach Specific Skills to Emerging Talent",
  "Other",
];
export const SIDE_EVENTS = [
  "Prize Category",
  "Capture The Flag",
  "Workshop",
  "Coding Escape Room",
  "Fun/Networking Event",
  "Other",
];
export const SPONSOR_TIERS = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Not sure yet",
  "Custom package",
  "In-kind support",
];
export const DIET_OPTIONS = [
  "None",
  "Vegetarian",
  "Vegan",
  "Halal",
  "Kosher",
  "Gluten-free",
  "Other",
  "Prefer to discuss privately",
];
export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "No shirt"];
export const OTHER_FIELD = (name: string, label: string, field: string): Field => ({
  name,
  label,
  type: "textarea",
  required: true,
  when: { field, value: "Other" },
});
export const contactFields: Field[] = [
  { name: "fullName", label: "Full name", required: true, autoComplete: "name" },
  { name: "email", label: "Email", type: "email", required: true, autoComplete: "email" },
  {
    name: "phone",
    label: "Phone number",
    type: "tel",
    required: true,
    autoComplete: "tel",
    help: "Include your country code, for example +1 513 555 0123.",
  },
];
export const logisticsFields: Field[] = [
  { name: "dietRestrictions", label: "Dietary restrictions", type: "multi", options: DIET_OPTIONS },
  OTHER_FIELD("otherDiet", "Other dietary restrictions", "dietRestrictions"),
  {
    name: "foodAllergies",
    label: "Food allergies",
    type: "textarea",
    help: "Optional. An organizer can follow up privately about your request.",
  },
  {
    name: "accessibilityNeeds",
    label: "Accessibility or accommodation requests",
    type: "textarea",
    help: "Optional. Tell us what assistance you need. You do not need to share a diagnosis.",
  },
  {
    name: "shirtSize",
    label: "Shirt size",
    type: "select",
    options: SHIRT_SIZES,
    help: "Availability will be confirmed by the organizers.",
  },
];
export const hackerOptionalFields: Field[] = [
  { name: "preferredName", label: "Preferred name", autoComplete: "nickname" },
  { name: "pronouns", label: "Pronouns" },
  { name: "major", label: "Major or field of study" },
  { name: "graduationYear", label: "Expected graduation year", type: "number" },
  {
    name: "hackathons",
    label: "Previous hackathons",
    type: "select",
    options: ["First hackathon", "1–2", "3–5", "6+"],
  },
  { name: "skills", label: "Skills or technologies you want to work with", type: "textarea" },
  { name: "workshopInterests", label: "Workshops you would like to attend", type: "textarea" },
  {
    name: "teamStatus",
    label: "Team plans",
    type: "select",
    options: [
      "Looking for a team",
      "Already have a team",
      "Open to more teammates",
      "Prefer to work solo",
      "Not sure yet",
    ],
  },
  { name: "githubUrl", label: "GitHub profile", type: "url" },
  { name: "linkedinUrl", label: "LinkedIn or portfolio", type: "url" },
  { name: "discordHandle", label: "Discord handle" },
  { name: "referralSource", label: "How did you hear about RevUC?" },
  {
    name: "gender",
    label: "Gender",
    help: "Optional. You can leave this blank or enter Prefer not to answer.",
  },
  {
    name: "raceEthnicity",
    label: "Race or ethnicity",
    help: "Optional. You can leave this blank or enter Prefer not to answer.",
  },
  {
    name: "sponsorResumeConsent",
    label: "I want my resume shared with authorized RevUC sponsors for recruiting.",
    type: "checkbox",
  },
  {
    name: "sponsorContactConsent",
    label: "RevUC sponsors may contact me about recruiting opportunities.",
    type: "checkbox",
  },
];
export const judgeExtraFields: Field[] = [
  {
    name: "professionalBackground",
    label: "Other profile, CV link, or short professional background",
    type: "textarea",
  },
  {
    name: "categoryPreferences",
    label: "Preferred judging categories",
    help: "You can enter No preference.",
    when: { field: "roles", value: "Judge" },
  },
  {
    name: "previousJudging",
    label: "Previous judging experience",
    type: "textarea",
    when: { field: "roles", value: "Judge" },
  },
  {
    name: "previousMentoring",
    label: "Previous mentoring experience",
    type: "textarea",
    when: { field: "roles", value: "Mentor" },
  },
  {
    name: "technologies",
    label: "Technologies or topics you can help with",
    type: "textarea",
    when: { field: "roles", value: "Mentor" },
  },
  {
    name: "beginnerMentoring",
    label: "I am interested in helping first-time hackers.",
    type: "checkbox",
    when: { field: "roles", value: "Mentor" },
  },
  {
    name: "workshopInterest",
    label: "I am interested in hosting a workshop.",
    type: "checkbox",
    when: { field: "roles", value: "Mentor" },
  },
  {
    name: "conflicts",
    label: "Conflicts of interest",
    type: "textarea",
    required: true,
    help: "List teams, close relationships, or affiliations that could affect judging. Enter None if you have no known conflicts.",
    when: { field: "roles", value: "Judge" },
  },
  { name: "shiftContact", label: "Preferred contact method during your shift", required: true },
  {
    name: "orientation",
    label: "I can attend the organizer briefing for my role.",
    type: "checkbox",
    required: true,
  },
  {
    name: "confidentiality",
    label:
      "I will keep private submissions confidential and disclose conflicts before reviewing a team.",
    type: "checkbox",
    required: true,
  },
  {
    name: "coc",
    label: "I have read and agree to the event Code of Conduct.",
    type: "checkbox",
    required: true,
  },
];
export const sponsorExtraFields: Field[] = [
  { name: "website", label: "Company website", type: "url" },
  { name: "contactRole", label: "Your role" },
  {
    name: "phone",
    label: "Phone number",
    type: "tel",
    autoComplete: "tel",
    help: "Optional. Include the country code.",
  },
  {
    name: "contactPreference",
    label: "Preferred contact method",
    type: "select",
    options: ["Email", "Phone", "Either"],
  },
  { name: "budgetRange", label: "Approximate budget" },
  { name: "decisionTimeline", label: "Decision timeline" },
  {
    name: "contributions",
    label: "Ways you would like to support the event",
    type: "multi",
    options: [
      "Cash sponsorship",
      "Prizes",
      "Food",
      "Hardware",
      "API or cloud credits",
      "Mentors",
      "Workshops",
      "Other",
    ],
  },
  OTHER_FIELD("otherContribution", "Other contribution", "contributions"),
];
export const sponsorOnboardingFields: Field[] = [
  { name: "logoUrl", label: "Logo file link", type: "url" },
  { name: "brandInstructions", label: "Logo usage instructions", type: "textarea" },
  { name: "sponsorBlurb", label: "Website blurb", type: "textarea" },
  {
    name: "billingContact",
    label: "Invoice or PO contact",
    help: "Contact details only. Do not enter bank or payment-card details.",
  },
  {
    name: "representativeDetails",
    label: "On-site representatives and contact details",
    type: "textarea",
  },
  { name: "boothNeeds", label: "Booth space, power, and network needs", type: "textarea" },
  {
    name: "workshopDetails",
    label: "Workshop title, audience, duration, availability, and equipment",
    type: "textarea",
  },
  {
    name: "prizeDetails",
    label: "Prize or challenge criteria, eligibility, judges, and deliverables",
    type: "textarea",
  },
  {
    name: "coc",
    label: "I have read and agree to the event Code of Conduct.",
    type: "checkbox",
    required: true,
  },
];
export const volunteerFields: Field[] = [
  ...contactFields,
  {
    name: "duties",
    label: "Preferred duties",
    type: "multi",
    required: true,
    options: [
      "Check-in",
      "Meals",
      "Room support",
      "Technical support",
      "Workshop assistance",
      "Setup",
      "Cleanup",
      "No preference",
    ],
  },
  { name: "skills", label: "Useful skills", type: "textarea" },
  { name: "experience", label: "Previous volunteer experience", type: "textarea" },
  {
    name: "orientation",
    label: "I can attend the volunteer briefing.",
    type: "checkbox",
    required: true,
  },
  {
    name: "coc",
    label: "I have read and agree to the event Code of Conduct.",
    type: "checkbox",
    required: true,
  },
];
export const speakerFields: Field[] = [
  ...contactFields,
  { name: "organization", label: "Affiliation", help: "Independent is fine." },
  { name: "title", label: "Talk or workshop title", required: true },
  { name: "abstract", label: "Short description", type: "textarea", required: true },
  {
    name: "audience",
    label: "Audience level",
    type: "select",
    required: true,
    options: ["Beginner", "Intermediate", "Advanced", "All levels"],
  },
  { name: "duration", label: "Duration in minutes", type: "number", required: true },
  { name: "equipment", label: "Equipment needs", type: "textarea" },
  { name: "bio", label: "Short bio or profile link", type: "textarea" },
  {
    name: "recordingConsent",
    label: "I agree to recording and publication of my session.",
    type: "checkbox",
  },
  {
    name: "profileConsent",
    label: "I agree to publication of my speaker profile.",
    type: "checkbox",
  },
  {
    name: "coc",
    label: "I have read and agree to the event Code of Conduct.",
    type: "checkbox",
    required: true,
  },
];
export const representativeFields: Field[] = [
  ...contactFields,
  { name: "organization", label: "Sponsor company", required: true },
  { name: "contactRole", label: "Your role" },
  {
    name: "coc",
    label: "I have read and agree to the event Code of Conduct.",
    type: "checkbox",
    required: true,
  },
  {
    name: "resumeUseAgreement",
    label:
      "I will use opted-in resumes only for recruiting for my sponsoring company, keep them private, and follow RevUC's sharing instructions.",
    type: "checkbox",
    required: true,
  },
];
export type AvailabilitySlot = { id: string; label: string; roles: string[] };
export type EventSettings = {
  id: string;
  year: number;
  registrationOpen: boolean;
  capacity: number | null;
  startsAt: string | null;
  endsAt: string | null;
  confirmationDeadline: string | null;
  timezone: string;
  slots: AvailabilitySlot[];
  details: {
    mlhPartnerConfirmed?: boolean;
    accessibilityContact?: string;
    waiverUrl?: string;
    mediaNotice?: string;
    emergencyContact?: boolean;
    travelQuestions?: boolean;
    expensePolicy?: string;
    privacyNotice?: string;
    retentionNotice?: string;
    shirtSizes?: string[];
    projectSubmissionOpen?: boolean;
    maxTeamSize?: number;
    projectRules?: string;
  };
};
export function isVisible(field: Field, answers: Answers) {
  if (!field.when) return true;
  const value = answers[field.when.field];
  return Array.isArray(value) ? value.includes(field.when.value) : value === field.when.value;
}
