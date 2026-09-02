import { createStore, del, get, keys, set } from 'idb-keyval';
import type { Guide, GuideMeta, ImageAsset } from './types';

/**
 * 本機儲存層
 *
 * 沒有資料庫、沒有帳號。使用者的引導檔就活在他自己的瀏覽器裡：
 *   guides   store — 一份 Guide 的 JSON（不含圖片位元組）
 *   assets   store — 圖片 Blob，另存以免每次讀取都拖著幾百 KB
 *
 * 這樣做的代價很明確，也必須誠實告訴使用者：
 * 清瀏覽器資料 = 引導檔消失。所以介面要一直提醒「匯出備份」。
 */

const guideStore = createStore('form-guide-studio', 'guides');
const assetStore = createStore('form-guide-studio-assets', 'assets');

export async function listGuides(): Promise<GuideMeta[]> {
  const ids = (await keys(guideStore)) as string[];
  const metas: GuideMeta[] = [];
  for (const id of ids) {
    const g = (await get(id, guideStore)) as Guide | undefined;
    if (!g) continue;
    metas.push({
      id: g.id,
      title: g.title,
      updatedAt: g.updatedAt,
      copyCount: g.copies.length,
      regionCount: g.copies.reduce((n, c) => n + c.regions.length, 0),
    });
  }
  return metas.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function loadGuide(id: string): Promise<Guide | undefined> {
  return (await get(id, guideStore)) as Guide | undefined;
}

/** 存檔前把 assets 的 src 剝掉，圖片位元組另外存 Blob store */
export async function saveGuide(guide: Guide, stamp: string): Promise<void> {
  const slim: Guide = {
    ...guide,
    updatedAt: stamp,
    assets: Object.fromEntries(
      Object.entries(guide.assets).map(([k, a]) => [k, { ...a, src: '' }]),
    ),
  };
  await set(guide.id, slim, guideStore);
}

export async function deleteGuide(id: string): Promise<void> {
  const g = await loadGuide(id);
  if (g) {
    for (const assetId of Object.keys(g.assets)) await del(assetId, assetStore);
  }
  await del(id, guideStore);
}

export async function putAsset(id: string, blob: Blob): Promise<void> {
  await set(id, blob, assetStore);
}

export async function getAssetUrl(id: string): Promise<string | undefined> {
  const blob = (await get(id, assetStore)) as Blob | undefined;
  return blob ? URL.createObjectURL(blob) : undefined;
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
  return (await get(id, assetStore)) as Blob | undefined;
}

/** 把 IndexedDB 的圖片接回 Guide.assets.src，供畫面渲染 */
export async function hydrateAssets(guide: Guide): Promise<Guide> {
  const assets: Record<string, ImageAsset> = {};
  for (const [id, a] of Object.entries(guide.assets)) {
    if (a.src) {
      assets[id] = a;
      continue;
    }
    const url = await getAssetUrl(id);
    assets[id] = { ...a, src: url ?? '' };
  }
  return { ...guide, assets };
}

/** 匯入外部 Guide（含內嵌 dataURL）時，把圖片落地到 IndexedDB */
export async function absorbAssets(guide: Guide): Promise<void> {
  for (const [id, a] of Object.entries(guide.assets)) {
    if (!a.src.startsWith('data:')) continue;
    const blob = await (await fetch(a.src)).blob();
    await putAsset(id, blob);
  }
}

/**
 * 把引導檔轉成「可以離開這台裝置」的形式。
 *
 * 編輯的時候，圖片是 blob: 開頭的暫時網址，只在目前這個分頁有效。
 * 一旦把這種網址寫進分享連結、單檔 HTML 或匯出的 JSON，
 * 別人打開就是一片空白，而且錯誤訊息完全看不出原因。
 *
 * 所以任何「要離開這台裝置」的路徑，都必須先經過這裡把圖片換成內嵌資料。
 */
export async function toPortableGuide(guide: Guide): Promise<Guide> {
  const assets: Record<string, ImageAsset> = {};
  for (const [id, a] of Object.entries(guide.assets)) {
    if (a.src.startsWith('data:')) {
      assets[id] = a;
      continue;
    }
    const blob = (await getAssetBlob(id)) ?? (a.src ? await (await fetch(a.src)).blob() : null);
    if (!blob) {
      assets[id] = a;
      continue;
    }
    const src = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error('圖片編碼失敗'));
      fr.readAsDataURL(blob);
    });
    assets[id] = { ...a, src, bytes: blob.size };
  }
  return { ...guide, assets };
}

/* --------------------------- 設定（localStorage） --------------------------- */

const SETTINGS_KEY = 'fgs.settings.v1';

export interface AppSettings {
  aiProvider: 'gemini' | 'openai';
  geminiKey: string;
  geminiModel: string;
  openaiKey: string;
  openaiModel: string;
  openaiBaseUrl: string;
  lastLang: string;
  /** 使用者已讀過金鑰安全提醒 */
  ackKeyWarning: boolean;
  /** 分享用的主站與鏡像網址，決定 QR 內容 */
  primaryHost: string;
  mirrorHost: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: 'gemini',
  geminiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openaiKey: '',
  openaiModel: 'gpt-5-mini',
  openaiBaseUrl: 'https://api.openai.com/v1',
  lastLang: 'zh-TW',
  ackKeyWarning: false,
  primaryHost: '',
  mirrorHost: '',
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 私密瀏覽模式下可能寫不進去，忽略 */
  }
}
