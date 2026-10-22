// Minimal Resend client. When RESEND_API_KEY is unset the message is logged instead of sent,
// so the cron can run (and be tested) before email is configured.
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL || 'WantNot <onboarding@resend.dev>';

  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY not set; would send to ${message.to}: ${message.subject}\n${message.text}`);
    return { sent: false, error: 'RESEND_API_KEY not set' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('[email] Resend error', response.status, body);
    return { sent: false, error: `Resend ${response.status}: ${body}` };
  }
  const data = (await response.json()) as { id?: string };
  return { sent: true, id: data.id };
}
