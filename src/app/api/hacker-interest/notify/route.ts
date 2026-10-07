import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface NotifyPayload {
  firstName: string;
  lastName: string;
  age: string;
  phone: string;
  email: string;
  school: string;
  levelOfStudy: string;
  otherLevelOfStudy: string | null;
  country: string;
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
  const levelOfStudy =
    payload.levelOfStudy === "Other" && payload.otherLevelOfStudy
      ? `Other: ${payload.otherLevelOfStudy}`
      : payload.levelOfStudy;

  return `
    <table cellpadding="0" cellspacing="0">
      ${renderRow("First Name", payload.firstName)}
      ${renderRow("Last Name", payload.lastName)}
      ${renderRow("Age", payload.age)}
      ${renderRow("Phone", payload.phone)}
      ${renderRow("Email", payload.email)}
      ${renderRow("School", payload.school)}
      ${renderRow("Level of Study", levelOfStudy)}
      ${renderRow("Country of Residence", payload.country)}
    </table>
  `;
}

const HACKER_MESSAGE_TEMPLATE_HTML = `
  <p>Hi there,</p>
  <p>Thank you for your interest in RevolutionUC 2027! We have successfully received your response from the hacker interest form.</p>
  <p>We'll let you know as soon as registration opens.</p>
  <p>If you have any immediate questions, feel free to reply directly to this email or contact info@revolutionuc.com.</p>
  <p>Thanks for your interest, and we can't wait to hack with you!</p>
  <p>
    Best regards,<br />
    The RevolutionUC Team<br />
    University of Cincinnati<br />
    info@revolutionuc.com
  </p>
`;

export async function POST(request: Request) {
  const payload: NotifyPayload = await request.json();
  const summaryTable = renderSummaryTable(payload);
  const fromEmail = process.env.HACKER_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL!;
  const segmentId = process.env.HACKER_SEGMENT_ID;

  const [emailResult, contactResult] = await Promise.allSettled([
    resend.emails.send({
      from: fromEmail,
      to: payload.email,
      subject: "Thanks for your interest in RevolutionUC 2027!",
      html: `${HACKER_MESSAGE_TEMPLATE_HTML}<h3>Your submission</h3>${summaryTable}`,
    }),
    segmentId
      ? resend.contacts.create({
          email: payload.email,
          firstName: payload.firstName,
          lastName: payload.lastName,
          segments: [{ id: segmentId }],
        })
      : Promise.resolve(null),
  ]);

  const emailError =
    emailResult.status === "fulfilled" ? emailResult.value.error : emailResult.reason;

  if (contactResult.status === "rejected") {
    console.error("Failed to add hacker to Resend segment", contactResult.reason);
  } else if (contactResult.value?.error) {
    console.error("Failed to add hacker to Resend segment", contactResult.value.error);
  }

  if (emailError) {
    return NextResponse.json(
      { error: "Failed to send confirmation email", details: String(emailError) },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
