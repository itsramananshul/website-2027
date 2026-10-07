import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface NotifyPayload {
  contactName: string;
  email: string;
  organisation: string;
  sponsorshipLevel: string;
  primaryGoal: string;
  sideEvents: string | null;
  expectations: string | null;
  additionalInfo: string | null;
  referral: string | null;
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
      ${renderRow("Contact Name", payload.contactName)}
      ${renderRow("Email", payload.email)}
      ${renderRow("Organisation", payload.organisation)}
      ${renderRow("Sponsorship Tier", payload.sponsorshipLevel)}
      ${renderRow("Primary Goal", payload.primaryGoal)}
      ${renderRow("Side Events", payload.sideEvents)}
      ${renderRow("Expectations", payload.expectations)}
      ${renderRow("Additional Info", payload.additionalInfo)}
      ${renderRow("Referral", payload.referral)}
    </table>
  `;
}

const SPONSOR_MESSAGE_TEMPLATE_HTML = `
  <p>Hi there,</p>
  <p>Thank you for your interest in sponsoring RevolutionUC! We have successfully received your response from the sponsor interest form.</p>
  <p>Our team is thrilled about the prospect of partnering with you to make this year's hackathon incredible. We will review your details shortly and contact you to discuss the best possible ways to align with your organization's goals.</p>
  <p>In the meantime, if you have any immediate questions, feel free to reply directly to this email or contact sponsor@revolutionuc.com</p>
  <p>Thank you for supporting the tech community!</p>
  <p>
    Best regards,<br />
    The RevolutionUC Sponsorship Team<br />
    University of Cincinnati<br />
    sponsor@revolutionuc.com
  </p>
`;

export async function POST(request: Request) {
  const recipients = (process.env.SPONSOR_NOTIFICATION_EMAILS ?? "")
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

  const [internalResult, sponsorResult] = await Promise.allSettled([
    resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: recipients,
      replyTo: payload.email,
      subject: `New Sponsor Interest: ${payload.organisation}`,
      html: summaryTable,
    }),
    resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: payload.email,
      subject: "Thanks for your interest in sponsoring RevolutionUC!",
      html: `${SPONSOR_MESSAGE_TEMPLATE_HTML}<h3>Your submission</h3>${summaryTable}`,
    }),
  ]);

  const internalError =
    internalResult.status === "fulfilled" ? internalResult.value.error : internalResult.reason;
  const sponsorError =
    sponsorResult.status === "fulfilled" ? sponsorResult.value.error : sponsorResult.reason;

  if (internalError || sponsorError) {
    return NextResponse.json(
      {
        error: "One or more notification emails failed to send",
        internalError: internalError ? String(internalError) : undefined,
        sponsorError: sponsorError ? String(sponsorError) : undefined,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
