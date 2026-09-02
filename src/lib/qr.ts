import QRCode from 'qrcode';

/**
 * QR 產生
 *
 * 使用 SVG 輸出而不是 canvas，理由有兩個：
 *   1. 列印時 SVG 是向量，印出來邊緣銳利，掃描成功率明顯較高。
 *   2. 匯出 PNG 時 SVG 可以直接內嵌進 DOM 一起截圖，不用另外合成。
 *
 * 錯誤更正等級固定用 M。實體張貼的 QR 會被摸髒、被折到、被貼歪，
 * L 級雖然容量大但容錯太低；Q 與 H 又會讓同樣資料的圖案變得太密。
 */

export async function qrSvg(text: string, size = 160): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: size,
  });
}

export async function qrDataUrl(text: string, size = 512): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: size,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

/** 事先問一句「這串字做得成 QR 嗎」，避免介面上生出一張掃不動的圖 */
export function canEncode(text: string): boolean {
  return new TextEncoder().encode(text).length <= 2953;
}
