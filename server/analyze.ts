import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { MvpBrief } from '../src/types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_PAGE_BYTES = 1_000_000;
const MAX_REDIRECTS = 4;

const resultSchema = {
  type: 'object',
  properties: {
    siteName: { type: 'string' },
    siteSummary: { type: 'string' },
    coreValue: { type: 'string' },
    targetUser: { type: 'string' },
    observedFeatures: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 },
    mvp: {
      type: 'object',
      properties: {
        oneLine: { type: 'string' },
        mustHave: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
        cut: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 },
        buildOrder: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
        successMetric: { type: 'string' },
      },
      required: ['oneLine', 'mustHave', 'cut', 'buildOrder', 'successMetric'],
      additionalProperties: false,
    },
    assumptions: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
  },
  required: ['siteName', 'siteSummary', 'coreValue', 'targetUser', 'observedFeatures', 'mvp', 'assumptions'],
  additionalProperties: false,
} as const;

function isBlockedIp(address: string) {
  if (address === '::1' || address === '::' || address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true;
  const ipv4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (isIP(ipv4) !== 4) return false;
  const [a, b] = ipv4.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || a >= 224;
}

async function assertPublicUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('הכתובת שהוזנה אינה URL תקין.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('אפשר לסרוק רק כתובות http או https.');
  if (parsed.username || parsed.password) throw new Error('כתובת עם פרטי התחברות אינה נתמכת.');
  if (['localhost', 'localhost.localdomain'].includes(parsed.hostname.toLowerCase())) throw new Error('לא ניתן לסרוק כתובת מקומית.');

  const addresses = await lookup(parsed.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isBlockedIp(address))) {
    throw new Error('לא ניתן לסרוק כתובת פרטית או פנימית.');
  }
  return parsed;
}

async function readLimitedBody(response: Response) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_PAGE_BYTES) throw new Error('העמוד גדול מדי לסריקה מהירה.');
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PAGE_BYTES) {
      await reader.cancel();
      throw new Error('העמוד גדול מדי לסריקה מהירה.');
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(joined);
}

async function fetchPage(startUrl: string) {
  let current = await assertPublicUrl(startUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(12_000),
      headers: { 'User-Agent': 'SqueezeItBot/1.0 (+website MVP analyzer)', Accept: 'text/html,application/xhtml+xml' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('האתר החזיר הפניה לא תקינה.');
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`האתר החזיר שגיאה ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('הקישור אינו מוביל לעמוד HTML.');
    }
    return { finalUrl: current.toString(), html: await readLimitedBody(response) };
  }
  throw new Error('האתר ביצע יותר מדי הפניות.');
}

function decodeEntities(value: string) {
  return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function matchContent(html: string, pattern: RegExp) {
  return decodeEntities(html.match(pattern)?.[1]?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '');
}

function extractPageSignals(html: string, finalUrl: string) {
  const cleaned = html.replace(/<(script|style|svg|noscript|template)[\s\S]*?<\/\1>/gi, ' ');
  const text = decodeEntities(cleaned.replace(/<!--[^]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  const headings = [...cleaned.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => decodeEntities(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())).filter(Boolean).slice(0, 24);
  const actions = [...cleaned.matchAll(/<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/gi)]
    .map((match) => decodeEntities(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())).filter((item) => item.length > 1 && item.length < 90).slice(0, 40);
  return {
    url: finalUrl,
    title: matchContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description: matchContent(html, /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i) ||
      matchContent(html, /<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i),
    headings,
    actions,
    pageText: text.slice(0, 24_000),
  };
}

function assertResult(value: unknown): asserts value is Omit<MvpBrief, 'scannedUrl' | 'model'> {
  const item = value as Partial<MvpBrief> | null;
  if (!item || typeof item !== 'object' || typeof item.siteName !== 'string' ||
    !Array.isArray(item.observedFeatures) || !item.mvp || !Array.isArray(item.mvp.mustHave) ||
    !Array.isArray(item.mvp.cut) || !Array.isArray(item.mvp.buildOrder)) {
    throw new Error('המודל החזיר ניתוח חלקי. נסו שוב.');
  }
}

export async function analyzeWebsite(rawUrl: string): Promise<MvpBrief> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY לא הוגדר בשרת.');
  const { finalUrl, html } = await fetchPage(rawUrl);
  const signals = extractPageSignals(html, finalUrl);
  const model = process.env.OPENROUTER_MODEL || '~openai/gpt-latest';

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': 'Squeeze It',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'אתה מנהל מוצר קשוח שמתמחה בהפיכת מוצרים גדולים ל-MVP הזעיר ביותר שאפשר לבדוק עם משתמשים אמיתיים. החזר את כל הטקסט בעברית. הפרד בין יכולות שנצפו בפועל לבין הנחות. ה-MVP חייב להכיל רק את לולאת הערך המרכזית, בלי nice-to-have, אדמין מתקדם, אינטגרציות או סקייל מוקדם.',
        },
        {
          role: 'user',
          content: `נתח את אותות העמוד הבאים. זהה את המוצר והפיצ'רים הנראים בו, ואז הצע את המינימום של המינימום ל-MVP בר-בדיקה. אל תמציא פיצ'רים שלא נצפו; אם חסר מידע, ציין זאת בהנחות.\n\n${JSON.stringify(signals)}`,
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'minimum_mvp_brief', strict: true, schema: resultSchema } },
      provider: { require_parameters: true },
      temperature: 0.2,
      max_completion_tokens: 2200,
    }),
  });

  const payload = await response.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> };
  if (!response.ok) throw new Error(payload.error?.message || `OpenRouter החזיר שגיאה ${response.status}.`);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('לא התקבלה תשובה מ-OpenRouter.');
  const parsed = JSON.parse(content) as unknown;
  assertResult(parsed);
  return { ...parsed, scannedUrl: finalUrl, model };
}
