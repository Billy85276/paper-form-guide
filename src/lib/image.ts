/**
 * 圖片處理
 *
 * 使用者上傳的多半是手機直接拍的 3~8 MB JPEG。
 * 那個尺寸拿去內嵌單檔 HTML 或塞進分享連結會爆掉，
 * 所以一律在瀏覽器端先降到「看得清楚格線與印刷字」的最低成本。
 *
 * 1600 px 長邊 + WebP q0.82 對一張 A4 表單來說，通常落在 150~350 KB，
 * 放大到 300% 仍看得清楚欄位名稱，是實測下來的甜蜜點。
 */

export interface ProcessedImage {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

const MAX_EDGE = 1600;

function canEncodeWebp(): boolean {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  return c.toDataURL('image/webp').startsWith('data:image/webp');
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('圖片讀取失敗'));
    img.src = src;
  });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('圖片編碼失敗'));
    fr.readAsDataURL(blob);
  });
}

/** 壓縮上傳的圖片。maxEdge 可調，列印用可以拉到 2400。 */
export async function processUpload(
  file: File | Blob,
  maxEdge = MAX_EDGE,
  quality = 0.82,
): Promise<ProcessedImage> {
  const srcUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(srcUrl);
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('瀏覽器不支援 canvas');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    const type = canEncodeWebp() ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('圖片壓縮失敗'))),
        type,
        quality,
      );
    });
    const dataUrl = await blobToDataUrl(blob);
    return { blob, dataUrl, width: w, height: h, bytes: blob.size };
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}

/**
 * 給 AI 看的縮圖。
 * 視覺模型不需要 1600 px，1024 已足夠辨識表格線與欄位，
 * 而且直接省掉一半以上的 token 成本與延遲。
 */
export async function toAiJpeg(src: string, maxEdge = 1024): Promise<{ base64: string; mime: string }> {
  const img = await loadImageElement(src);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('瀏覽器不支援 canvas');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { base64: dataUrl.split(',')[1] ?? '', mime: 'image/jpeg' };
}

/**
 * 依比例裁切。複寫單常常是一張照片上有兩三聯，
 * 裁成獨立的聯之後，每一聯的標註座標才能各自獨立，
 * 學生也才能一次只看自己現在要填的那一聯。
 * rect 的四個值都是 0~1 的比例。
 */
export async function cropImage(
  src: string,
  rect: { x: number; y: number; w: number; h: number },
  quality = 0.85,
): Promise<ProcessedImage> {
  const img = await loadImageElement(src);
  const sx = Math.round(rect.x * img.naturalWidth);
  const sy = Math.round(rect.y * img.naturalHeight);
  const sw = Math.round(rect.w * img.naturalWidth);
  const sh = Math.round(rect.h * img.naturalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('瀏覽器不支援 canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const type = canEncodeWebp() ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('裁切失敗'))), type, quality);
  });
  const dataUrl = await blobToDataUrl(blob);
  return { blob, dataUrl, width: sw, height: sh, bytes: blob.size };
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
