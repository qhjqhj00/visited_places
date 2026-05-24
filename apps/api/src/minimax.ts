export interface RawRec {
  name_en?: string;
  name_zh?: string;
  country?: string;
}

const PER_ATTEMPT_MS = 22_000;
const ATTEMPTS = 2;

/**
 * Ask MiniMax for cities a traveler who visited `anchor` likely also visited.
 *
 * M2.7 is a reasoning model with high latency variance (~7s typical, but the
 * occasional call queues for 30s+). We bound each attempt with a hard timeout
 * and retry once — the retry usually lands on the fast path. Results are cached
 * by the caller, so this cost is paid at most once per anchor city.
 *
 * It inlines reasoning as <think>…</think> in `content`, so we strip that
 * (including a truncated, unclosed block) before parsing the JSON.
 */
export async function expandCities(
  anchor: { en: string; zh: string | null; country: string },
  count = 8
): Promise<RawRec[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      return await once(anchor, count);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function once(
  anchor: { en: string; zh: string | null; country: string },
  count: number
): Promise<RawRec[]> {
  const base = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1';
  const key = process.env.MINIMAX_API_KEY;
  const model = process.env.MINIMAX_MODEL_NAME || 'MiniMax-M2.7';
  if (!key) throw new Error('MINIMAX_API_KEY missing');

  // Short prompt + reasoning_effort:low keeps M2.7 at ~7s (verbose prompts make
  // it deliberate far longer).
  const system =
    'Suggest real, well-known cities a traveler likely also visited with the anchor ' +
    'city (not its own districts). Output ONLY ' +
    '{"items":[{"name_en":..,"name_zh":..,"country":..}]}. No questions, no explanation.';
  const user =
    `Anchor city: ${anchor.en}${anchor.zh ? ` (${anchor.zh})` : ''}, ${anchor.country}. ` +
    `Return ${count} items, most likely first. Do not include ${anchor.en} itself.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PER_ATTEMPT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        reasoning_effort: 'low',
        temperature: 0.3,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`MiniMax ${res.status}: ${await res.text()}`);

  const data: any = await res.json();
  let content: string = data?.choices?.[0]?.message?.content ?? '';
  content = content.replace(/<think>[\s\S]*?<\/think>/g, '');
  const lastClose = content.lastIndexOf('</think>');
  if (lastClose >= 0) content = content.slice(lastClose + '</think>'.length);
  content = content.trim();

  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error(`no JSON in MiniMax reply (finish=${data?.choices?.[0]?.finish_reason})`);
  }
  const parsed = JSON.parse(content.slice(start, end + 1));
  const items = Array.isArray(parsed) ? parsed : parsed.items ?? parsed.cities ?? [];
  return items as RawRec[];
}
