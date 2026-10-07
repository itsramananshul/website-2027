import type { Answers, EventSettings } from "./definitions";
export const CONSENT_VERSION = "revuc-2027-2026-10-06";
export const COC_URL = "https://github.com/MLH/mlh-policies/blob/main/code-of-conduct.md";
export const MLH_COC = "I have read and agree to the MLH Code of Conduct.";
export const MLH_SHARING =
  "I authorize you to share my application/registration information with Major League Hacking for event administration, ranking, and MLH/DEV administration (including the creation of linked accounts on MLH and DEV) in line with the MLH Privacy Policy. I further agree to the terms of both the MLH Contest Terms and Conditions and the MLH Privacy Policy.";
export const MLH_EMAILS =
  "I authorize MLH and DEV to send me occasional emails about relevant events, career opportunities, and community announcements.";
export const SPONSOR_RESUMES =
  "I want my resume shared with authorized RevUC sponsors for recruiting.";
export const MLH_PENDING =
  "We are currently in the process of partnering with MLH. The following 3 checkboxes are for this partnership. If we do not end up partnering with MLH, your information will not be shared.";
export function consentSnapshot(answers: Answers, settings: EventSettings) {
  const notices: Record<string, string> = {
    mlhCoc: `${MLH_COC} ${COC_URL}`,
    mlhSharing: `${MLH_SHARING} https://dev.to https://github.com/MLH/mlh-policies/blob/main/privacy-policy.md https://github.com/MLH/mlh-policies/blob/main/contest-terms.md`,
    mlhEmails: MLH_EMAILS,
    sponsorResumeConsent: SPONSOR_RESUMES,
    sponsorContactConsent: "RevUC sponsors may contact me about recruiting opportunities.",
    coc: `I have read and agree to the event Code of Conduct. ${COC_URL}`,
    confidentiality:
      "I will keep private submissions confidential and disclose conflicts before reviewing a team.",
    orientation: "I can attend the organizer briefing for my role.",
    recordingConsent: "I agree to recording and publication of my session.",
    profileConsent: "I agree to publication of my speaker profile.",
    eligible: "I am a student and will be at least 18 at the event.",
    resumeUseAgreement:
      "I will use opted-in resumes only for recruiting for my sponsoring company, keep them private, and follow RevUC's sharing instructions.",
  };
  if (settings.details.waiverUrl)
    notices.waiverConsent = `I have read and agree to the event waiver. ${settings.details.waiverUrl}`;
  if (settings.details.mediaNotice) notices.mediaConsent = settings.details.mediaNotice;
  if ("duties" in answers) notices.orientation = "I can attend the volunteer briefing.";
  const recorded = Object.fromEntries(
    Object.keys(notices)
      .filter((key) => typeof answers[key] === "boolean")
      .map((key) => [key, answers[key]]),
  );
  const recordedNotices = Object.fromEntries(
    Object.keys(recorded).map((key) => [key, notices[key]]),
  );
  if ("mlhSharing" in recorded && settings.details.mlhPartnerConfirmed !== true)
    recordedNotices.mlhPartnership = MLH_PENDING;
  return { answers: recorded, notices: recordedNotices, version: CONSENT_VERSION };
}
