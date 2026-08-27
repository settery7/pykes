import { Resend } from "resend";

// Without RESEND_API_KEY (no Resend account set up), log the content
// instead of sending — keeps `docker compose up` and `npm test` working
// for anyone who hasn't set up email, same spirit as the app's other
// local-dev fallbacks (e.g. MinIO standing in for S3).
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || "onboarding@resend.dev";

async function send({ to, subject, html }) {
  if (!resend) {
    console.log(`[email] RESEND_API_KEY not set, skipping send. Would have sent to ${to}:\n${subject}\n${html}`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error(`[email] send to ${to} failed:`, err);
  }
}

export async function sendVerificationEmail(to, token) {
  const base = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  const link = `${base}/?verify=${encodeURIComponent(token)}`;
  await send({
    to,
    subject: "Verify your Pykes email",
    html: `
      <p>Confirm this is your email address to finish setting up your Pykes account.</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });
}

export async function sendPasswordResetEmail(to, token) {
  const base = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  const link = `${base}/?reset=${encodeURIComponent(token)}`;
  await send({
    to,
    subject: "Reset your Pykes password",
    html: `
      <p>Someone requested a password reset for this Pykes account. If that was you, set a new password here:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password hasn't been changed.</p>
    `,
  });
}

export async function sendPasswordChangedNotice(to) {
  await send({
    to,
    subject: "Your Pykes password was changed",
    html: `
      <p>This is a confirmation that the password for this Pykes account was just changed.</p>
      <p>If you didn't do this, please reset your password again immediately.</p>
    `,
  });
}

export async function sendFollowerDigest(to, { displayName, newFollowerCount }) {
  await send({
    to,
    subject: `You have ${newFollowerCount} new follower${newFollowerCount === 1 ? "" : "s"} on Pykes`,
    html: `
      <p>Hi ${displayName},</p>
      <p>${newFollowerCount} new ${newFollowerCount === 1 ? "person is" : "people are"} now following your projects on Pykes.</p>
    `,
  });
}
