import { handleFeedback } from './feedback';
import { handleTurnCredentials } from './turn';

const HTTP_METHOD_POST = 'POST';
const HTTP_METHOD_GET = 'GET';

interface AssetsFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS: AssetsFetcher;
  RESEND_API_KEY: string;
  FEEDBACK_TO_EMAIL: string;
  FEEDBACK_FROM_EMAIL: string;
  CF_TURN_KEY_ID: string;
  CF_TURN_API_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/feedback') {
      if (request.method !== HTTP_METHOD_POST) {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: HTTP_METHOD_POST } });
      }
      return handleFeedback(request, env);
    }

    if (url.pathname === '/api/turn-credentials') {
      if (request.method !== HTTP_METHOD_GET) {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: HTTP_METHOD_GET } });
      }
      return handleTurnCredentials(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
