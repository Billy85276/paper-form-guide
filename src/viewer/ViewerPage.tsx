import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, Spinner } from '../components/ui';
import { decodePayload } from '../lib/share';
import { hydrateAssets, loadGuide } from '../lib/storage';
import type { Guide } from '../lib/types';
import { GuideViewer } from './GuideViewer';

/**
 * 檢視入口
 *
 * 一份引導可以從四個地方來，優先順序如下：
 *   1. 內嵌       單檔離線 HTML 直接把 JSON 寫在頁面裡
 *   2. ?d=        分享連結，資料壓縮後放在網址的 # 之後，不需要任何主機存放
 *   3. ?f=        指向一份已上架的 guide.json，這是最短也最推薦的分享方式
 *   4. ?id=       這台裝置自己的瀏覽器裡存的引導
 *
 * 這四條路都不需要登入、不需要資料庫，也不需要我們知道使用者是誰。
 */

export function ViewerPage({ embedded }: { embedded?: Guide }) {
  const [params] = useSearchParams();
  const [guide, setGuide] = useState<Guide | null>(embedded ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!embedded);

  const payload = params.get('d');
  const fileUrl = params.get('f');
  const localId = params.get('id');

  useEffect(() => {
    if (embedded) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (payload) {
          const g = await decodePayload(payload);
          if (!cancelled) setGuide(g);
        } else if (fileUrl) {
          const res = await fetch(fileUrl);
          if (!res.ok) throw new Error(`讀取失敗 ${res.status}`);
          const g = (await res.json()) as Guide;
          if (!cancelled) setGuide(g);
        } else if (localId) {
          const g = await loadGuide(localId);
          if (!g) throw new Error('這台裝置上找不到這份引導');
          if (!cancelled) setGuide(await hydrateAssets(g));
        } else {
          throw new Error('沒有指定要看哪一份引導');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '讀取失敗');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [embedded, payload, fileUrl, localId]);

  if (loading) {
    return (
      <div className="grid min-h-full place-items-center p-8">
        <Spinner label="載入中" />
      </div>
    );
  }

  if (error || !guide) {
    return (
      <div className="grid min-h-full place-items-center p-6">
        <Card className="max-w-md p-6 text-center">
          <p className="text-lg font-semibold">打不開這份引導</p>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <p className="mt-4 text-sm text-slate-500">
            如果你是掃 QR 碼進來的，紙上通常還印了一個備援網址，可以試試那一個。
            列印說明本身就寫完了所有步驟，照著填也不會錯。
          </p>
          <div className="mt-4 flex justify-center">
            <Link
              to="/"
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 font-medium text-slate-700 hover:bg-slate-50"
            >
              回到首頁
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return <GuideViewer guide={guide} editHref={localId ? `/edit/${localId}` : undefined} />;
}
