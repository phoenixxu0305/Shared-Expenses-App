import { Resend } from 'resend';

let resend: Resend | null = null;

function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[Email] No RESEND_API_KEY — would send to ${to}: ${subject}`);
    return;
  }

  // Use verified domain or Resend's default sender for free tier
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  try {
    const { error } = await getResend().emails.send({
      from: `ExpenseShare <${fromEmail}>`,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(`[Email] Failed to send to ${to}:`, error);
    }
  } catch (err) {
    console.error(`[Email] Error sending to ${to}:`, err);
  }
}

export async function sendTeamInviteEmail(email: string, teamName: string) {
  await sendEmail({
    to: email,
    subject: `You've been added to ${teamName} on ExpenseShare`,
    html: `
      <h2>Welcome to ${teamName}!</h2>
      <p>You've been added to a team on ExpenseShare. Sign in to view your team and start tracking expenses.</p>
      <p><a href="${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : 'http://localhost:3000'}/login">Sign In</a></p>
    `,
  });
}

export async function sendLowBalanceEmail(
  email: string,
  name: string,
  remaining: number
) {
  await sendEmail({
    to: email,
    subject: 'Low balance alert - ExpenseShare',
    html: `
      <h2>Low Balance Alert</h2>
      <p>Hi ${name}, your remaining personal allocation is <strong>${remaining.toFixed(2)}</strong>.</p>
    `,
  });
}

export async function sendFundsAddedEmail(
  email: string,
  amount: number,
  description: string
) {
  await sendEmail({
    to: email,
    subject: 'Funds added - ExpenseShare',
    html: `
      <h2>Funds Added</h2>
      <p><strong>${amount.toFixed(2)}</strong> has been added to the team kitty.</p>
      <p>${description}</p>
    `,
  });
}

export async function sendNewInviteRequestEmail(
  adminEmail: string,
  requesterEmail: string,
  note: string | null
) {
  await sendEmail({
    to: adminEmail,
    subject: 'New invite request - ExpenseShare',
    html: `
      <h2>New Invite Request</h2>
      <p><strong>${requesterEmail}</strong> has requested to join ExpenseShare.</p>
      ${note ? `<p>Note: "${note}"</p>` : ''}
      <p>Log in to review and approve or deny this request.</p>
    `,
  });
}

export async function sendInviteApprovedEmail(email: string) {
  await sendEmail({
    to: email,
    subject: 'Your ExpenseShare access has been approved!',
    html: `
      <h2>Access Approved!</h2>
      <p>Your request to join ExpenseShare has been approved. You can now sign up and join your team.</p>
      <p><a href="${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : 'http://localhost:3000'}/login">Sign Up Now</a></p>
    `,
  });
}
