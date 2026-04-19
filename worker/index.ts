import { handleFeedback } from './feedback';

interface AssetsFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS: AssetsFetcher;
  RESEND_API_KEY: string;
  FEEDBACK_TO_EMAIL: string;
  FEEDBACK_FROM_EMAIL: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/feedback') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
      }
      return handleFeedback(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
