import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Label, Select, Spinner, TextArea, cx } from '../components/ui';
import { AiError, generateRegions, translateBatch, type TranslateJob } from '../lib/ai';
import { loadSettings } from '../lib/storage';
import { completeness, resolveText } from '../lib/text';
import { LANG_LABEL, type Guide, type LangCode, type LocalizedText } from '../lib/types';
import type { EditorCtx } from './ctx';

/**
 * AI 助手
 *
 * 這裡的定位很明確：AI 負責把「從零到八成」那段乏味的工作做掉，
 * 人類負責最後那兩成的判斷。所以介面上刻意不做成一鍵完成，
 * 而是產生草稿後直接進入可拖曳的編輯狀態，並且在畫面上講明「請逐一確認」。
 *
 * 即使模型標框很準，照片本身是手持拍攝、有透視變形與陰影的，
 * 框一定會需要微調。把 AI 當成第一稿的擺放者，不是事實來源。
 */

const PRESETS = [
  {
    label: '整張表單全部欄位',
    text: '請辨識這張表單上所有需要填寫的欄位，逐一框選，並說明每一格該填什麼。承辦人核章的位置也要標出來，註明學生不要動。',
  },
  {
    label: '只標最容易寫錯的地方',
    text: '請只標出這張表單上最容易填錯的三到五個地方，例如格式容易搞混的欄位、只能勾一個卻常被多勾的欄位、以及承辦人才能填的位置。',
  },
  {
    label: '分區說明',
    text: '請把這張表單分成幾個區塊，每一區用一個框標起來，說明這一區整體要做什麼，不用細到每一格。',
  },
];

export function AiPanel({ ctx }: { ctx: EditorCtx }) {
  const [instruction, setInstruction] = useState(PRESETS[0].text);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [replace, setReplace] = useState(false);

  const settings = loadSettings();
  const hasKey =
    settings.aiProvider === 'gemini' ? Boolean(settings.geminiKey) : Boolean(settings.openaiKey);
  const copy = ctx.guide.copies[ctx.copyIndex];

  const run = async () => {
    if (!copy) return;
    const asset = ctx.guide.assets[copy.assetId];
    if (!asset?.src) {
      setError({ message: '這一聯還沒有底圖' });
      return;
    }

    setBusy('AI 正在看這張表單');
    setError(null);
    try {
      const startStep = replace
        ? 1
        : Math.max(0, ...ctx.guide.copies.flatMap((c) => c.regions.map((r) => r.step))) + 1;

      const regions = await generateRegions({
        imageSrc: asset.src,
        instruction,
        settings,
        lang: ctx.lang,
        startStep,
      });

      ctx.update((g) => ({
        ...g,
        copies: g.copies.map((c) =>
          c.id !== copy.id ? c : { ...c, regions: replace ? regions : [...c.regions, ...regions] },
        ),
      }));
      ctx.setSelectedId(regions[0]?.id ?? null);
      ctx.toast(`產生了 ${regions.length} 個標註，請逐一確認位置與說明`);
    } catch (e) {
      if (e instanceof AiError) setError({ message: e.message, hint: e.hint });
      else setError({ message: e instanceof Error ? e.message : '產生失敗' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {!hasKey ? (
        <Card className="bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">還沒設定 API 金鑰</p>
          <p className="mt-1">
            AI 功能需要你自己的金鑰，用量算在你自己的帳戶上。這樣這套工具才能免費開放給任何人使用。
          </p>
          <Link to="/settings" className="mt-2 inline-block font-medium underline">
            去設定金鑰
          </Link>
        </Card>
      ) : null}

      <Card className="space-y-3 p-3">
        <p className="text-sm font-semibold text-slate-600">
          讓 AI 先畫一輪：{resolveText(copy?.name, ctx.lang) || '目前這一聯'}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setInstruction(p.text)}
              className={cx(
                'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                instruction === p.text
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div>
          <Label hint="講得越具體，框就越準">你要怎麼分區</Label>
          <TextArea
            rows={5}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="例如：分成三區。第一區框選左上角的學制勾選欄，第二區標註學號那一格，第三區把右下角的紅色核章圈起來，註明學生不要碰。"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          取代這一聯現有的標註
        </label>

        {busy ? (
          <Spinner label={busy} />
        ) : (
          <Button variant="primary" onClick={run} disabled={!hasKey || !copy} className="w-full">
            產生標註草稿
          </Button>
        )}

        {error ? (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            <p className="font-medium">{error.message}</p>
            {error.hint ? <p className="mt-1 text-xs break-all">{error.hint}</p> : null}
          </div>
        ) : null}

        <p className="text-xs text-slate-400">
          照片是手持拍的，有透視變形和陰影，框一定會需要微調。
          把 AI 產出的東西當成第一稿，每一格都自己看過再發布。
        </p>
      </Card>

      <TranslateCard ctx={ctx} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** 從整份引導蒐集所有要翻譯的中文字串，順便記住它們原本在哪裡 */
function collectJobs(guide: Guide, target: LangCode): TranslateJob[] {
  const jobs: TranslateJob[] = [];
  const push = (path: string, t: LocalizedText | undefined) => {
    const src = t?.['zh-TW']?.trim();
    if (src && !t?.[target]?.trim()) jobs.push({ path, source: src });
  };

  push('title', guide.title);
  push('subtitle', guide.subtitle);
  push('logistics.where', guide.logistics?.where);
  push('logistics.deadline', guide.logistics?.deadline);
  push('logistics.contact', guide.logistics?.contact);

  guide.copies.forEach((c) => {
    push(`copy.${c.id}.name`, c.name);
    push(`copy.${c.id}.goesTo`, c.goesTo);
    push(`copy.${c.id}.note`, c.note);
    c.regions.forEach((r) => {
      push(`region.${c.id}.${r.id}.label`, r.label);
      push(`region.${c.id}.${r.id}.instruction`, r.instruction);
      push(`region.${c.id}.${r.id}.example`, r.example);
      push(`region.${c.id}.${r.id}.pitfall`, r.pitfall);
    });
  });

  guide.fields.forEach((f) => {
    push(`field.${f.key}.label`, f.label);
    push(`field.${f.key}.hint`, f.hint);
  });

  return jobs;
}

/** 把譯文照原路寫回資料結構 */
function applyTranslations(guide: Guide, target: LangCode, out: Record<string, string>): Guide {
  const merge = (t: LocalizedText | undefined, path: string): LocalizedText | undefined => {
    const v = out[path];
    if (!v) return t;
    return { ...(t ?? {}), [target]: v };
  };

  return {
    ...guide,
    title: merge(guide.title, 'title') ?? guide.title,
    subtitle: merge(guide.subtitle, 'subtitle'),
    logistics: guide.logistics
      ? {
          where: merge(guide.logistics.where, 'logistics.where'),
          deadline: merge(guide.logistics.deadline, 'logistics.deadline'),
          contact: merge(guide.logistics.contact, 'logistics.contact'),
        }
      : guide.logistics,
    copies: guide.copies.map((c) => ({
      ...c,
      name: merge(c.name, `copy.${c.id}.name`) ?? c.name,
      goesTo: merge(c.goesTo, `copy.${c.id}.goesTo`),
      note: merge(c.note, `copy.${c.id}.note`),
      regions: c.regions.map((r) => ({
        ...r,
        label: merge(r.label, `region.${c.id}.${r.id}.label`) ?? r.label,
        instruction: merge(r.instruction, `region.${c.id}.${r.id}.instruction`) ?? r.instruction,
        example: merge(r.example, `region.${c.id}.${r.id}.example`),
        pitfall: merge(r.pitfall, `region.${c.id}.${r.id}.pitfall`),
      })),
    })),
    fields: guide.fields.map((f) => ({
      ...f,
      label: merge(f.label, `field.${f.key}.label`) ?? f.label,
      hint: merge(f.hint, `field.${f.key}.hint`),
    })),
  };
}

function TranslateCard({ ctx }: { ctx: EditorCtx }) {
  const [target, setTarget] = useState<LangCode>(
    ctx.guide.languages.find((l) => l !== 'zh-TW') ?? 'en',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allTexts: (LocalizedText | undefined)[] = [
    ctx.guide.title,
    ctx.guide.subtitle,
    ...ctx.guide.copies.flatMap((c) => [
      c.name,
      c.goesTo,
      c.note,
      ...c.regions.flatMap((r) => [r.label, r.instruction, r.example, r.pitfall]),
    ]),
    ...ctx.guide.fields.flatMap((f) => [f.label, f.hint]),
  ];
  const stats = completeness(allTexts, ctx.guide.languages);
  const pending = collectJobs(ctx.guide, target).length;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const jobs = collectJobs(ctx.guide, target);
      if (!jobs.length) {
        ctx.toast('這個語言已經全部翻好了');
        return;
      }
      // 一次送太多會超過回應長度上限，分批比較穩
      const out: Record<string, string> = {};
      const size = 25;
      for (let i = 0; i < jobs.length; i += size) {
        const part = await translateBatch(loadSettings(), jobs.slice(i, i + size), target);
        Object.assign(out, part);
      }
      ctx.update((g) => applyTranslations(g, target, out));
      ctx.toast(`已翻譯 ${Object.keys(out).length} 段文字，請抽查一下`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '翻譯失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-3">
      <p className="text-sm font-semibold text-slate-600">自動翻譯</p>

      <div className="space-y-1">
        {ctx.guide.languages.map((l) => {
          const s = stats[l];
          const pct = s.total ? Math.round((s.filled / s.total) * 100) : 100;
          return (
            <div key={l} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 truncate text-slate-500">{LANG_LABEL[l]}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cx('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-amber-400')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-slate-400">
                {s.filled}/{s.total}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Select
          value={target}
          onChange={(e) => setTarget(e.target.value as LangCode)}
          className="flex-1"
        >
          {ctx.guide.languages
            .filter((l) => l !== 'zh-TW')
            .map((l) => (
              <option key={l} value={l}>
                {LANG_LABEL[l]}
              </option>
            ))}
        </Select>
        <Button variant="soft" onClick={run} disabled={busy || pending === 0}>
          {busy ? '翻譯中' : `翻譯 ${pending} 段`}
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <p className="text-xs text-slate-400">
        只會翻還沒有譯文的欄位，已經人工改過的不會被蓋掉。
        金額、期限、系所名稱這類關鍵資訊請自己再看一次，機器翻錯的期限比沒有翻譯更糟。
      </p>
    </Card>
  );
}
