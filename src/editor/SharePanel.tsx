import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Label, Spinner, TextInput, cx } from '../components/ui';
import {
  buildSingleFileHtml,
  downloadBlob,
  exportCopyPngs,
  exportStepPngs,
  exportZip,
  printGuide,
} from '../lib/exporters';
import { humanSize } from '../lib/image';
import { qrDataUrl } from '../lib/qr';
import { buildEmbeddedLink, buildHostedLink, currentSiteOrigin, type ShareLink } from '../lib/share';
import { loadSettings, saveSettings } from '../lib/storage';
import { resolveText } from '../lib/text';
import type { EditorCtx } from './ctx';

/**
 * 分享與匯出
 *
 * 這一頁要回答使用者最在意的那個問題：主站掛掉時，已經印出去的 QR 還能不能用。
 *
 * 誠實優先於好聽。QR 碼的位元組上限是 2953，塞不下一張表單照片，
 * 所以「把整份引導塞進 QR」在物理上不可能。韌性不是來自 QR 本身，
 * 而是來自那個網址背後有幾份備援。介面上因此把四種交付方式並列，
 * 每一種都寫清楚「什麼時候用它」以及「它什麼時候會失效」，
 * 而不是把最方便的那一種包裝成萬用解。
 */

type Route = 'print' | 'hosted' | 'link' | 'offline';

// 由左到右照「多數人會用的順序」排：先列印（永遠可行、零設定），
// 再來是想要 QR 碼的人該走的「上架分享」，最後兩個是進階/少見情境。
const ROUTES: { key: Route; label: string }[] = [
  { key: 'print', label: '列印' },
  { key: 'hosted', label: '上架分享（QR）' },
  { key: 'link', label: '連結內嵌' },
  { key: 'offline', label: '離線單檔' },
];

export function SharePanel({ ctx }: { ctx: EditorCtx }) {
  const [route, setRoute] = useState<Route>('print');
  const [settings, setSettings] = useState(() => loadSettings());
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const guide = ctx.guide;
  const fileName = useMemo(
    () => (resolveText(guide.title, 'zh-TW') || 'form-guide').replace(/[\\/:*?"<>|]/g, '').slice(0, 40),
    [guide.title],
  );

  const patchSettings = (p: Partial<typeof settings>) => {
    const next = { ...settings, ...p };
    setSettings(next);
    saveSettings(next);
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setNote(e instanceof Error ? e.message : '操作失敗');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-3">
        <p className="text-sm font-semibold text-slate-600">交付網址</p>
        <div>
          <Label hint="印在紙上的主要 QR，留空就用目前這個網站的網址">主要網址</Label>
          <TextInput
            value={settings.primaryHost}
            placeholder={currentSiteOrigin()}
            onChange={(e) => patchSettings({ primaryHost: e.target.value })}
          />
        </div>
        <div>
          <Label hint="主要網址掛掉時掃這個，選填">備援網址</Label>
          <TextInput
            value={settings.mirrorHost}
            placeholder="https://your-name.pages.dev"
            onChange={(e) => patchSettings({ mirrorHost: e.target.value })}
          />
        </div>
        <p className="text-xs text-slate-500">
          目前只部署在 GitHub Pages 一個主機。如果日後想要更高的韌性，
          可以把同一份程式碼再部署一份到 Cloudflare Pages 之類的免費服務，
          填進備援網址就會多印一顆 QR。兩家同時掛掉的機率極低，
          而已經印出去的 QR 沒辦法回收重印。
        </p>
      </Card>

      <div className="flex gap-1">
        {ROUTES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRoute(r.key)}
            className={cx(
              'flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
              route === r.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {route === 'print' ? (
        <Card className="space-y-3 p-3">
          <p className="text-sm font-semibold text-slate-600">列印（推薦，零設定）</p>
          <p className="text-sm text-slate-600">
            按下面的按鈕會開啟瀏覽器的列印功能，印出來（或在列印對話框選「另存為
            PDF」存成檔案）的 A4 頁面每一聯一頁，下方附完整逐條說明，
            不是只有照片而已。就算網站全掛、學生沒網路、手機沒電，照著這張紙填也不會錯。
          </p>
          <p className="text-sm text-slate-600">
            這一頁的中文是由作業系統排版的向量文字，不是圖片，所以印出來比任何一種
            自動產生 PDF 的方式都清楚銳利。
          </p>
          <Button variant="primary" className="w-full" onClick={() => printGuide()}>
            開啟列印
          </Button>
        </Card>
      ) : null}
      {route === 'hosted' ? <HostedRoute ctx={ctx} settings={settings} /> : null}
      {route === 'link' ? <EmbeddedRoute ctx={ctx} settings={settings} /> : null}
      {route === 'offline' ? (
        <Card className="space-y-3 p-3">
          <p className="text-sm font-semibold text-slate-600">離線單檔 HTML（進階，少見情境才需要）</p>
          <p className="text-sm text-slate-600">
            這是給「完全沒有地方可以放網站、也不想印紙本」時的最後手段：
            按下面按鈕會下載一個 .html 檔案，裡面已經包含整個系統程式和這份引導的所有圖片。
            把這個檔案用 LINE、email 或隨身碟直接交給對方，對方在自己的手機或電腦上
            用瀏覽器打開這個檔案（不用先架網站、不用你部署任何東西），
            就能看到跟正式網站一模一樣的完整互動畫面，即使他當下完全沒有網路連線。
          </p>
          <p className="text-sm text-slate-600">
            多數情況下你不需要這個功能——如果你已經有網站可以放（上架分享）或直接印出來
            （列印）就夠了。這個選項是留給真的沒有任何主機、又需要離線也能用的極端情境。
          </p>
          <Button
            variant="outline"
            className="w-full"
            disabled={Boolean(busy)}
            onClick={() =>
              run('正在打包', async () => {
                const blob = await buildSingleFileHtml(guide);
                downloadBlob(blob, `${fileName}-離線版.html`);
              })
            }
          >
            {busy ?? '下載離線版 HTML'}
          </Button>
          <p className="text-xs text-slate-400">
            這個功能需要正式建置過的網站才能用。在本機開發模式下會失敗，因為那時候程式碼還沒有打包成檔案。
          </p>
        </Card>
      ) : null}

      <Card className="space-y-2 p-3">
        <p className="text-sm font-semibold text-slate-600">匯出檔案</p>

        <Button
          variant="soft"
          className="w-full"
          disabled={Boolean(busy)}
          onClick={() =>
            run('正在打包封存', async () => {
              const blob = await exportZip(guide, ctx.lang);
              downloadBlob(blob, `${fileName}.zip`);
            })
          }
        >
          匯出封存 zip（引導檔 + 所有圖片）
        </Button>

        <Button
          variant="outline"
          className="w-full"
          disabled={Boolean(busy)}
          onClick={() =>
            run('正在產生圖片', async () => {
              for (const f of await exportCopyPngs(guide, ctx.lang)) downloadBlob(f.blob, f.name);
            })
          }
        >
          每一聯一張 PNG
        </Button>

        <Button
          variant="outline"
          className="w-full"
          disabled={Boolean(busy)}
          onClick={() =>
            run('正在產生特寫卡', async () => {
              for (const f of await exportStepPngs(guide, ctx.lang)) downloadBlob(f.blob, f.name);
            })
          }
        >
          每一步一張特寫卡 PNG
        </Button>

        {busy ? <Spinner label={busy} /> : null}
        {note ? <p className="text-sm text-red-600">{note}</p> : null}

        <p className="text-xs text-slate-400">
          想要 PDF 檔請用上面「列印」分頁，選瀏覽器的「另存為 PDF」，
          文字會是清楚的向量字，不是這裡的點陣圖片。
        </p>
      </Card>

      <ResilienceTable />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function QrBlock({ url, caption }: { url: string; caption: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    qrDataUrl(url, 400)
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(''));
    return () => {
      alive = false;
    };
  }, [url]);

  if (!src) return null;
  return (
    <figure className="text-center">
      <img src={src} alt={caption} className="mx-auto w-32 rounded border border-slate-200" />
      <figcaption className="mt-1 text-xs text-slate-500">{caption}</figcaption>
    </figure>
  );
}

function CopyRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          } catch {
            /* 沒有剪貼簿權限時，使用者仍可自己選取 */
          }
        }}
      >
        {copied ? '已複製' : '複製'}
      </Button>
    </div>
  );
}

function HostedRoute({ ctx, settings }: { ctx: EditorCtx; settings: ReturnType<typeof loadSettings> }) {
  const [fileUrl, setFileUrl] = useState('');
  const primary = settings.primaryHost || currentSiteOrigin();
  const mirror = settings.mirrorHost;

  const link = fileUrl ? buildHostedLink(primary, fileUrl) : '';
  const mirrorLink = fileUrl && mirror ? buildHostedLink(mirror, fileUrl) : '';

  return (
    <Card className="space-y-3 p-3">
      <p className="text-sm font-semibold text-slate-600">上架分享（推薦）</p>
      <ol className="list-inside list-decimal space-y-1 text-sm text-slate-600">
        <li>按下面的「匯出封存 zip」，解壓縮拿到裡面的 guide.json</li>
        <li>把它放到任何能提供靜態檔案的地方，例如自己的網頁空間、GitHub Pages、學校內網</li>
        <li>把那個檔案的完整網址貼進下面，就會產生又短又穩定的分享連結與 QR</li>
      </ol>

      <div>
        <Label hint="guide.json 放好之後的完整網址">引導檔網址</Label>
        <TextInput
          value={fileUrl}
          placeholder="https://example.edu.tw/forms/summer-fee.json"
          onChange={(e) => setFileUrl(e.target.value)}
        />
      </div>

      {link ? (
        <>
          <CopyRow url={link} />
          <div className="flex justify-center gap-6 pt-1">
            <QrBlock url={link} caption="主要" />
            {mirrorLink ? <QrBlock url={mirrorLink} caption="備援" /> : null}
          </div>
          {!mirrorLink ? (
            <p className="text-xs text-amber-700">
              還沒設定備援網址。只印一顆 QR 的話，主站掛掉時所有已經印出去的紙就失效了。
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-slate-400">貼上網址後這裡會出現連結與 QR。</p>
      )}

      <p className="text-xs text-slate-500">
        這條路的網址最短，QR 最好掃，之後改內容也只要覆蓋同一個檔案，紙上的 QR 不用重印。
        它失效的情況是：放檔案的那台主機掛了，或檔案被刪掉。
      </p>

      <p className="text-xs text-slate-400">
        目前引導：{ctx.guide.copies.length} 聯，
        {ctx.guide.copies.reduce((n, c) => n + c.regions.length, 0)} 個標註。
      </p>
    </Card>
  );
}

function EmbeddedRoute({ ctx, settings }: { ctx: EditorCtx; settings: ReturnType<typeof loadSettings> }) {
  const [link, setLink] = useState<ShareLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      setLink(await buildEmbeddedLink(ctx.guide, settings.primaryHost || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : '產生失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-3">
      <p className="text-sm font-semibold text-slate-600">連結內嵌資料（進階，少見情境才需要）</p>
      <p className="text-sm text-slate-600">
        這裡的「內嵌」是指：把整份引導的所有資料，直接壓縮塞進網址本身這一長串文字裡，
        不是嵌入別的東西、也不需要另外找地方存放 guide.json 檔案。
        優點是省了「上架分享」那個要先找地方放檔案的步驟；缺點是資料量一多，
        產生出來的網址會長得沒辦法做成 QR，只能整條網址複製貼上傳給人（例如貼在 LINE 訊息裡）。
      </p>

      <Button variant="soft" className="w-full" onClick={build} disabled={busy}>
        {busy ? '正在壓縮' : '產生連結'}
      </Button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {link ? (
        <>
          <CopyRow url={link.url} />
          <div
            className={cx(
              'rounded-xl p-3 text-sm',
              link.qrFriendly
                ? 'bg-emerald-50 text-emerald-800'
                : link.qrPossible
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-red-50 text-red-700',
            )}
          >
            <p className="font-medium">
              連結長度 {humanSize(link.bytes)}
              {link.qrFriendly
                ? '，可以做成好掃的 QR'
                : link.qrPossible
                  ? '，勉強能編成 QR，但印出來會很密、可能掃不動'
                  : '，太長了，只能用貼連結的方式傳'}
            </p>
            {!link.qrPossible ? (
              <p className="mt-1 text-xs">
                QR 碼的上限是 2953 位元組，一張表單照片遠遠超過。
                想要 QR 就改用「上架分享」，那條路的網址只有幾十個字。
              </p>
            ) : null}
          </div>
          {link.qrPossible ? (
            <div className="flex justify-center">
              <QrBlock url={link.url} caption="資料內嵌在網址裡" />
            </div>
          ) : null}
        </>
      ) : null}

      <p className="text-xs text-slate-500">
        這條路的優點是完全不需要存放檔案，缺點是網址很長，而且之後改內容要重新發一次連結。
      </p>
    </Card>
  );
}

function ResilienceTable() {
  const rows = [
    ['L1', '主站，目前是 GitHub Pages', '失效'],
    ['L2', '再部署一份到 Cloudflare Pages 之類的服務，紙上印兩顆 QR（選用）', '掃備援 QR 就能用'],
    ['L3', 'PWA 離線快取', '掃過一次的手機還打得開'],
    ['L4', '離線單檔 HTML，可放隨身碟或用 LINE 傳', '完全不需要網路'],
    ['L5', '列印出來的 A4 引導單', '永遠有效'],
  ];

  return (
    <Card className="p-3">
      <p className="mb-2 text-sm font-semibold text-slate-600">主站掛掉時會怎樣</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="pb-1 pr-2 font-medium">層</th>
              <th className="pb-1 pr-2 font-medium">機制</th>
              <th className="pb-1 font-medium">結果</th>
            </tr>
          </thead>
          <tbody className="align-top">
            {rows.map(([n, mech, result]) => (
              <tr key={n} className="border-t border-slate-100">
                <td className="py-1.5 pr-2 font-semibold text-slate-500">{n}</td>
                <td className="py-1.5 pr-2 text-slate-700">{mech}</td>
                <td className="py-1.5 text-slate-500">{result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        紙不需要網域。這就是為什麼列印版面被當成第一級產出，而不是附屬功能。
      </p>
    </Card>
  );
}
