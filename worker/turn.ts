import type { Env } from './index';

const CF_TURN_API_BASE = 'https://rtc.live.cloudflare.com/v1/turn/keys';
// 1 day — below Cloudflare's max (2 days). Plenty for a single collab session
// and avoids piling creds into our API quota on frequent reconnects.
const TURN_TTL_SECONDS = 86400;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleTurnCredentials(_request: Request, env: Env): Promise<Response> {
  if (!env.CF_TURN_KEY_ID || !env.CF_TURN_API_TOKEN) {
    return jsonResponse(500, { error: 'TURN service is not configured.' });
  }

  const upstream = await fetch(
    `${CF_TURN_API_BASE}/${env.CF_TURN_KEY_ID}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_TURN_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
    },
  );

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    console.error('Cloudflare TURN API error', upstream.status, detail);
    return jsonResponse(502, { error: 'TURN credential issuance failed.' });
  }

  const data = await upstream.json() as { iceServers?: RTCIceServer | RTCIceServer[] };
  const iceServers = data.iceServers;
  if (!iceServers) {
    return jsonResponse(502, { error: 'TURN credential response missing iceServers.' });
  }

  return jsonResponse(200, { iceServers, ttl: TURN_TTL_SECONDS });
}
