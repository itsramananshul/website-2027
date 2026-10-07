import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface NotifyPayload {
  fullName: string;
  email: string;
  linkedIn: string;
  phone: string;
  organization: string;
  jobTitle: string;
  expertiseAreas: string | null;
  roles: string | null;
  selectedRoles: string[];
  availability: string;
  specialRequirements: string | null;
  expectations: string | null;
  additionalInfo: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderRow(label: string, value: string | null): string {
  if (!value) return "";
  return `<tr><td style="padding:4px 12px 4px 0;font-weight:600;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:4px 0;">${escapeHtml(value)}</td></tr>`;
}

function renderSummaryTable(payload: NotifyPayload): string {
  return `
    <table cellpadding="0" cellspacing="0">
      ${renderRow("Full Name", payload.fullName)}
      ${renderRow("Email", payload.email)}
      ${renderRow("LinkedIn", payload.linkedIn)}
      ${renderRow("Phone", payload.phone)}
      ${renderRow("Organization", payload.organization)}
      ${renderRow("Job Title", payload.jobTitle)}
      ${renderRow("Expertise Areas", payload.expertiseAreas)}
      ${renderRow("Roles", payload.roles)}
      ${renderRow("In-Person Availability", payload.availability)}
      ${renderRow("Special Requirements", payload.specialRequirements)}
      ${renderRow("Expectations", payload.expectations)}
      ${renderRow("Additional Info", payload.additionalInfo)}
    </table>
  `;
}

function buildMessageTemplateHtml(interestPhrase: string, roleLabel: string, processWord: string): string {
  return `
    <p>Hello,</p>
    <p>Thank you for your interest in ${interestPhrase} this year's hackathon with RevolutionUC! We have successfully received your response from the ${roleLabel} Interest Form. We will review your details shortly and contact you to discuss the ${interestPhrase} ${processWord} and further details.</p>
    <p>If you have any immediate questions, feel free to contact info@revolutionuc.com.</p>
    <p>Thank you for your time and support. We appreciate your willingness to help make this event a success!</p>
    <p>
      Best regards,<br />
      The RevolutionUC Logistics Team<br />
      University of Cincinnati<br />
      info@revolutionuc.com
    </p>
  `;
}

export async function POST(request: Request) {
  const recipients = (process.env.JUDGE_MENTOR_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No notification recipients configured" },
      { status: 500 },
    );
  }

  const payload: NotifyPayload = await request.json();
  const summaryTable = renderSummaryTable(payload);
  const [firstName, ...lastNameParts] = payload.fullName.trim().split(/\s+/);
  const lastName = lastNameParts.join(" ") || undefined;

  const isJudge = payload.selectedRoles.includes("Judge");
  const isMentor = payload.selectedRoles.includes("Mentor");

  const interestPhrase =
    isJudge && isMentor ? "judging and mentoring" : isMentor ? "mentoring" : "judging";
  const roleLabel = isJudge && isMentor ? "Judge/Mentor" : isMentor ? "Mentor" : "Judge";
  const processWord = isJudge && isMentor ? "processes" : "process";

  const segmentIds = [
    isJudge ? process.env.JUDGE_SEGMENT_ID : undefined,
    isMentor ? process.env.MENTOR_SEGMENT_ID : undefined,
  ].filter((id): id is string => Boolean(id));

  const fromEmail = process.env.JUDGE_MENTOR_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL!;

  const [internalResult, submitterResult, contactResult] = await Promise.allSettled([
    resend.emails.send({
      from: fromEmail,
      to: recipients,
      replyTo: payload.email,
      subject: `New Judge/Mentor Interest: ${payload.fullName}`,
      html: summaryTable,
    }),
    resend.emails.send({
      from: fromEmail,
      to: payload.email,
      subject: `Thanks for your interest in ${interestPhrase} at RevolutionUC!`,
      html: `${buildMessageTemplateHtml(interestPhrase, roleLabel, processWord)}<h3>Your submission</h3>${summaryTable}`,
    }),
    segmentIds.length > 0
      ? resend.contacts.create({
          email: payload.email,
          firstName,
          lastName,
          segments: segmentIds.map((id) => ({ id })),
        })
      : Promise.resolve(null),
  ]);

  const internalError =
    internalResult.status === "fulfilled" ? internalResult.value.error : internalResult.reason;
  const submitterError =
    submitterResult.status === "fulfilled" ? submitterResult.value.error : submitterResult.reason;

  if (contactResult.status === "rejected") {
    console.error("Failed to add judge/mentor to Resend segment", contactResult.reason);
  } else if (contactResult.value?.error) {
    console.error("Failed to add judge/mentor to Resend segment", contactResult.value.error);
  }

  if (internalError || submitterError) {
    return NextResponse.json(
      {
        error: "One or more notification emails failed to send",
        internalError: internalError ? String(internalError) : undefined,
        submitterError: submitterError ? String(submitterError) : undefined,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
