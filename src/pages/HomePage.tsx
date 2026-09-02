import JSZip from 'jszip';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Spinner } from '../components/ui';
import { buildDemoGuide } from '../lib/demo';
import { newGuide } from '../lib/factory';
import { resolveText } from '../lib/text';
import {
  absorbAssets,
  deleteGuide,
  listGuides,
  loadGuide,
  saveGuide,
} from '../lib/storage';
import type { Guide, GuideMeta } from '../lib/types';

/**
 * 首頁同時是說明頁。
 *
 * 使用者第一次打開這個網站時最大的疑問不是「按鈕在哪」，而是
 * 「這東西到底怎麼用、學生那邊會看到什麼」。
 * 所以首頁上半直接把整個流程講完，下半才是他自己的引導清單。
 */

export function HomePage() {
  const nav = useNavigate();
  const [items, setItems] = useState<GuideMeta[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setItems(await listGuides());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createBlank = async () => {
    const g = newGuide(new Date().toISOString());
    await saveGuide(g, g.updatedAt);
    nav(`/edit/${g.id}`);
  };

  const createDemo = async () => {
    setBusy('正在準備示範引導');
    try {
      const g = await buildDemoGuide(new Date().toISOString(), `${import.meta.env.BASE_URL}sample-form-demo.jpg`);
      await saveGuide(g, g.updatedAt);
      await refresh();
      nav(`/edit/${g.id}`);
    } catch (e) {
      alert(`示範引導載入失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const importFile = async (file: File) => {
    setBusy('正在匯入');
    try {
      let guide: Guide;
      if (file.name.endsWith('.zip') || file.name.endsWith('.fgz')) {
        const zip = await JSZip.loadAsync(file);
        const entry = zip.file('guide.json');
        if (!entry) throw new Error('壓縮檔裡沒有 guide.json');
        guide = JSON.parse(await entry.async('string')) as Guide;
      } else {
        guide = JSON.parse(await file.text()) as Guide;
      }
      if (!guide?.copies) throw new Error('這不是一份有效的引導檔');

      // 同一份引導重複匯入時給新的 id，避免覆蓋掉本來就有的那份
      if (await loadGuide(guide.id)) guide = { ...guide, id: `${guide.id}-${Date.now().toString(36)}` };
      await absorbAssets(guide);
      await saveGuide(guide, new Date().toISOString());
      await refresh();
      nav(`/edit/${guide.id}`);
    } catch (e) {
      alert(`匯入失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">實體表單引導</h1>
          <p className="mt-1 text-slate-500">把紙本表單變成看得懂的線上引導</p>
        </div>
        <Link
          to="/settings"
          className="inline-flex h-10 shrink-0 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          設定
        </Link>
      </header>

      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">這套東西怎麼用</h2>
        </div>
        <ol className="divide-y divide-slate-100">
          {[
            {
              n: '1',
              t: '拍一張空白表單',
              d: '手機直接拍就好。如果一張紙上有好幾聯，系統可以幫你切成獨立的幾聯，讓學生一次只看自己要填的那一張。',
            },
            {
              n: '2',
              t: '在照片上圈出要填的地方',
              d: '拖曳就能畫框。每一格寫清楚要填什麼、正確範例是什麼、最多人在哪裡寫錯。承辦人才填的欄位標成灰色，學生就知道不要碰。',
            },
            {
              n: '3',
              t: '交給 AI 做前置',
              d: '上傳照片後用打字描述你要怎麼分區，AI 會先把大部分的框和說明生出來，你只要微調。金鑰放在你自己的瀏覽器，帳單也算在你自己頭上。',
            },
            {
              n: '4',
              t: '印出來、貼在櫃檯',
              d: '匯出的 A4 引導單本身就寫完了所有步驟，旁邊附一個 QR。學生沒網路、手機沒電，看紙也能填對。',
            },
            {
              n: '5',
              t: '學生掃 QR',
              d: '一進來就看到紙上所有該注意的位置都被標起來，點哪個看哪個，也可以按逐步精靈一步一步帶。可以切語言，輸入學號會自動判斷學制與系所，還能看「填好長什麼樣」。',
            },
          ].map((s) => (
            <li key={s.n} className="flex gap-3 px-5 py-3">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
                {s.n}
              </span>
              <div>
                <p className="font-medium">{s.t}</p>
                <p className="text-sm text-slate-500">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="primary" size="lg" onClick={createBlank}>
          建立新的引導
        </Button>
        <Button variant="soft" size="lg" onClick={createDemo} disabled={Boolean(busy)}>
          看示範：暑修繳費單
        </Button>
        <Button variant="outline" size="lg" onClick={() => fileRef.current?.click()}>
          匯入引導檔
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.zip,.fgz,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {busy ? (
        <div className="mb-4">
          <Spinner label={busy} />
        </div>
      ) : null}

      <h2 className="mb-2 text-sm font-semibold text-slate-500">你的引導</h2>

      {items === null ? (
        <Spinner label="讀取中" />
      ) : items.length === 0 ? (
        <Empty
          title="還沒有任何引導"
          body="先看示範那一份，會比較快理解這套東西能做到什麼。"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((m) => (
            <Card key={m.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{resolveText(m.title, 'zh-TW') || '未命名'}</p>
                <p className="text-xs text-slate-400">
                  {m.copyCount} 聯 · {m.regionCount} 個標註 ·{' '}
                  {new Date(m.updatedAt).toLocaleString('zh-TW')}
                </p>
              </div>
              <Link
                to={`/v?id=${m.id}`}
                className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50"
              >
                檢視
              </Link>
              <Link
                to={`/edit/${m.id}`}
                className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-sm text-white hover:bg-slate-700"
              >
                編輯
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!confirm('刪除這份引導？這台裝置上的資料會一併移除，無法復原。')) return;
                  await deleteGuide(m.id);
                  await refresh();
                }}
                aria-label="刪除"
              >
                🗑
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6 bg-amber-50/60 p-4 text-sm text-amber-900">
        <p className="font-semibold">關於你的資料放在哪裡</p>
        <p className="mt-1">
          這個網站沒有伺服器也沒有帳號。你的引導檔存在這台電腦的瀏覽器裡，
          我們看不到，也沒有任何一份備份在別的地方。
          意思是：清除瀏覽器資料，或換一台電腦，這些引導就不見了。
          做完一份請記得從編輯臺按「匯出封存」下載一份備份，那個檔案才是你真正的正本。
        </p>
      </Card>
    </div>
  );
}
