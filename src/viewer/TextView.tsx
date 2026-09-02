import { Button, Card } from '../components/ui';
import { ROLE_HINT } from '../lib/factory';
import { resolveText } from '../lib/text';
import type { Guide, LangCode } from '../lib/types';

/**
 * 純文字版
 *
 * 這一頁存在的理由有三個，都不是「照片載不出來時的降級」：
 *   1. 母語不在我們支援清單裡的外籍生，會長按選取整段文字丟進自己的翻譯 App。
 *      圖片上的標註做不到這件事，純文字可以。
 *   2. 螢幕閱讀器使用者需要一份線性的、有語意結構的內容。
 *   3. 有人就是想把整份說明複製起來貼到 LINE 群組裡發給同學。
 *
 * 所以它是一等公民，不是備案。
 */

export function TextView({
  guide,
  lang,
  onClose,
}: {
  guide: Guide;
  lang: LangCode;
  onClose: () => void;
}) {
  const copyAll = async () => {
    const lines: string[] = [resolveText(guide.title, lang)];
    if (guide.subtitle) lines.push(resolveText(guide.subtitle, lang));
    if (guide.org) lines.push(guide.org);
    lines.push('');

    guide.copies.forEach((c, i) => {
      lines.push(`【第 ${i + 1} 聯：${resolveText(c.name, lang)}】`);
      if (c.goesTo) lines.push(`交給：${resolveText(c.goesTo, lang)}`);
      c.regions
        .filter((r) => !r.deptOnly)
        .sort((a, b) => a.step - b.step)
        .forEach((r) => {
          lines.push(
            `${r.step}. ${resolveText(r.label, lang)}（${
              r.audience === 'staff' ? '承辦人填，你不要動' : ROLE_HINT[r.role]
            }）`,
          );
          lines.push(`   ${resolveText(r.instruction, lang)}`);
          const ex = resolveText(r.example, lang);
          if (ex) lines.push(`   正確範例：${ex}`);
          const pf = resolveText(r.pitfall, lang);
          if (pf) lines.push(`   常見錯誤：${pf}`);
        });
      lines.push('');
    });

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      /* 沒有剪貼簿權限就算了，使用者還是可以自己選取 */
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="no-print mb-4 flex items-center gap-2">
        <Button variant="outline" onClick={onClose}>
          ← 回到圖片版
        </Button>
        <Button variant="soft" onClick={copyAll}>
          複製全部文字
        </Button>
      </div>

      <h1 className="text-2xl font-bold">{resolveText(guide.title, lang)}</h1>
      {guide.subtitle ? (
        <p className="mt-1 text-slate-600">{resolveText(guide.subtitle, lang)}</p>
      ) : null}
      {guide.org ? <p className="mt-1 text-sm text-slate-400">{guide.org}</p> : null}

      {guide.copies.map((copy, ci) => (
        <Card key={copy.id} className="mt-5 p-4">
          <h2 className="font-semibold" style={{ color: copy.color }}>
            第 {ci + 1} 聯：{resolveText(copy.name, lang)}
          </h2>
          {copy.goesTo ? (
            <p className="text-sm text-slate-500">交給{resolveText(copy.goesTo, lang)}</p>
          ) : null}

          <ol className="mt-3 space-y-3">
            {copy.regions
              .filter((r) => !r.deptOnly)
              .sort((a, b) => a.step - b.step)
              .map((r) => (
                <li key={r.id} className="border-l-2 pl-3" style={{ borderColor: copy.color }}>
                  <p className="font-medium">
                    {r.step}. {resolveText(r.label, lang)}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {r.audience === 'staff' ? '承辦人填，你不要動' : ROLE_HINT[r.role]}
                    </span>
                  </p>
                  <p className="text-[15px] leading-relaxed text-slate-700">
                    {resolveText(r.instruction, lang)}
                  </p>
                  {resolveText(r.example, lang) ? (
                    <p className="text-sm text-emerald-700">
                      正確範例：{resolveText(r.example, lang)}
                    </p>
                  ) : null}
                  {resolveText(r.pitfall, lang) ? (
                    <p className="text-sm text-red-700">
                      常見錯誤：{resolveText(r.pitfall, lang)}
                    </p>
                  ) : null}
                </li>
              ))}
          </ol>
        </Card>
      ))}
    </div>
  );
}
