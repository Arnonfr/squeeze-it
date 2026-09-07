import { analyzeWebsite } from '../server/analyze';

interface RequestLike {
  method?: string;
  body?: unknown;
}

interface ResponseLike {
  status(code: number): ResponseLike;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

export default async function handler(request: RequestLike, response: ResponseLike) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body as { url?: unknown } | undefined;
    if (typeof body?.url !== 'string' || body.url.length > 2_048) {
      return response.status(400).json({ error: 'נדרשת כתובת URL תקינה.' });
    }
    return response.status(200).json(await analyzeWebsite(body.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'הניתוח נכשל.';
    return response.status(message.includes('לא הוגדר') ? 503 : 400).json({ error: message });
  }
}
