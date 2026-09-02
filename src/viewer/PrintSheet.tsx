import { useEffect, useState } from 'react';
import { FormCanvas } from '../components/FormCanvas';
import { ROLE_HINT } from '../lib/factory';
import { qrDataUrl } from '../lib/qr';
import { resolveText } from '../lib/text';
import type { Guide, LangCode } from '../lib/types';

/**
 * 列印版面
 *
 * 這是整套系統韌性的最後一層，也是最硬的一層。
 * 網站掛掉、手機沒電、學生沒有網路、外籍生手機是舊 Android，
 * 這張紙都還在。所以列印版不是網頁的縮圖，而是一份自己就講得完的說明。
 *
 * 每一聯一頁：上半是標好號碼的表單全圖，下半是對應的逐條說明。
 * 最後附一頁 QR 與備援網址，讓想看動態版的人自己掃。
 */

export function PrintSheet({
  guide,
  lang,
  values,
  shareUrl,
  mirrorUrl,
}: {
  guide: Guide;
  lang: LangCode;
  values?: Record<string, string>;
  shareUrl?: string;
  mirrorUrl?: string;
}) {
  const [qrMain, setQrMain] = useState('');
  const [qrMirror, setQrMirror] = useState('');

  useEffect(() => {
    if (shareUrl) qrDataUrl(shareUrl, 400).then(setQrMain).catch(() => setQrMain(''));
    if (mirrorUrl) qrDataUrl(mirrorUrl, 400).then(setQrMirror).catch(() => setQrMirror(''));
  }, [shareUrl, mirrorUrl]);

  return (
    <div className="print-only">
      {guide.copies.map((copy, ci) => {
        const own = copy.regions.filter((r) => !r.deptOnly).sort((a, b) => a.step - b.step);
        return (
          <section key={copy.id} className="print-page">
            <header className="mb-3 border-b-2 border-slate-800 pb-2">
              <h1 className="text-xl font-bold">{resolveText(guide.title, lang)}</h1>
              <p className="text-sm text-slate-600">
                {resolveText(guide.subtitle, lang)}
                {guide.org ? ` · ${guide.org}` : ''}
              </p>
              <p className="mt-1 text-sm font-semibold" style={{ color: copy.color }}>
                第 {ci + 1} 聯：{resolveText(copy.name, lang)}
                {copy.goesTo ? ` · 交給${resolveText(copy.goesTo, lang)}` : ''}
              </p>
            </header>

            <FormCanvas
              guide={guide}
              copy={copy}
              lang={lang}
              values={values}
              showBadges
              className="border border-slate-300"
            />

            <ol className="mt-3 space-y-1.5">
              {own.map((region) => (
                <li key={region.id} className="print-step flex gap-2 text-[11pt] leading-snug">
                  <span
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[9pt] font-bold text-white"
                    style={{ backgroundColor: region.style.color || '#334155' }}
                  >
                    {region.step}
                  </span>
                  <span>
                    <strong>{resolveText(region.label, lang)}</strong>
                    <span className="text-slate-500">
                      {' '}
                      （
                      {region.audience === 'staff' ? '承辦人填，你不要動' : ROLE_HINT[region.role]}
                      ）
                    </span>
                    <br />
                    {resolveText(region.instruction, lang)}
                    {resolveText(region.example, lang) ? (
                      <>
                        <br />
                        <span className="text-emerald-700">
                          正確範例：{resolveText(region.example, lang)}
                        </span>
                      </>
                    ) : null}
                    {resolveText(region.pitfall, lang) ? (
                      <>
                        <br />
                        <span className="text-red-700">
                          常見錯誤：{resolveText(region.pitfall, lang)}
                        </span>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      {shareUrl ? (
        <section className="print-page">
          <h2 className="mb-2 text-lg font-bold">看動態版與其他語言</h2>
          <p className="mb-4 max-w-prose text-sm text-slate-600">
            用手機相機掃描下面的 QR 碼，就能打開這份引導的互動版本，
            可以切換語言、輸入學號自動判斷系所、看填好之後長什麼樣子。
            兩個 QR 內容相同，分別放在不同的主機上，其中一個打不開就掃另一個。
          </p>
          <div className="flex gap-8">
            {qrMain ? (
              <figure>
                <img src={qrMain} alt="主要網址 QR" className="w-40" />
                <figcaption className="mt-1 text-xs break-all text-slate-500">
                  主要：{shareUrl}
                </figcaption>
              </figure>
            ) : null}
            {qrMirror ? (
              <figure>
                <img src={qrMirror} alt="備援網址 QR" className="w-40" />
                <figcaption className="mt-1 text-xs break-all text-slate-500">
                  備援：{mirrorUrl}
                </figcaption>
              </figure>
            ) : null}
          </div>
          <p className="mt-6 text-xs text-slate-400">
            這份說明本身已經寫完了所有步驟，就算兩個網址都打不開，照著上面幾頁填也不會錯。
          </p>
        </section>
      ) : null}
    </div>
  );
}
