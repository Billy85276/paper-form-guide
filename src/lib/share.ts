import { deflate, inflate } from 'fflate';
import { toPortableGuide } from './storage';
import type { Guide } from './types';

/**
 * 分享與離線韌性
 *
 * 這裡是整個專案最需要講清楚的一段，因為使用者的核心要求是
 * 「主站掛掉時 QR 也要能用」。先講事實，再講對策。
 *
 * 事實一：QR 碼塞不下這套東西。
 *   QR 版本 40、錯誤更正等級 L 的理論上限是 2953 位元組。
 *   一張壓到 200 KB 的表單照片，base64 之後約 270 KB，差了快一百倍。
 *   所以「把整份引導塞進 QR」在物理上不可能，任何說可以的方案都是錯的。
 *
 * 事實二：QR 只能存一段短字串，通常就是一個網址。
 *   因此韌性不是來自 QR 本身，而是來自「那個網址指向的東西有幾份備援」。
 *
 * 對策是五層，越後面越硬：
 *   L1 主站            目前是 GitHub Pages，免費、跟著 git push 自動部署，但終究是單點。
 *   L2 鏡像            同一份靜態檔案再部署一份到 Cloudflare Pages 之類的服務（選用），
 *                      紙上印主備兩顆 QR。兩家同時掛掉的機率極低。
 *   L3 離線快取        PWA service worker。掃過一次的手機，之後即使主站死了也打得開。
 *   L4 單檔 HTML       圖片以 base64 內嵌的自帶式網頁，放隨身碟、LINE、email、
 *                      學校內網都能開，完全不需要網際網路。
 *   L5 紙本            匯出的 A4 引導單本身就印了完整步驟文字。
 *                      QR 只是加值，不是唯一途徑。這一層永遠不會掛。
 *
 * 另外提供「連結內嵌資料」模式：把整份引導壓進網址的 # 之後。
 * 這種連結不需要任何後端存放引導檔，任何能提供這支 JS 的主機都能開，
 * 適合用 LINE 或 email 傳給人。缺點是網址很長，多半長到掃不成 QR，
 * 所以介面上會依實際長度誠實標示「這條連結能不能做成 QR」。
 */

/** QR 版本 40、錯誤更正 L 的位元組上限 */
export const QR_BYTE_LIMIT = 2953;
/** 實務上還要留錯誤更正餘裕，超過這個長度掃描成功率會明顯下降 */
export const QR_SAFE_LIMIT = 1200;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encodePayload(rawGuide: Guide): Promise<string> {
  // 圖片必須先內嵌，否則連結傳給別人會是一片空白
  const json = new TextEncoder().encode(JSON.stringify(await toPortableGuide(rawGuide)));
  const packed = await new Promise<Uint8Array>((resolve, reject) => {
    deflate(json, { level: 9 }, (err, data) => (err ? reject(err) : resolve(data)));
  });
  return toBase64Url(packed);
}

export async function decodePayload(payload: string): Promise<Guide> {
  const bytes = fromBase64Url(payload);
  const raw = await new Promise<Uint8Array>((resolve, reject) => {
    inflate(bytes, (err, data) => (err ? reject(err) : resolve(data)));
  });
  return JSON.parse(new TextDecoder().decode(raw)) as Guide;
}

export interface ShareLink {
  url: string;
  bytes: number;
  /** 這條連結短到可以做成可靠掃描的 QR 嗎 */
  qrFriendly: boolean;
  /** 勉強能編成 QR，但實體列印後可能掃不動 */
  qrPossible: boolean;
}

/**
 * 目前這個網站實際的網址。
 *
 * 不能用 `location.origin + import.meta.env.BASE_URL` 硬拼字串：
 * vite.config.ts 為了讓建置產物能放在任何子路徑而把 base 設成相對路徑 `./`，
 * 那個值拿去和 origin 直接相接會變成 `https://example.github.io./` 這種壞掉的網址，
 * 白白遺失 GitHub Pages 專案網站一定會有的 `/repo-name/` 子路徑。
 * 用 URL 建構子讓瀏覽器照 HTML 規則把相對路徑解析回目前這個頁面的真實位置。
 */
export function currentSiteOrigin(): string {
  return new URL(import.meta.env.BASE_URL, location.href).toString().replace(/\/$/, '');
}

/** 產生「資料內嵌在網址 # 之後」的分享連結 */
export async function buildEmbeddedLink(guide: Guide, host?: string): Promise<ShareLink> {
  const payload = await encodePayload(guide);
  const base = (host || currentSiteOrigin()).replace(/\/$/, '');
  const url = `${base}/#/v?d=${payload}`;
  const bytes = new TextEncoder().encode(url).length;
  return {
    url,
    bytes,
    qrFriendly: bytes <= QR_SAFE_LIMIT,
    qrPossible: bytes <= QR_BYTE_LIMIT,
  };
}

/** 產生指向已上架檔案的連結，這是最推薦、也最短的一種 */
export function buildHostedLink(host: string, fileUrl: string): string {
  const base = host.replace(/\/$/, '');
  return `${base}/#/v?f=${encodeURIComponent(fileUrl)}`;
}

/* ------------------------------ 處室密碼 ------------------------------ */

/**
 * 處室檢視的密碼雜湊。
 *
 * 必須誠實說明：這是純前端比對，任何人打開開發者工具都能看到內容。
 * 它的用途是「避免學生誤看到內部註記而混淆」，不是資訊安全機制。
 * 真的機密的東西不要放進引導檔。
 */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPassword(input: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return (await sha256Hex(input)) === hash;
}
