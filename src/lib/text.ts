import type { LangCode, LocalizedText } from './types';

/**
 * 語言回退鏈。缺翻譯時不留白，而是往回退到看得懂的語言。
 * 越南 / 日 / 印尼 / 泰 的學生若沒有翻譯，退到英文比退到中文有用。
 */
const FALLBACK: Record<LangCode, LangCode[]> = {
  'zh-TW': ['zh-TW', 'zh-CN', 'en'],
  'zh-CN': ['zh-CN', 'zh-TW', 'en'],
  en: ['en', 'zh-TW'],
  vi: ['vi', 'en', 'zh-TW'],
  ja: ['ja', 'en', 'zh-TW'],
  id: ['id', 'en', 'zh-TW'],
  th: ['th', 'en', 'zh-TW'],
};

/** 取出某語系的文字，缺就依回退鏈往下找，全空回傳空字串。 */
export function resolveText(t: LocalizedText | undefined, lang: LangCode): string {
  if (!t) return '';
  for (const code of FALLBACK[lang] ?? [lang]) {
    const v = t[code];
    if (v && v.trim()) return v;
  }
  for (const v of Object.values(t)) {
    if (v && v.trim()) return v;
  }
  return '';
}

/** 這段文字在該語系是否為「真的有翻譯」而不是回退來的 */
export function hasText(t: LocalizedText | undefined, lang: LangCode): boolean {
  return Boolean(t?.[lang]?.trim());
}

/** 建立一段只有單一語系的文字 */
export function loc(lang: LangCode, value: string): LocalizedText {
  return { [lang]: value } as LocalizedText;
}

/** 快速建立中英雙語 */
export function bi(zh: string, en?: string): LocalizedText {
  return en ? { 'zh-TW': zh, en } : { 'zh-TW': zh };
}

/** 計算一份多語文字的完成度，用來在編輯臺顯示「越南文還缺 3 句」 */
export function completeness(
  texts: (LocalizedText | undefined)[],
  langs: LangCode[],
): Record<LangCode, { filled: number; total: number }> {
  const out = {} as Record<LangCode, { filled: number; total: number }>;
  for (const lang of langs) {
    let filled = 0;
    let total = 0;
    for (const t of texts) {
      // 只計算「中文有寫」的欄位，中文沒寫的不算缺翻譯
      const base = t?.['zh-TW']?.trim();
      if (!base) continue;
      total += 1;
      if (hasText(t, lang)) filled += 1;
    }
    out[lang] = { filled, total };
  }
  return out;
}
