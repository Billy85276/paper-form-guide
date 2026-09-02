import { TextArea, TextInput } from './ui';
import { hasText } from '../lib/text';
import type { LangCode, LocalizedText } from '../lib/types';

/**
 * 多語文字輸入
 *
 * 編輯者實際上只會認真寫一種語言，其他語言多半靠 AI 翻譯後再抽查。
 * 所以介面設計成「一次只編輯一個語系」，語系是編輯臺全域的選擇（見 ctx.lang），
 * 不是每個欄位各自的狀態 —— 這裡只單純顯示/編輯目前語系的值。
 */

export function LocalizedInput({
  value,
  onChange,
  lang,
  languages,
  multiline,
  placeholder,
  rows = 3,
  className,
}: {
  value: LocalizedText | undefined;
  onChange: (next: LocalizedText) => void;
  lang: LangCode;
  languages: LangCode[];
  multiline?: boolean;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const current = value?.[lang] ?? '';
  const set = (v: string) => {
    const next = { ...(value ?? {}) };
    if (v) next[lang] = v;
    else delete next[lang];
    onChange(next);
  };

  // 目前語系空著、但中文已經有內容：小圓點提醒「這裡還缺翻譯」，非中文語系才顯示
  const missing = lang !== 'zh-TW' && languages.length > 1 && !current && hasText(value, 'zh-TW');

  return (
    <div className={className}>
      <div className="relative">
        {multiline ? (
          <TextArea rows={rows} value={current} placeholder={placeholder} onChange={(e) => set(e.target.value)} />
        ) : (
          <TextInput value={current} placeholder={placeholder} onChange={(e) => set(e.target.value)} />
        )}
        {missing ? (
          <span
            title="中文已有內容，這個語系還沒翻譯"
            className="pointer-events-none absolute top-1.5 right-1.5 size-1.5 rounded-full bg-amber-400"
          />
        ) : null}
      </div>
    </div>
  );
}
