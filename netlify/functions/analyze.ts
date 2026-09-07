import { analyzeWebsite } from './_analyze.js';

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json() as { url?: unknown };
    if (typeof body.url !== 'string' || body.url.length > 2_048) {
      return Response.json({ error: 'Please enter a valid URL.' }, { status: 400 });
    }
    return Response.json(await analyzeWebsite(body.url), {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed.';
    return Response.json({ error: message }, {
      status: message.includes('not configured') ? 503 : 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
