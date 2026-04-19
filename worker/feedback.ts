import type { Env } from './index';

interface FeedbackPayload {
  message?: unknown;
  contact?: unknown;
}

const MAX_MESSAGE_LENGTH = 5000;
const MAX_CONTACT_LENGTH = 200;
const MIN_MESSAGE_LENGTH = 1;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleFeedback(request: Request, env: Env): Promise<Response> {
  if (!env.RESEND_API_KEY || !env.FEEDBACK_TO_EMAIL || !env.FEEDBACK_FROM_EMAIL) {
    return jsonResponse(500, { error: 'Feedback service is not configured.' });
  }

  let payload: FeedbackPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const rawMessage = typeof payload.message === 'string' ? payload.message.trim() : '';
  const rawContact = typeof payload.contact === 'string' ? payload.contact.trim() : '';

  if (rawMessage.length < MIN_MESSAGE_LENGTH) {
    return jsonResponse(400, { error: 'Message is required.' });
  }
  if (rawMessage.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(400, { error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters.` });
  }
  if (rawContact.length > MAX_CONTACT_LENGTH) {
    return jsonResponse(400, { error: `Contact exceeds ${MAX_CONTACT_LENGTH} characters.` });
  }

  const userAgent = request.headers.get('user-agent') ?? 'unknown';
  const referer = request.headers.get('referer') ?? 'unknown';
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';

  const subject = `Zero Sanity feedback${rawContact ? ` from ${rawContact}` : ''}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px">
      <h2 style="margin:0 0 12px">New feedback</h2>
      <p style="white-space:pre-wrap;line-height:1.5">${escapeHtml(rawMessage)}</p>
      <hr style="margin:24px 0;border:none;border-top:1px solid #ddd" />
      <p style="font-size:12px;color:#666;margin:4px 0">
        <strong>Contact:</strong> ${rawContact ? escapeHtml(rawContact) : '(none provided)'}
      </p>
      <p style="font-size:12px;color:#666;margin:4px 0"><strong>Referer:</strong> ${escapeHtml(referer)}</p>
      <p style="font-size:12px;color:#666;margin:4px 0"><strong>User-Agent:</strong> ${escapeHtml(userAgent)}</p>
      <p style="font-size:12px;color:#666;margin:4px 0"><strong>IP:</strong> ${escapeHtml(ip)}</p>
    </div>
  `;

  const text = [
    rawMessage,
    '',
    '---',
    `Contact: ${rawContact || '(none provided)'}`,
    `Referer: ${referer}`,
    `User-Agent: ${userAgent}`,
    `IP: ${ip}`,
  ].join('\n');

  const resendBody: Record<string, unknown> = {
    from: env.FEEDBACK_FROM_EMAIL,
    to: [env.FEEDBACK_TO_EMAIL],
    subject,
    html,
    text,
  };
  if (rawContact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawContact)) {
    resendBody.reply_to = rawContact;
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(resendBody),
  });

  if (!resendResponse.ok) {
    const detail = await resendResponse.text().catch(() => '');
    console.error('Resend API error', resendResponse.status, detail);
    return jsonResponse(502, { error: 'Email delivery failed.' });
  }

  return jsonResponse(200, { ok: true });
}
