import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FormCanvas } from '../components/FormCanvas';
import { Button, Card, Spinner, cx } from '../components/ui';
import { newRegion, renumberSteps } from '../lib/factory';
import { hydrateAssets, loadGuide, saveGuide } from '../lib/storage';
import { resolveText } from '../lib/text';
import { LANG_LABEL, type Guide, type LangCode, type RegionShape } from '../lib/types';
import { PrintSheet } from '../viewer/PrintSheet';
import { AiPanel } from './AiPanel';
import { CopiesPanel } from './CopiesPanel';
import { FieldsPanel } from './FieldsPanel';
import { InspectorPanel } from './InspectorPanel';
import { RulesPanel } from './RulesPanel';
import { SharePanel } from './SharePanel';
import type { EditorCtx } from './ctx';

/**
 * 編輯臺
 *
 * 版面是「左邊一張紙、右邊一疊工具」。左邊永遠是那張照片，
 * 因為編輯者整個過程都在回答同一個問題：這一格在紙上的哪裡。
 *
 * 自動存檔是預設行為，沒有儲存按鈕。但同時必須誠實提醒：
 * 存的地方是這台電腦的瀏覽器，不是雲端。所以另外提供一個
 * 「綁定備份檔」，把每次變更同步寫進使用者自己選的一個檔案，
 * 那個檔案放在雲端硬碟資料夾裡，就等於有了真正的備份。
 */

type Tab = 'inspect' | 'copies' | 'fields' | 'rules' | 'ai' | 'share';

const TABS: { key: Tab; label: string }[] = [
  { key: 'inspect', label: '標註' },
  { key: 'copies', label: '聯與資料' },
  { key: 'fields', label: '欄位' },
  { key: 'rules', label: '學號規則' },
  { key: 'ai', label: 'AI' },
  { key: 'share', label: '分享匯出' },
];

const TOOLS: { shape: RegionShape | null; label: string; title: string }[] = [
  { shape: null, label: '選取', title: '點選與拖曳既有的標註' },
  { shape: 'rect', label: '方框', title: '框出一格要填的欄位' },
  { shape: 'ellipse', label: '圈選', title: '圈起某個項目或印章' },
  { shape: 'underline', label: '底線', title: '在一行字底下畫線' },
  { shape: 'checkbox', label: '勾選框', title: '標出要打勾的小方格' },
  { shape: 'arrow', label: '箭頭', title: '從空白處指向某個位置' },
];

interface FileHandleLike {
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
  name: string;
}

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [lang, setLang] = useState<LangCode>('zh-TW');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copyIndex, setCopyIndex] = useState(0);
  const [tab, setTab] = useState<Tab>('copies');
  const [tool, setTool] = useState<RegionShape | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [backupName, setBackupName] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const backupHandle = useRef<FileHandleLike | null>(null);
  const saveTimer = useRef<number | null>(null);

  /* 載入 ----------------------------------------------------------- */
  useEffect(() => {
    if (!id) return;
    (async () => {
      const g = await loadGuide(id);
      if (!g) return;
      const hydrated = await hydrateAssets(g);
      setGuide(hydrated);
      setLang(hydrated.defaultLang);
    })();
  }, [id]);

  const toast = useCallback((message: string) => {
    setToastMsg(message);
    window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  /* 自動存檔 ------------------------------------------------------- */
  const update = useCallback(
    (fn: (g: Guide) => Guide) => {
      setGuide((prev) => {
        if (!prev) return prev;
        const next = fn(prev);

        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(async () => {
          setSaving(true);
          try {
            const stamp = new Date().toISOString();
            await saveGuide(next, stamp);
            if (backupHandle.current) {
              const w = await backupHandle.current.createWritable();
              await w.write(JSON.stringify({ ...next, updatedAt: stamp }, null, 2));
              await w.close();
            }
          } catch {
            toast('存檔失敗，請用「分享匯出」手動備份一次');
          } finally {
            setSaving(false);
          }
        }, 700);

        return next;
      });
    },
    [toast],
  );

  /* 綁定備份檔 ----------------------------------------------------- */
  const bindBackup = async () => {
    const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileHandleLike> })
      .showSaveFilePicker;
    if (!picker) {
      toast('這個瀏覽器不支援綁定備份檔，請改用「分享匯出」手動下載');
      return;
    }
    try {
      const handle = await picker({
        suggestedName: `${resolveText(guide?.title, 'zh-TW') || 'form-guide'}.json`,
        types: [{ description: '引導檔', accept: { 'application/json': ['.json'] } }],
      });
      backupHandle.current = handle;
      setBackupName(handle.name);
      if (guide) {
        const w = await handle.createWritable();
        await w.write(JSON.stringify(guide, null, 2));
        await w.close();
      }
      toast('已綁定。之後每次修改都會自動寫進這個檔案');
    } catch {
      /* 使用者取消，不用處理 */
    }
  };

  // 前後對照用的模擬值：沒有真的學生輸入可以用，就借用每個欄位自己的
  // placeholder 範例值，這樣編輯者不用額外輸入什麼，切一下開關就能看到
  // 「填好大概長怎樣」。
  const previewValues = useMemo(() => {
    if (!guide) return {};
    return Object.fromEntries(
      guide.fields.filter((f) => f.placeholder).map((f) => [f.key, f.placeholder as string]),
    );
  }, [guide]);

  if (!guide) {
    return (
      <div className="grid min-h-full place-items-center p-8">
        <Spinner label="載入中" />
      </div>
    );
  }

  const ctx: EditorCtx = {
    guide,
    update,
    lang,
    setLang,
    selectedId,
    setSelectedId,
    copyIndex,
    setCopyIndex,
    toast,
  };

  const copy = guide.copies[copyIndex];

  const addRegionFromDraw = (rect: { x: number; y: number; w: number; h: number }) => {
    if (!copy || !tool) return;
    const step = Math.max(0, ...guide.copies.flatMap((c) => c.regions.map((r) => r.step))) + 1;
    const region = newRegion({
      ...rect,
      shape: tool,
      step,
      role: tool === 'checkbox' ? 'check' : tool === 'ellipse' ? 'circle' : 'fill',
      label: { [lang]: `標註 ${step}` },
    });
    update((g) => ({
      ...g,
      copies: g.copies.map((c) => (c.id === copy.id ? { ...c, regions: [...c.regions, region] } : c)),
    }));
    setSelectedId(region.id);
    setTab('inspect');
    setTool(null);
  };

  return (
    <div className="min-h-full">
      <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-3 py-2">
          <Link
            to="/"
            className="inline-flex h-9 shrink-0 items-center rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            ← 全部引導
          </Link>
          <h1 className="min-w-0 flex-1 truncate font-semibold">
            {resolveText(guide.title, lang) || '未命名引導'}
          </h1>

          <span className="hidden text-xs text-slate-400 sm:inline">
            {saving ? '儲存中' : '已自動儲存'}
          </span>

          <Button variant={backupName ? 'soft' : 'outline'} size="sm" onClick={bindBackup}>
            {backupName ? `備份到 ${backupName}` : '綁定備份檔'}
          </Button>

          {/* 快速切換：只列出這份引導實際有勾選的語言。
              「要提供哪些語言」的完整勾選清單移到「聯與資料」分頁最下面設定，
              這裡只負責切換，不負責增減語言，兩件事分開才不會每個欄位都長一份。 */}
          <div className="fgs-scroll hidden max-w-[40vw] gap-1 overflow-x-auto sm:flex">
            {guide.languages.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={cx(
                  'shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  l === lang ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {LANG_LABEL[l]}
              </button>
            ))}
          </div>

          <Link
            to={`/v?id=${guide.id}`}
            className="inline-flex h-9 shrink-0 items-center rounded-lg bg-slate-900 px-3 text-sm text-white hover:bg-slate-700"
          >
            預覽學生端
          </Link>
        </div>
      </header>

      <div className="no-print mx-auto grid max-w-[1600px] gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* 畫布 */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {preview ? (
              <span className="text-sm text-slate-500">
                目前是「看填好的樣子」預覽，先切回空白引導才能繼續編輯標註
              </span>
            ) : (
              <>
                {TOOLS.map((tl) => (
                  <button
                    key={tl.label}
                    type="button"
                    title={tl.title}
                    onClick={() => setTool(tl.shape)}
                    className={cx(
                      'rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors',
                      tool === tl.shape
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {tl.label}
                  </button>
                ))}
                <span className="ml-1 text-xs text-slate-400">
                  {tool ? '在照片上拖曳畫出範圍' : '點標註來編輯，拖曳可移動'}
                </span>
              </>
            )}
            <Button
              variant={preview ? 'primary' : 'outline'}
              size="sm"
              className="ml-auto"
              onClick={() => setPreview((v) => !v)}
              title="用每個欄位的範例值，預覽填好之後大概長怎樣"
            >
              {preview ? '看空白引導' : '看填好的樣子'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                update((g) => renumberSteps(g));
                toast('已依目前順序重新編號');
              }}
            >
              重新編號
            </Button>
          </div>

          {guide.copies.length > 1 ? (
            <div className="fgs-scroll mb-2 flex gap-1 overflow-x-auto">
              {guide.copies.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => setCopyIndex(i)}
                  className={cx(
                    'shrink-0 rounded-full border px-3 py-1 text-sm',
                    i === copyIndex
                      ? 'border-transparent text-white'
                      : 'border-slate-200 bg-white text-slate-600',
                  )}
                  style={i === copyIndex ? { backgroundColor: c.color } : undefined}
                >
                  {resolveText(c.name, lang) || `第 ${i + 1} 聯`}
                </button>
              ))}
            </div>
          ) : null}

          {copy ? (
            <FormCanvas
              guide={guide}
              copy={copy}
              lang={lang}
              editable={!preview}
              drawShape={preview ? null : tool}
              onDrawEnd={addRegionFromDraw}
              activeRegionId={selectedId}
              onSelect={(rid) => {
                setSelectedId(rid);
                if (rid) setTab('inspect');
              }}
              onChangeRegions={(regions) =>
                update((g) => ({
                  ...g,
                  copies: g.copies.map((c) => (c.id === copy.id ? { ...c, regions } : c)),
                }))
              }
              simulate={preview}
              values={previewValues}
              className="border border-slate-200 shadow-sm"
            />
          ) : (
            <Card className="grid place-items-center p-12 text-center text-slate-500">
              <div>
                <p className="font-medium">還沒有表單照片</p>
                <p className="mt-1 text-sm">
                  切到右邊的「聯與資料」加入一張照片，或把一張多聯的照片切成好幾聯。
                </p>
              </div>
            </Card>
          )}
        </div>

        {/* 工具面板 */}
        <div>
          <div className="fgs-scroll mb-2 flex gap-1 overflow-x-auto">
            {TABS.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={cx(
                  'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === tb.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100',
                )}
              >
                {tb.label}
              </button>
            ))}
          </div>

          <div className="fgs-scroll lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-1">
            {tab === 'inspect' ? <InspectorPanel ctx={ctx} /> : null}
            {tab === 'copies' ? <CopiesPanel ctx={ctx} /> : null}
            {tab === 'fields' ? <FieldsPanel ctx={ctx} /> : null}
            {tab === 'rules' ? <RulesPanel ctx={ctx} /> : null}
            {tab === 'ai' ? <AiPanel ctx={ctx} /> : null}
            {tab === 'share' ? <SharePanel ctx={ctx} /> : null}
          </div>
        </div>
      </div>

      {/* 列印版面。掛在編輯臺這裡，是為了讓「分享匯出」分頁的列印按鈕
          不管在編輯臺還是在學生端點都印得出一樣完整的版面，而不是把
          編輯臺自己的工具列印出來。用範例值模擬「填好的樣子」。 */}
      <PrintSheet guide={guide} lang={lang} values={previewValues} />

      {toastMsg ? (
        <p className="no-print fixed bottom-4 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-center text-sm text-white shadow-lg">
          {toastMsg}
        </p>
      ) : null}
    </div>
  );
}
