import sgMail from "@sendgrid/mail";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@meetspace.io";
const APP_NAME = "MeetSpace Manager";

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

function isConfigured(): boolean {
  return !!SENDGRID_API_KEY;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!isConfigured()) {
    console.warn("[Email] SendGrid not configured, skipping email to:", to);
    return false;
  }
  try {
    await sgMail.send({
      to,
      from: { email: FROM_EMAIL, name: APP_NAME },
      subject,
      html,
    });
    console.log(`[Email] Sent "${subject}" to ${to}`);
    return true;
  } catch (error: any) {
    console.error("[Email] Failed to send:", error?.response?.body || error.message);
    return false;
  }
}

function baseTemplate(content: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1a1a2e; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px;">${APP_NAME}</h1>
      </div>
      <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        ${content}
      </div>
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
        This is an automated message from ${APP_NAME}. Please do not reply directly to this email.
      </p>
    </div>
  `;
}

export async function sendBookingConfirmation(params: {
  to: string;
  displayName: string;
  title: string;
  roomName: string;
  facilityName: string;
  startTime: string;
  endTime: string;
  meetingType?: string;
  meetingLink?: string | null;
  bookedForName?: string | null;
}): Promise<boolean> {
  const dn = escapeHtml(params.displayName);
  const title = escapeHtml(params.title);
  const roomName = escapeHtml(params.roomName);
  const facilityName = escapeHtml(params.facilityName);
  const startTime = escapeHtml(params.startTime);
  const endTime = escapeHtml(params.endTime);

  const onBehalfOf = params.bookedForName
    ? `<p style="color: #374151; margin: 8px 0;">Booked on behalf of: <strong>${escapeHtml(params.bookedForName)}</strong></p>`
    : "";

  const meetingBadge = params.meetingType && params.meetingType !== "none"
    ? `<span style="background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${escapeHtml(params.meetingType)}</span>`
    : "";

  const meetingLinkRow = params.meetingLink
    ? `<tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Meeting Link</td>
          <td style="padding: 6px 0; font-size: 14px;"><a href="${escapeHtml(params.meetingLink)}" style="color: #2563eb; text-decoration: underline;">Join Meeting</a></td>
        </tr>`
    : "";

  const html = baseTemplate(`
    <h2 style="color: #111827; margin: 0 0 16px;">Booking Confirmed</h2>
    <p style="color: #374151; margin: 0 0 16px;">Hi ${dn}, your room has been booked successfully.</p>
    <div style="background: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Meeting</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${title} ${meetingBadge}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Room</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px;">${roomName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Facility</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px;">${facilityName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Start</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px;">${startTime}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">End</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px;">${endTime}</td>
        </tr>
        ${meetingLinkRow}
      </table>
    </div>
    ${onBehalfOf}
    <p style="color: #6b7280; font-size: 13px;">If you need to make changes, please visit the MeetSpace Manager dashboard.</p>
  `);

  return sendEmail(params.to, `Booking Confirmed: ${params.title}`, html);
}

export async function sendApprovalNotification(params: {
  to: string;
  displayName: string;
  loginUrl?: string;
}): Promise<boolean> {
  const loginLink = params.loginUrl || "";
  const loginButton = loginLink
    ? `<a href="${loginLink}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 8px;">Log In Now</a>`
    : `<p style="color: #374151;">You can now log in with your credentials.</p>`;

  const html = baseTemplate(`
    <h2 style="color: #111827; margin: 0 0 16px;">Account Approved</h2>
    <p style="color: #374151; margin: 0 0 16px;">Hi ${escapeHtml(params.displayName)}, your MeetSpace Manager account has been approved by an administrator.</p>
    <p style="color: #374151; margin: 0 0 16px;">You now have full access to book conference rooms, view availability, and manage your bookings.</p>
    ${loginButton}
  `);

  return sendEmail(params.to, "Your MeetSpace Manager Account Has Been Approved", html);
}

export async function sendNewRegistrationAlert(params: {
  adminEmails: string[];
  newUserName: string;
  newUserEmail: string;
  newUserDisplayName: string;
}): Promise<boolean> {
  if (params.adminEmails.length === 0) return false;

  const html = baseTemplate(`
    <h2 style="color: #111827; margin: 0 0 16px;">New User Registration</h2>
    <p style="color: #374151; margin: 0 0 16px;">A new user has registered and is awaiting your approval.</p>
    <div style="background: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Name</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${escapeHtml(params.newUserDisplayName)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Username</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px;">${escapeHtml(params.newUserName)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Email</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px;">${escapeHtml(params.newUserEmail)}</td>
        </tr>
      </table>
    </div>
    <p style="color: #374151;">Please log in to the admin panel to review and approve this registration.</p>
  `);

  const results = await Promise.all(
    params.adminEmails.map((email) =>
      sendEmail(email, `New Registration Pending Approval: ${escapeHtml(params.newUserDisplayName)}`, html)
    )
  );
  return results.some(Boolean);
}

export async function sendInviteEmail(params: {
  to: string;
  displayName: string;
  username: string;
  tempPassword: string;
  loginUrl?: string;
}): Promise<boolean> {
  const loginLink = params.loginUrl || "";
  const loginButton = loginLink
    ? `<a href="${loginLink}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 8px;">Log In Now</a>`
    : "";

  const html = baseTemplate(`
    <h2 style="color: #111827; margin: 0 0 16px;">You're Invited to MeetSpace Manager</h2>
    <p style="color: #374151; margin: 0 0 16px;">Hi ${escapeHtml(params.displayName)}, an administrator has created an account for you on MeetSpace Manager.</p>
    <p style="color: #374151; margin: 0 0 16px;">You can use the following credentials to log in:</p>
    <div style="background: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Username</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${escapeHtml(params.username)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Temporary Password</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${escapeHtml(params.tempPassword)}</td>
        </tr>
      </table>
    </div>
    <p style="color: #ef4444; font-size: 13px; font-weight: 500;">Please change your password after your first login.</p>
    ${loginButton}
  `);

  return sendEmail(params.to, `You're Invited to ${APP_NAME}`, html);
}

export async function sendBookingCancellation(params: {
  to: string;
  displayName: string;
  title: string;
  roomName: string;
  facilityName: string;
  startTime: string;
  endTime: string;
}): Promise<boolean> {
  const html = baseTemplate(`
    <h2 style="color: #111827; margin: 0 0 16px;">Booking Cancelled</h2>
    <p style="color: #374151; margin: 0 0 16px;">Hi ${escapeHtml(params.displayName)}, the following booking has been cancelled.</p>
    <div style="background: #fef2f2; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Meeting</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${escapeHtml(params.title)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Room</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px;">${escapeHtml(params.roomName)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Facility</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px;">${escapeHtml(params.facilityName)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Was Scheduled</td>
          <td style="padding: 6px 0; color: #111827; font-size: 14px;">${escapeHtml(params.startTime)} - ${escapeHtml(params.endTime)}</td>
        </tr>
      </table>
    </div>
  `);

  return sendEmail(params.to, `Booking Cancelled: ${params.title}`, html);
}
