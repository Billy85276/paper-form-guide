import { nanoid } from 'nanoid';
import { toAiJpeg } from './image';
import type { AppSettings } from './storage';
import {
  DEFAULT_REGION_STYLE,
  type LangCode,
  type LocalizedText,
  type Region,
  type RegionRole,
  type RegionShape,
} from './types';

/**
 * 瀏覽器直連視覺模型
 *
 * 金鑰由使用者自備、存在他自己的瀏覽器，一律不經過任何中繼伺服器。
 * 這個設計的好處是：帳單落在使用者自己頭上，這套工具才能真的免費開放給別人用。
 *
 * 座標約定（這是最容易寫錯的地方）
 *   Gemini 的 box_2d 是 [ymin, xmin, ymax, xmax]，正規化到 0~1000，原點左上。
 *   注意 y 在前，而且不是 0~1。另外那個 1000x1000 是被拉伸套在圖上的，
 *   不保留長寬比，所以 x 乘寬、y 乘高要各自獨立換算，不要做 letterbox 補正。
 *   我們統一要求所有供應商都吐這個格式，再轉成本專案的百分比座標。
 */

export interface AiRegionDraft {
  index: number;
  label: string;
  style: 'box' | 'circle' | 'underline' | 'arrow';
  box_2d: [number, number, number, number];
  role?: string;
  audience?: string;
  note: string;
  example?: string;
  pitfall?: string;
}

const REGION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    regions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: '區編號，從 1 開始，代表引導順序' },
          label: { type: 'string', description: '這一區的短名稱，四到八個字，例如「系所班級」' },
          style: {
            type: 'string',
            enum: ['box', 'circle', 'underline', 'arrow'],
            description: '標註外形',
          },
          box_2d: {
            type: 'array',
            items: { type: 'integer' },
            description: '[ymin, xmin, ymax, xmax]，正規化到 0-1000，原點左上',
          },
          role: {
            type: 'string',
            enum: ['fill', 'check', 'strike', 'circle', 'stamp', 'readonly', 'warning'],
            description: 'fill 寫字, check 打勾, strike 劃線刪除, circle 圈選, stamp 蓋章(承辦人做), readonly 只是看, warning 常見錯誤',
          },
          audience: {
            type: 'string',
            enum: ['student', 'staff', 'both'],
            description: '誰負責填。承辦人核章一律 staff',
          },
          note: { type: 'string', description: '給填表人的完整說明，繁體中文，一到兩句' },
          example: { type: 'string', description: '正確填寫範例，沒有就空字串' },
          pitfall: { type: 'string', description: '常見錯誤提醒，沒有就空字串' },
        },
        required: ['index', 'label', 'style', 'box_2d', 'role', 'audience', 'note', 'example', 'pitfall'],
        additionalProperties: false,
      },
    },
  },
  required: ['regions'],
  additionalProperties: false,
} as const;

const SYSTEM_BRIEF = [
  '你是紙本表單標註助手。使用者給你一張實體表單的照片，以及他想怎麼分區標註的描述。',
  '請辨識表單上的欄位，輸出每一個標註區域。',
  'box_2d 必須是 [ymin, xmin, ymax, xmax]，四個整數，正規化到 0 到 1000，原點在左上角。',
  '框要貼緊該欄位的可書寫範圍，不要框到整列，也不要只框標題文字。',
  'label、note、example、pitfall 一律使用繁體中文。',
  '若照片上出現紅色或藍色印章、核章圈、承辦人簽名欄，role 請設為 stamp、audience 設為 staff，',
  '並在 note 說明這是承辦人負責，填表人不要動。',
  '若同一張照片上出現多份重複的聯（複寫單），只標註最上面那一份，不要重複標註。',
].join('\n');

/* ------------------------------------------------------------------ */
/* 共用工具                                                            */
/* ------------------------------------------------------------------ */

/** 從各家不同的回應信封裡把純文字挖出來，順便容忍 API 改版 */
function extractText(data: unknown): string {
  const d = data as Record<string, any>;
  const chunks: string[] = [];

  // Gemini Interactions API: steps[].content[].text
  if (Array.isArray(d?.steps)) {
    for (const s of d.steps) {
      for (const c of s?.content ?? []) if (typeof c?.text === 'string') chunks.push(c.text);
    }
  }
  // Gemini 舊版 generateContent: candidates[].content.parts[].text
  if (Array.isArray(d?.candidates)) {
    for (const c of d.candidates) {
      for (const p of c?.content?.parts ?? []) if (typeof p?.text === 'string') chunks.push(p.text);
    }
  }
  // OpenAI Responses API: output[].content[].text
  if (Array.isArray(d?.output)) {
    for (const o of d.output) {
      for (const c of o?.content ?? []) if (typeof c?.text === 'string') chunks.push(c.text);
    }
  }
  // OpenAI Chat Completions
  if (Array.isArray(d?.choices)) {
    for (const c of d.choices) if (typeof c?.message?.content === 'string') chunks.push(c.message.content);
  }
  // Anthropic Messages
  if (Array.isArray(d?.content)) {
    for (const c of d.content) if (typeof c?.text === 'string') chunks.push(c.text);
  }
  if (typeof d?.output_text === 'string') chunks.push(d.output_text);
  return chunks.join('');
}

/** 模型偶爾會用 ``` 包起來，或前後多寫一句話，這裡把 JSON 撈出來 */
function parseJsonLoose<T>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as T;
    throw new Error('AI 回應不是有效的 JSON，請再試一次或換個描述');
  }
}

export class AiError extends Error {
  hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'AiError';
    this.hint = hint;
  }
}

/* ------------------------------------------------------------------ */
/* Google Gemini                                                       */
/* ------------------------------------------------------------------ */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini 有新舊兩套介面。新的 Interactions API 是目前文件主推的，
 * 舊的 generateContent 仍然存在。這裡先打新的，遇到 404 或 400 再退回舊的，
 * 這樣不論使用者的金鑰對應到哪個世代的服務都能用。
 */
async function callGemini(
  settings: AppSettings,
  prompt: string,
  base64: string,
  mime: string,
): Promise<string> {
  const key = settings.geminiKey.trim();
  if (!key) throw new AiError('尚未設定 Gemini API 金鑰', '請到「設定」頁貼上金鑰');
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };

  // 新版 Interactions API
  const modern = {
    model: settings.geminiModel,
    input: [
      { type: 'text', text: prompt },
      { type: 'image', data: base64, mime_type: mime },
    ],
    generation_config: { thinking_level: 'minimal' },
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: REGION_JSON_SCHEMA,
    },
  };

  let res: Response;
  try {
    res = await fetch(`${GEMINI_BASE}/interactions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(modern),
    });
  } catch {
    throw new AiError('無法連線到 Gemini', '請確認網路，或金鑰是否被瀏覽器來源限制擋住');
  }

  if (res.ok) {
    const text = extractText(await res.json());
    if (text) return text;
  }

  // 退回舊版 generateContent
  const legacy = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: REGION_JSON_SCHEMA,
    },
  };
  const res2 = await fetch(
    `${GEMINI_BASE}/models/${encodeURIComponent(settings.geminiModel)}:generateContent`,
    { method: 'POST', headers, body: JSON.stringify(legacy) },
  );
  if (!res2.ok) {
    const body = await res2.text();
    throw new AiError(`Gemini 回報錯誤 ${res2.status}`, body.slice(0, 400));
  }
  const text = extractText(await res2.json());
  if (!text) throw new AiError('Gemini 沒有回傳可解析的內容');
  return text;
}

/* ------------------------------------------------------------------ */
/* OpenAI                                                              */
/* ------------------------------------------------------------------ */

async function callOpenAi(
  settings: AppSettings,
  prompt: string,
  base64: string,
  mime: string,
): Promise<string> {
  const key = settings.openaiKey.trim();
  if (!key) throw new AiError('尚未設定 OpenAI API 金鑰', '請到「設定」頁貼上金鑰');
  const base = settings.openaiBaseUrl.replace(/\/$/, '') || 'https://api.openai.com/v1';

  const body = {
    model: settings.openaiModel,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: `data:${mime};base64,${base64}`, detail: 'high' },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'form_annotations',
        strict: true,
        schema: REGION_JSON_SCHEMA,
      },
    },
  };

  let res: Response;
  try {
    res = await fetch(`${base}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch {
    // 金鑰無效時 OpenAI 會在邊緣節點就擋掉，回應不帶 CORS 標頭，
    // 瀏覽器只會丟出一個沒有內容的 TypeError。這裡把它翻譯成人看得懂的話。
    throw new AiError('無法連線到 OpenAI', 'API 金鑰可能無效，或網路被阻擋');
  }
  if (!res.ok) {
    const t = await res.text();
    throw new AiError(`OpenAI 回報錯誤 ${res.status}`, t.slice(0, 400));
  }
  const text = extractText(await res.json());
  if (!text) throw new AiError('OpenAI 沒有回傳可解析的內容');
  return text;
}

/* ------------------------------------------------------------------ */
/* 對外：產生標註草稿                                                   */
/* ------------------------------------------------------------------ */

const SHAPE_MAP: Record<AiRegionDraft['style'], RegionShape> = {
  box: 'rect',
  circle: 'ellipse',
  underline: 'underline',
  arrow: 'arrow',
};

const ROLE_SET: RegionRole[] = ['fill', 'check', 'strike', 'circle', 'stamp', 'readonly', 'warning'];

function toLocalized(value: string | undefined, lang: LangCode): LocalizedText | undefined {
  const v = value?.trim();
  return v ? ({ [lang]: v } as LocalizedText) : undefined;
}

/**
 * 把模型回的 0~1000 座標轉成本專案用的百分比，並夾在畫面內。
 * 這裡是唯一一處做座標換算的地方，其他模組一律只看百分比。
 */
function boxToRegionRect(box: [number, number, number, number]) {
  const [ymin, xmin, ymax, xmax] = box;
  const x = Math.max(0, Math.min(100, (Math.min(xmin, xmax) / 1000) * 100));
  const y = Math.max(0, Math.min(100, (Math.min(ymin, ymax) / 1000) * 100));
  const w = Math.max(0.8, Math.min(100 - x, (Math.abs(xmax - xmin) / 1000) * 100));
  const h = Math.max(0.8, Math.min(100 - y, (Math.abs(ymax - ymin) / 1000) * 100));
  return { x, y, w, h };
}

export interface GenerateOptions {
  imageSrc: string;
  instruction: string;
  settings: AppSettings;
  lang: LangCode;
  startStep?: number;
}

export async function generateRegions(opts: GenerateOptions): Promise<Region[]> {
  const { base64, mime } = await toAiJpeg(opts.imageSrc);
  const prompt = `${SYSTEM_BRIEF}\n\n使用者的標註需求：\n${opts.instruction.trim() || '請自動辨識這張表單上所有需要填寫的欄位，逐一標註。'}`;

  const raw =
    opts.settings.aiProvider === 'openai'
      ? await callOpenAi(opts.settings, prompt, base64, mime)
      : await callGemini(opts.settings, prompt, base64, mime);

  const parsed = parseJsonLoose<{ regions: AiRegionDraft[] }>(raw);
  const list = Array.isArray(parsed?.regions) ? parsed.regions : [];
  if (!list.length) throw new AiError('AI 沒有找到任何可標註的區域', '試著把描述寫得更具體一點');

  const startStep = opts.startStep ?? 1;
  return list
    .filter((r) => Array.isArray(r.box_2d) && r.box_2d.length === 4)
    .map((r, i) => {
      const rect = boxToRegionRect(r.box_2d as [number, number, number, number]);
      const role: RegionRole = ROLE_SET.includes(r.role as RegionRole)
        ? (r.role as RegionRole)
        : 'fill';
      const region: Region = {
        id: nanoid(8),
        shape: SHAPE_MAP[r.style] ?? 'rect',
        ...rect,
        style: { ...DEFAULT_REGION_STYLE },
        role,
        audience:
          r.audience === 'staff' || r.audience === 'both'
            ? r.audience
            : role === 'stamp'
              ? 'staff'
              : 'student',
        step: startStep + i,
        label: toLocalized(r.label, opts.lang) ?? ({ [opts.lang]: `區域 ${i + 1}` } as LocalizedText),
        instruction: toLocalized(r.note, opts.lang) ?? {},
        example: toLocalized(r.example, opts.lang),
        pitfall: toLocalized(r.pitfall, opts.lang),
        required: role !== 'readonly' && role !== 'stamp',
      };
      return region;
    });
}

/* ------------------------------------------------------------------ */
/* 對外：批次翻譯                                                       */
/* ------------------------------------------------------------------ */

export interface TranslateJob {
  /** 這段文字在資料裡的位置，翻完照原路寫回去 */
  path: string;
  source: string;
}

const TRANSLATE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['path', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

const LANG_NAME: Record<LangCode, string> = {
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
  en: 'English',
  vi: 'Tiếng Việt',
  ja: '日本語',
  id: 'Bahasa Indonesia',
  th: 'ภาษาไทย',
};

async function callTextModel(settings: AppSettings, prompt: string, schema: unknown): Promise<string> {
  if (settings.aiProvider === 'openai') {
    const key = settings.openaiKey.trim();
    if (!key) throw new AiError('尚未設定 OpenAI API 金鑰');
    const base = settings.openaiBaseUrl.replace(/\/$/, '') || 'https://api.openai.com/v1';
    let res: Response;
    try {
      res = await fetch(`${base}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: settings.openaiModel,
          input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
          text: { format: { type: 'json_schema', name: 'translations', strict: true, schema } },
        }),
      });
    } catch {
      throw new AiError('無法連線到 OpenAI', 'API 金鑰可能無效');
    }
    if (!res.ok) throw new AiError(`OpenAI 回報錯誤 ${res.status}`, (await res.text()).slice(0, 300));
    return extractText(await res.json());
  }

  const key = settings.geminiKey.trim();
  if (!key) throw new AiError('尚未設定 Gemini API 金鑰');
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
  let res = await fetch(`${GEMINI_BASE}/interactions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.geminiModel,
      input: [{ type: 'text', text: prompt }],
      response_format: { type: 'text', mime_type: 'application/json', schema },
    }),
  }).catch(() => null as unknown as Response);

  if (res?.ok) {
    const t = extractText(await res.json());
    if (t) return t;
  }
  res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(settings.geminiModel)}:generateContent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
    }),
  });
  if (!res.ok) throw new AiError(`Gemini 回報錯誤 ${res.status}`, (await res.text()).slice(0, 300));
  return extractText(await res.json());
}

/** 把一批中文字串翻成某個語言，回傳 path 對應譯文 */
export async function translateBatch(
  settings: AppSettings,
  jobs: TranslateJob[],
  target: LangCode,
): Promise<Record<string, string>> {
  if (!jobs.length) return {};
  const prompt = [
    `你是大學行政表單的翻譯者。請把下列繁體中文翻譯成 ${LANG_NAME[target]}。`,
    '這些文字會顯示給外籍學生看，用來教他們怎麼填寫紙本表單。',
    '要求：',
    '1. 語氣直接、像在旁邊指著紙教他，不要書面公文腔。',
    '2. 系所名稱、單位名稱、金額、學號格式等專有名詞，保留原文並在後面用括號附上譯文。',
    '3. 保持每一則各自獨立，不要合併或增刪。',
    '4. path 原封不動照抄回來。',
    '',
    JSON.stringify({ items: jobs.map((j) => ({ path: j.path, text: j.source })) }),
  ].join('\n');

  const raw = await callTextModel(settings, prompt, TRANSLATE_SCHEMA);
  const parsed = parseJsonLoose<{ items: { path: string; text: string }[] }>(raw);
  const out: Record<string, string> = {};
  for (const item of parsed.items ?? []) {
    if (item?.path && typeof item.text === 'string') out[item.path] = item.text;
  }
  return out;
}
