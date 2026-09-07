import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { MvpBrief } from '../../src/types';

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
    const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
    parsed = new URL(normalized);
  } catch {
    throw new Error('Please enter a valid URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS URLs can be scanned.');
  if (parsed.username || parsed.password) throw new Error('URLs containing login credentials are not supported.');
  if (['localhost', 'localhost.localdomain'].includes(parsed.hostname.toLowerCase())) throw new Error('Local URLs cannot be scanned.');

  const addresses = await lookup(parsed.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isBlockedIp(address))) {
    throw new Error('Private or internal URLs cannot be scanned.');
  }
  return parsed;
}

async function readLimitedBody(response: Response) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_PAGE_BYTES) throw new Error('This page is too large for a quick scan.');
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
      throw new Error('This page is too large for a quick scan.');
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
      if (!location) throw new Error('The website returned an invalid redirect.');
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`The website returned error ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('This URL does not point to an HTML page.');
    }
    return { finalUrl: current.toString(), html: await readLimitedBody(response) };
  }
  throw new Error('The website redirected too many times.');
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

function normalizeResult(value: unknown, fallbackName: string): Omit<MvpBrief, 'scannedUrl' | 'model'> {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawMvp = item.mvp && typeof item.mvp === 'object' ? item.mvp as Record<string, unknown> : {};
  const text = (input: unknown, fallback: string) => typeof input === 'string' && input.trim() ? input.trim() : fallback;
  const list = (input: unknown, fallback: string[]) => {
    const values = Array.isArray(input) ? input.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())).map((entry) => entry.trim()) : [];
    return values.length ? values : fallback;
  };

  return {
    siteName: text(item.siteName, fallbackName || 'Scanned product'),
    siteSummary: text(item.siteSummary, 'A product discovered from the scanned page.'),
    coreValue: text(item.coreValue, 'Deliver the page’s primary user outcome.'),
    targetUser: text(item.targetUser, 'The page’s primary visitor.'),
    observedFeatures: list(item.observedFeatures, ['Public product page and primary call to action']),
    mvp: {
      oneLine: text(rawMvp.oneLine, 'Build only the primary value loop.'),
      mustHave: list(rawMvp.mustHave, ['Primary input', 'Core processing', 'Useful result']),
      cut: list(rawMvp.cut, ['Advanced settings', 'Integrations', 'Premature scaling']),
      buildOrder: list(rawMvp.buildOrder, ['Build the core loop', 'Test with real users', 'Measure completion']),
      successMetric: text(rawMvp.successMetric, 'Users complete the core value loop.'),
    },
    assumptions: list(item.assumptions, ['The public page may not expose every product capability']),
  };
}

export async function analyzeWebsite(rawUrl: string): Promise<MvpBrief> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured on the server.');
  const { finalUrl, html } = await fetchPage(rawUrl);
  const signals = extractPageSignals(html, finalUrl);
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-5-mini';

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
          content: 'You are a rigorous product manager who reduces products to the smallest testable MVP. Return all text in English. Separate observations from assumptions. Keep every string under 16 words and the entire JSON under 1,000 tokens. Include only the core value loop; exclude nice-to-haves, advanced admin, integrations, and premature scaling.',
        },
        {
          role: 'user',
          content: `Analyze the following page signals. Identify the product and its visible features, then propose the smallest testable MVP. Do not invent features that were not observed; list missing information as assumptions.\n\n${JSON.stringify(signals)}`,
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'minimum_mvp_brief', strict: true, schema: resultSchema } },
      plugins: [{ id: 'response-healing' }],
      max_completion_tokens: 1800,
    }),
  });

  const payload = await response.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> };
  if (!response.ok) throw new Error(payload.error?.message || `OpenRouter returned error ${response.status}.`);
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response was received from OpenRouter.');
  const parsed = JSON.parse(content) as unknown;
  return { ...normalizeResult(parsed, signals.title), scannedUrl: finalUrl, model };
}
