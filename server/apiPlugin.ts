import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { analyzeWebsite } from './analyze';

const MAX_REQUEST_BYTES = 8_000;

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error('הבקשה גדולה מדי.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as { url?: unknown };
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function middleware(request: IncomingMessage, response: ServerResponse, next: () => void) {
  if (request.url !== '/api/analyze') return next();
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });
  void (async () => {
    try {
      const body = await readJson(request);
      if (typeof body.url !== 'string' || body.url.length > 2_048) return send(response, 400, { error: 'נדרשת כתובת URL תקינה.' });
      send(response, 200, await analyzeWebsite(body.url));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'הניתוח נכשל.';
      send(response, message.includes('לא הוגדר') ? 503 : 400, { error: message });
    }
  })();
}

export function apiPlugin(): Plugin {
  return {
    name: 'squeeze-api',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
