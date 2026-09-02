import { nanoid } from 'nanoid';
import { useRef, useState } from 'react';
import { LocalizedInput } from '../components/LocalizedInput';
import { Button, Card, Empty, Label, Spinner, TextInput, cx } from '../components/ui';
import { COPY_COLORS, newCopy } from '../lib/factory';
import { cropImage, humanSize, processUpload } from '../lib/image';
import { sha256Hex } from '../lib/share';
import { putAsset } from '../lib/storage';
import { resolveText } from '../lib/text';
import { LANG_LABEL, type Copy, type LangCode } from '../lib/types';
import type { EditorCtx } from './ctx';

/**
 * 聯別與整份引導的基本資料
 *
 * 「切聯」是這個面板存在的主要理由。
 * 現場的人拿手機拍複寫單時，多半是一張照片裡有兩三聯。
 * 如果不切開，學生在手機上就得對著一張塞了三份表格的圖找自己那一份，
 * 那正是這套系統本來要解決的困惑。所以切聯做成一鍵，而不是叫人回去重拍。
 */

export function CopiesPanel({ ctx }: { ctx: EditorCtx }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [splitCount, setSplitCount] = useState(2);
  const addRef = useRef<HTMLInputElement>(null);
  const splitRef = useRef<HTMLInputElement>(null);

  const g = ctx.guide;

  /** 單純新增一聯：一張照片就是一聯 */
  const addCopy = async (file: File) => {
    setBusy('正在處理圖片');
    try {
      const img = await processUpload(file);
      const assetId = nanoid(8);
      await putAsset(assetId, img.blob);
      ctx.update((prev) => ({
        ...prev,
        assets: {
          ...prev.assets,
          [assetId]: {
            id: assetId,
            src: img.dataUrl,
            width: img.width,
            height: img.height,
            bytes: img.bytes,
            name: file.name,
          },
        },
        copies: [...prev.copies, newCopy(assetId, prev.copies.length)],
      }));
      ctx.setCopyIndex(g.copies.length);
      ctx.toast('已加入一聯');
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : '處理失敗');
    } finally {
      setBusy(null);
    }
  };

  /** 一張照片橫向切成 n 聯。複寫單幾乎都是上下排列，所以只切水平。 */
  const splitIntoCopies = async (file: File) => {
    setBusy('正在切分');
    try {
      const full = await processUpload(file, 2000, 0.88);
      const parts: Copy[] = [];
      const assets: Record<string, ReturnType<typeof makeAsset>> = {};

      for (let i = 0; i < splitCount; i += 1) {
        const y = i / splitCount;
        const cropped = await cropImage(full.dataUrl, { x: 0, y, w: 1, h: 1 / splitCount });
        const assetId = nanoid(8);
        await putAsset(assetId, cropped.blob);
        assets[assetId] = makeAsset(assetId, cropped.dataUrl, cropped.width, cropped.height, cropped.bytes);
        parts.push(
          newCopy(assetId, g.copies.length + i, {
            name: { 'zh-TW': `第 ${g.copies.length + i + 1} 聯` },
            color: COPY_COLORS[(g.copies.length + i) % COPY_COLORS.length],
          }),
        );
      }

      ctx.update((prev) => ({
        ...prev,
        assets: { ...prev.assets, ...assets },
        copies: [...prev.copies, ...parts],
      }));
      ctx.toast(`已切成 ${splitCount} 聯，接下來請幫每一聯改個看得懂的名字`);
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : '切分失敗');
    } finally {
      setBusy(null);
    }
  };

  const patchCopy = (id: string, p: Partial<Copy>) => {
    ctx.update((prev) => ({
      ...prev,
      copies: prev.copies.map((c) => (c.id === id ? { ...c, ...p } : c)),
    }));
  };

  const removeCopy = (id: string) => {
    const c = g.copies.find((x) => x.id === id);
    if (!c) return;
    if (
      !confirm(
        `刪除「${resolveText(c.name, ctx.lang) || '這一聯'}」？上面的 ${c.regions.length} 個標註會一起消失。`,
      )
    )
      return;
    ctx.update((prev) => ({ ...prev, copies: prev.copies.filter((x) => x.id !== id) }));
    ctx.setCopyIndex(0);
  };

  const moveCopy = (index: number, delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= g.copies.length) return;
    ctx.update((prev) => {
      const arr = [...prev.copies];
      const [item] = arr.splice(index, 1);
      arr.splice(next, 0, item);
      return { ...prev, copies: arr };
    });
    ctx.setCopyIndex(next);
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-3">
        <p className="text-sm font-semibold text-slate-600">這份引導</p>
        <div>
          <Label>標題</Label>
          <LocalizedInput
            value={g.title}
            onChange={(v) => ctx.update((p) => ({ ...p, title: v }))}
            lang={ctx.lang}
            languages={g.languages}
            placeholder="例如：暑修繳費單填寫引導"
          />
        </div>
        <div>
          <Label hint="寫清楚是哪一期、哪一版">副標</Label>
          <LocalizedInput
            value={g.subtitle}
            onChange={(v) => ctx.update((p) => ({ ...p, subtitle: v }))}
            lang={ctx.lang}
            languages={g.languages}
            placeholder="例如：114 學年第 3 學期 · 三聯複寫單"
          />
        </div>
        <div>
          <Label hint="出事時學生要知道找誰，這一欄請務必填">單位與分機</Label>
          <TextInput
            value={g.org ?? ''}
            onChange={(e) => ctx.update((p) => ({ ...p, org: e.target.value }))}
            placeholder="例如：教務處課務組 分機 1234"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <Label>哪裡拿表單</Label>
            <LocalizedInput
              value={g.logistics?.where}
              onChange={(v) =>
                ctx.update((p) => ({ ...p, logistics: { ...p.logistics, where: v } }))
              }
              lang={ctx.lang}
              languages={g.languages}
            />
          </div>
          <div>
            <Label>什麼時候要交</Label>
            <LocalizedInput
              value={g.logistics?.deadline}
              onChange={(v) =>
                ctx.update((p) => ({ ...p, logistics: { ...p.logistics, deadline: v } }))
              }
              lang={ctx.lang}
              languages={g.languages}
            />
          </div>
          <div>
            <Label>問誰</Label>
            <LocalizedInput
              value={g.logistics?.contact}
              onChange={(v) =>
                ctx.update((p) => ({ ...p, logistics: { ...p.logistics, contact: v } }))
              }
              lang={ctx.lang}
              languages={g.languages}
            />
          </div>
        </div>
      </Card>

      <Card className="p-3">
        <p className="mb-2 text-sm font-semibold text-slate-600">加入表單照片</p>
        {busy ? (
          <Spinner label={busy} />
        ) : (
          <div className="space-y-3">
            <div>
              <Button variant="soft" onClick={() => addRef.current?.click()} className="w-full">
                加入一張照片當作一聯
              </Button>
              <input
                ref={addRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) addCopy(f);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="rounded-xl border border-dashed border-slate-300 p-3">
              <p className="mb-2 text-xs text-slate-500">
                一張照片裡有好幾聯？橫著切開，讓學生一次只看自己要填的那一張。
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={splitCount}
                  onChange={(e) => setSplitCount(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {[2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      切成 {n} 聯
                    </option>
                  ))}
                </select>
                <Button variant="outline" onClick={() => splitRef.current?.click()} className="flex-1">
                  選照片並切分
                </Button>
              </div>
              <input
                ref={splitRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) splitIntoCopies(f);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        )}
      </Card>

      {g.copies.length === 0 ? (
        <Empty title="還沒有任何一聯" body="先加入一張表單照片，才能開始標註。" />
      ) : (
        <div className="space-y-3">
          {g.copies.map((c, i) => {
            const asset = g.assets[c.assetId];
            return (
              <Card key={c.id} className={cx('p-3', i === ctx.copyIndex && 'ring-2 ring-slate-900')}>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <button
                    type="button"
                    onClick={() => ctx.setCopyIndex(i)}
                    className="flex-1 truncate text-left text-sm font-medium"
                  >
                    {resolveText(c.name, ctx.lang) || `第 ${i + 1} 聯`}
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => moveCopy(i, -1)} aria-label="上移">
                    ↑
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => moveCopy(i, 1)} aria-label="下移">
                    ↓
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeCopy(c.id)} aria-label="刪除">
                    🗑
                  </Button>
                </div>

                <div className="space-y-2">
                  <div>
                    <Label>這一聯叫什麼</Label>
                    <LocalizedInput
                      value={c.name}
                      onChange={(v) => patchCopy(c.id, { name: v })}
                      lang={ctx.lang}
                      languages={g.languages}
                      placeholder="例如：課務組存根聯"
                    />
                  </div>
                  <div>
                    <Label hint="複寫單最重要的一句話">交給誰</Label>
                    <LocalizedInput
                      value={c.goesTo}
                      onChange={(v) => patchCopy(c.id, { goesTo: v })}
                      lang={ctx.lang}
                      languages={g.languages}
                      placeholder="例如：交給課務組"
                    />
                  </div>
                  <div>
                    <Label>補充說明</Label>
                    <LocalizedInput
                      multiline
                      rows={2}
                      value={c.note}
                      onChange={(v) => patchCopy(c.id, { note: v })}
                      lang={ctx.lang}
                      languages={g.languages}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label>分頁顏色</Label>
                    <input
                      type="color"
                      value={c.color}
                      onChange={(e) => patchCopy(c.id, { color: e.target.value })}
                      className="h-8 w-12 cursor-pointer rounded border border-slate-300"
                    />
                  </div>
                </div>

                <p className="mt-2 text-xs text-slate-400">
                  {c.regions.length} 個標註
                  {asset ? ` · ${asset.width}×${asset.height} · ${humanSize(asset.bytes)}` : ''}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      <DeptViewsCard ctx={ctx} />

      <Card className="p-3">
        <p className="mb-2 text-sm font-semibold text-slate-600">提供哪些語言</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(LANG_LABEL) as LangCode[]).map((l) => {
            const on = g.languages.includes(l);
            return (
              <button
                key={l}
                type="button"
                onClick={() =>
                  ctx.update((p) => ({
                    ...p,
                    languages: on
                      ? p.languages.filter((x) => x !== l)
                      : [...p.languages, l],
                  }))
                }
                className={cx(
                  'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                  on
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-500',
                )}
              >
                {LANG_LABEL[l]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          只勾你真的會提供的語言。留著一個空殼語言，學生切過去看到一片中文，比沒有那個選項更糟。
        </p>
      </Card>
    </div>
  );
}

function makeAsset(id: string, src: string, width: number, height: number, bytes: number) {
  return { id, src, width, height, bytes };
}

/** 處室檢視。刻意把「這不是資安機制」寫在使用者一定看得到的地方。 */
function DeptViewsCard({ ctx }: { ctx: EditorCtx }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');

  const add = async () => {
    if (!name.trim() || !pw.trim()) return;
    const passwordHash = await sha256Hex(pw);
    ctx.update((p) => ({
      ...p,
      deptViews: [
        ...p.deptViews,
        { id: nanoid(6), name: { 'zh-TW': name.trim() }, passwordHash },
      ],
    }));
    setName('');
    setPw('');
    ctx.toast('已新增處室檢視');
  };

  return (
    <Card className="space-y-3 p-3">
      <p className="text-sm font-semibold text-slate-600">處室內部檢視</p>
      <p className="text-xs text-slate-500">
        有些註記只給承辦人看，給學生看反而會混淆。設一組密碼，標註就能標成處室限定。
      </p>

      {ctx.guide.deptViews.map((d) => (
        <div key={d.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
          <span className="flex-1 truncate text-sm">{resolveText(d.name, ctx.lang)}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              ctx.update((p) => ({ ...p, deptViews: p.deptViews.filter((x) => x.id !== d.id) }))
            }
          >
            移除
          </Button>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2">
        <TextInput value={name} placeholder="處室名稱" onChange={(e) => setName(e.target.value)} />
        <TextInput value={pw} placeholder="密碼" onChange={(e) => setPw(e.target.value)} />
      </div>
      <Button variant="outline" onClick={add} className="w-full">
        新增
      </Button>

      <p className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">
        這道密碼是前端比對，懂技術的人打開開發者工具就能繞過。
        它的用途是避免學生誤看到內部註記，不是資訊安全機制。
        真正機密的內容的正解是不要放進這個系統，而不是替它加密。
      </p>
    </Card>
  );
}
