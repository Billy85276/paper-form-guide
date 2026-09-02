import type { DerivedResult, Guide, LangCode, RuleSet } from './types';
import { resolveText } from './text';

/**
 * 學號規則引擎
 *
 * 編輯者用一張表定義規則：一條正規表達式 + 幾條推導指派。
 * 學生輸入學號後，第一條命中的規則負責推導出學制、系所、班級等欄位，
 * 並回報「為什麼這樣猜」，讓學生能自己判斷對不對。
 *
 * 刻意不做黑箱：每個推導值都附 reason，例如
 *   系所 = 資訊工程系（依學號第 5 至 7 碼 512 查系所對照表）
 */

/** 把 $1 $2 這種樣板換成捕獲群組內容 */
function applyTemplate(template: string, m: RegExpMatchArray): string {
  return template.replace(/\$(\d)/g, (_, d: string) => m[Number(d)] ?? '');
}

/** 安全地建立 RegExp，語法錯誤時回傳 null 而不是炸掉整個畫面 */
export function safeRegExp(source: string, flags = ''): RegExp | null {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

export function deriveFromId(
  rules: RuleSet,
  rawId: string,
  lang: LangCode,
): DerivedResult {
  const empty: DerivedResult = { values: {}, reasons: {}, highlightRegionIds: [] };
  const id = rawId.trim().toUpperCase();
  if (!id) return empty;

  for (const pattern of rules.patterns) {
    const re = safeRegExp(pattern.match, pattern.flags ?? '');
    if (!re) continue;
    const m = id.match(re);
    if (!m) continue;

    const values: Record<string, string> = {};
    const reasons: Record<string, string> = {};
    const highlight: string[] = [];

    for (const d of pattern.derive) {
      if (d.highlightRegionIds?.length) highlight.push(...d.highlightRegionIds);
      if (d.lookup) {
        const table = rules.lookups.find((t) => t.id === d.lookup!.tableId);
        const code = m[d.lookup.group] ?? '';
        const hit = table?.entries[code];
        if (hit) {
          values[d.fieldKey] = resolveText(hit, lang);
          reasons[d.fieldKey] = `依學號中的 ${code} 查「${table?.name ?? '對照表'}」`;
        } else if (code) {
          reasons[d.fieldKey] = `學號中的 ${code} 不在「${table?.name ?? '對照表'}」裡，請自行確認`;
        }
        continue;
      }
      if (d.value != null) {
        values[d.fieldKey] = applyTemplate(d.value, m);
        reasons[d.fieldKey] = `依規則「${pattern.name}」推導`;
      }
    }

    return {
      matchedPattern: pattern,
      values,
      reasons,
      highlightRegionIds: Array.from(new Set(highlight)),
    };
  }
  return empty;
}

/** 編輯臺用：拿一組測試學號跑規則，回報命中哪條、推出什麼 */
export function testRules(
  guide: Guide,
  samples: string[],
  lang: LangCode = 'zh-TW',
): { id: string; matched: string | null; values: Record<string, string> }[] {
  return samples
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => {
      const r = deriveFromId(guide.rules, id, lang);
      return { id, matched: r.matchedPattern?.name ?? null, values: r.values };
    });
}

/** 檢查欄位輸入是否符合 pattern，回傳錯誤訊息或 null */
export function validateField(
  value: string,
  pattern: string | undefined,
): string | null {
  if (!pattern || !value) return null;
  const re = safeRegExp(pattern);
  if (!re) return null;
  return re.test(value) ? null : '格式看起來不太對，請再確認一次';
}
