import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { ROLE_COLOR, ROLE_HINT, flatRegions } from './factory';
import { loadImageElement } from './image';
import { qrDataUrl } from './qr';
import { toPortableGuide } from './storage';
import { resolveText } from './text';
import type { Copy, Guide, LangCode, Region } from './types';

/**
 * 匯出
 *
 * 全部改用 Canvas 2D 自己畫，而不是把畫面截圖。
 * 原因是這些標註的形狀本來就是我們自己定義的，
 * 自己畫可以精準控制輸出解析度、不會受到網頁字型還沒載入或跨來源圖片的影響，
 * 而且同一套繪圖程式可以同時餵給 PNG 與 PDF，兩邊長得一模一樣。
 *
 * PDF 有兩條路：
 *   主要路徑是瀏覽器原生列印。中文字在那裡是真正的向量文字，
 *   由作業系統的字型排版，不需要內嵌任何字型檔，印出來最清楚。
 *   備援路徑是 pdf-lib 把畫好的圖組成 A4，用在需要直接拿到檔案的場合，
 *   例如要傳到 LINE。這條路刻意完全不呼叫 embedFont，
 *   因為 pdf-lib 的中文字型子集化有已知且未修的缺字問題。
 */

const INK = { blue: '#1a3c8a', black: '#111827', red: '#b91c1c' };

/* ------------------------------------------------------------------ */
/* 文字排版工具                                                        */
/* ------------------------------------------------------------------ */

const UI_FONT =
  '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Hiragino Sans", system-ui, sans-serif';

/** 逐字量測換行。中文沒有空白可以斷，所以不能用 split(space)。 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = wrapText(ctx, text, maxWidth);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

/** 手寫模擬值的概略換行，跟畫面上即時預覽用同一套字元數估算，不需要逐字量測 */
function wrapHandLine(text: string, approxCharsPerLine: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    line += ch;
    if (line.length >= approxCharsPerLine) {
      lines.push(line);
      line = '';
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* 標註繪製                                                            */
/* ------------------------------------------------------------------ */

export interface DrawOptions {
  lang: LangCode;
  /** 模擬填寫模式時要畫上去的值 */
  values?: Record<string, string>;
  simulate?: boolean;
  /** 只畫這些標註，用來做單一步驟的特寫圖 */
  onlyRegionIds?: string[];
  /** 畫出編號圓圈 */
  showBadges?: boolean;
  /** 隱藏承辦人負責的區塊 */
  hideStaff?: boolean;
}

function regionColor(region: Region): string {
  return region.style.color || ROLE_COLOR[region.role];
}

function drawRegion(
  ctx: CanvasRenderingContext2D,
  region: Region,
  W: number,
  H: number,
  opts: DrawOptions,
) {
  const x = (region.x / 100) * W;
  const y = (region.y / 100) * H;
  const w = (region.w / 100) * W;
  const h = (region.h / 100) * H;
  const color = regionColor(region);
  const lw = Math.max(1.5, (region.style.strokeWidth / 100) * W * 0.5);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.fillStyle = color;
  ctx.globalAlpha = region.style.fillOpacity;
  if (region.style.dashed) ctx.setLineDash([lw * 3, lw * 2]);

  switch (region.shape) {
    case 'ellipse': {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      break;
    }
    case 'underline': {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.stroke();
      break;
    }
    case 'arrow': {
      ctx.globalAlpha = 1;
      const tx = ((region.tail?.x ?? region.x - 8) / 100) * W;
      const ty = ((region.tail?.y ?? region.y - 8) / 100) * H;
      const hx = x + w / 2;
      const hy = y + h / 2;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      const ang = Math.atan2(hy - ty, hx - tx);
      const head = lw * 5;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - head * Math.cos(ang - 0.4), hy - head * Math.sin(ang - 0.4));
      ctx.lineTo(hx - head * Math.cos(ang + 0.4), hy - head * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'pin': {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, lw * 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      roundRect(ctx, x, y, w, h, lw * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    }
  }
  ctx.restore();

  // 編號圓圈。有拖出去（badgePos）就畫在拖出去的地方，並補一條指示線，
  // 跟編輯畫面裡看到的位置一致，匯出的圖才不會跟畫面對不起來。
  if (opts.showBadges !== false && !region.style.hideBadge && region.shape !== 'pin') {
    const rBadge = Math.max(10, W * 0.016);
    let bx = x - rBadge * 0.2;
    let by = y - rBadge * 0.2;

    if (region.badgePos) {
      bx = (region.badgePos.x / 100) * W;
      by = (region.badgePos.y / 100) * H;
      const anchorX = Math.min(Math.max(bx, x), x + w);
      const anchorY = Math.min(Math.max(by, y), y + h);
      const pulled = Math.hypot(bx - anchorX, by - anchorY) > rBadge * 1.2;
      if (pulled) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, rBadge * 0.12);
        ctx.setLineDash([rBadge * 0.5, rBadge * 0.4]);
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(anchorX, anchorY);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(bx, by, rBadge, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${rBadge * 1.15}px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(region.step), bx, by + rBadge * 0.05);
    ctx.restore();
  }

  // 模擬填寫的手寫字。跟畫面上的即時預覽用同一套邏輯：
  // 長字串換行、字後面墊一層淡淡的白底，才不會跟底下印刷的表格線、文字糊在一起。
  if (opts.simulate && region.fieldKey && opts.values?.[region.fieldKey]) {
    const value = opts.values[region.fieldKey];
    const spec = region.handwriting;
    const size = ((spec?.size ?? 2.2) / 100) * W;
    const align = spec?.align ?? 'left';
    ctx.save();
    ctx.font = `500 ${size}px "Iansui", "LXGW WenKai TC", "Klee One", "Noto Sans TC", cursive`;
    const approxChars = Math.max(4, Math.round((region.w / 2.6) * 1));
    const lines = wrapHandLine(value, approxChars);
    const lineHeight = size * 1.18;
    const blockH = lines.length * lineHeight;

    const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w - size * 0.25 : x + size * 0.25;
    const ty = y + h / 2 - blockH / 2 + lineHeight / 2;

    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    // 淡白底墊在文字後面
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#ffffff';
    const padX = size * 0.3;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    const boxW = widest + padX * 2;
    const boxX = align === 'center' ? tx - boxW / 2 : align === 'right' ? tx - boxW + padX : tx - padX;
    roundRect(ctx, boxX, ty - lineHeight / 2 - size * 0.15, boxW, blockH + size * 0.3, size * 0.2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = INK[spec?.ink ?? 'blue'];
    lines.forEach((line, i) => {
      ctx.save();
      ctx.translate(tx, ty + i * lineHeight);
      ctx.rotate(((spec?.rotate ?? -1) * Math.PI) / 180);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    ctx.restore();
  }

  // 模擬打勾
  if (opts.simulate && region.role === 'check' && !region.fieldKey) {
    ctx.save();
    ctx.strokeStyle = INK.blue;
    ctx.lineWidth = lw * 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.15, y + h * 0.5);
    ctx.lineTo(x + w * 0.38, y + h * 0.78);
    ctx.lineTo(x + w * 0.85, y + h * 0.2);
    ctx.stroke();
    ctx.restore();
  }

  // 模擬劃線刪除
  if (opts.simulate && region.role === 'strike') {
    ctx.save();
    ctx.strokeStyle = INK.red;
    ctx.lineWidth = lw * 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.04, y + h * 0.9);
    ctx.lineTo(x + w * 0.96, y + h * 0.08);
    ctx.stroke();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* 單一聯的完整圖                                                      */
/* ------------------------------------------------------------------ */

export async function renderCopyCanvas(
  guide: Guide,
  copy: Copy,
  opts: DrawOptions,
  targetWidth = 1600,
): Promise<HTMLCanvasElement> {
  const asset = guide.assets[copy.assetId];
  if (!asset?.src) throw new Error('這一聯還沒有底圖');
  const img = await loadImageElement(asset.src);

  const W = targetWidth;
  const H = Math.round((img.naturalHeight / img.naturalWidth) * W);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('瀏覽器不支援 canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, W, H);

  const visible = copy.regions
    .filter((r) => (opts.onlyRegionIds ? opts.onlyRegionIds.includes(r.id) : true))
    .filter((r) => (opts.hideStaff ? r.audience !== 'staff' : true))
    .filter((r) => !r.deptOnly);

  for (const region of visible) drawRegion(ctx, region, W, H, opts);
  if (opts.simulate) drawSampleWatermark(ctx, W, H);
  return canvas;
}

/**
 * 模擬填寫的浮水印
 *
 * 這一段不是裝飾，是安全機制。模擬完成的圖一旦存進手機相簿，
 * 在像素上就和一張真的填好的表單照片沒有差別，
 * 它會被轉傳、被拿去給承辦人看、甚至被當成已繳費的證明。
 * 所以文字直接燒進畫素，不是可以關掉的圖層。
 */
function drawSampleWatermark(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.atan2(H, W));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${W * 0.085}px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(220, 38, 38, 0.16)';
  ctx.fillText('模擬示範 SAMPLE', 0, 0);
  ctx.font = `500 ${W * 0.028}px ${UI_FONT}`;
  ctx.fillText('此為填寫示範，不是有效單據', 0, W * 0.075);
  ctx.restore();
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('產生圖片失敗'))), type, 0.95);
  });
}

/* ------------------------------------------------------------------ */
/* 逐步特寫卡                                                          */
/* ------------------------------------------------------------------ */

/**
 * 每一個步驟做一張獨立的圖：上方是放大到該欄位附近的照片，
 * 下方是這一步要做什麼。學生存在手機相簿裡，站在櫃檯前一張一張滑就能填完。
 */
export async function renderStepCard(
  guide: Guide,
  copy: Copy,
  region: Region,
  lang: LangCode,
  width = 1080,
): Promise<HTMLCanvasElement> {
  const asset = guide.assets[copy.assetId];
  const img = await loadImageElement(asset.src);

  // 以標註為中心往外留一點脈絡，讓學生認得出這是紙上的哪個位置
  const padX = Math.max(region.w * 1.1, 16);
  const padY = Math.max(region.h * 1.6, 10);
  const sx0 = Math.max(0, region.x - padX);
  const sy0 = Math.max(0, region.y - padY);
  const sx1 = Math.min(100, region.x + region.w + padX);
  const sy1 = Math.min(100, region.y + region.h + padY);

  const sx = (sx0 / 100) * img.naturalWidth;
  const sy = (sy0 / 100) * img.naturalHeight;
  const sw = ((sx1 - sx0) / 100) * img.naturalWidth;
  const sh = ((sy1 - sy0) / 100) * img.naturalHeight;

  const photoH = Math.round((sh / sw) * width);
  const pad = Math.round(width * 0.045);

  // 先用一個暫時的 context 量測文字高度，才知道整張卡要多高
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('瀏覽器不支援 canvas');
  const bodyFont = `400 ${Math.round(width * 0.032)}px ${UI_FONT}`;
  const titleFont = `700 ${Math.round(width * 0.045)}px ${UI_FONT}`;
  const maxTextW = width - pad * 2;

  const instruction = resolveText(region.instruction, lang);
  const example = resolveText(region.example, lang);
  const pitfall = resolveText(region.pitfall, lang);

  probe.font = bodyFont;
  const lineH = Math.round(width * 0.048);
  let textH = Math.round(width * 0.09); // 標題列
  textH += wrapText(probe, instruction, maxTextW).length * lineH;
  if (example) textH += wrapText(probe, `正確範例：${example}`, maxTextW).length * lineH + lineH * 0.3;
  if (pitfall) textH += wrapText(probe, `常見錯誤：${pitfall}`, maxTextW).length * lineH + lineH * 0.3;
  textH += pad;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = photoH + textH + pad;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('瀏覽器不支援 canvas');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, photoH);

  // 在放大圖裡重畫這一格的框，座標要換算成裁切後的相對位置
  const local: Region = {
    ...region,
    x: ((region.x - sx0) / (sx1 - sx0)) * 100,
    y: ((region.y - sy0) / (sy1 - sy0)) * 100,
    w: (region.w / (sx1 - sx0)) * 100,
    h: (region.h / (sy1 - sy0)) * 100,
  };
  drawRegion(ctx, local, width, photoH, { lang, showBadges: true });

  let y = photoH + pad + Math.round(width * 0.05);
  const color = regionColor(region);

  ctx.fillStyle = color;
  ctx.font = titleFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const head = `${region.step}. ${resolveText(region.label, lang)}`;
  ctx.fillText(head, pad, y);

  // 右上角標示這格是誰要填
  ctx.font = `500 ${Math.round(width * 0.028)}px ${UI_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = region.audience === 'staff' ? '#64748b' : color;
  ctx.fillText(
    region.audience === 'staff' ? '承辦人填，你不要動' : ROLE_HINT[region.role],
    width - pad,
    y,
  );
  ctx.textAlign = 'left';

  y += Math.round(width * 0.045);
  ctx.fillStyle = '#1f2937';
  ctx.font = bodyFont;
  y = drawWrapped(ctx, instruction, pad, y, maxTextW, lineH);

  if (example) {
    y += lineH * 0.35;
    ctx.fillStyle = '#047857';
    y = drawWrapped(ctx, `正確範例：${example}`, pad, y, maxTextW, lineH);
  }
  if (pitfall) {
    y += lineH * 0.35;
    ctx.fillStyle = '#b91c1c';
    y = drawWrapped(ctx, `常見錯誤：${pitfall}`, pad, y, maxTextW, lineH);
  }
  return canvas;
}

/* ------------------------------------------------------------------ */
/* 對外匯出函式                                                        */
/* ------------------------------------------------------------------ */

export interface ExportedFile {
  name: string;
  blob: Blob;
}

export async function exportCopyPngs(
  guide: Guide,
  lang: LangCode,
  opts: { simulate?: boolean; values?: Record<string, string>; scale?: number } = {},
): Promise<ExportedFile[]> {
  const out: ExportedFile[] = [];
  for (const [i, copy] of guide.copies.entries()) {
    const canvas = await renderCopyCanvas(
      guide,
      copy,
      { lang, simulate: opts.simulate, values: opts.values, showBadges: true },
      1600 * (opts.scale ?? 1.5),
    );
    const name = `${String(i + 1).padStart(2, '0')}-${resolveText(copy.name, lang) || 'copy'}.png`;
    out.push({ name, blob: await canvasToBlob(canvas) });
  }
  return out;
}

export async function exportStepPngs(guide: Guide, lang: LangCode): Promise<ExportedFile[]> {
  const out: ExportedFile[] = [];
  for (const { region, copy } of flatRegions(guide)) {
    if (region.deptOnly) continue;
    const canvas = await renderStepCard(guide, copy, region, lang, 1080);
    const label = resolveText(region.label, lang).replace(/[\\/:*?"<>|]/g, '') || 'step';
    out.push({
      name: `step-${String(region.step).padStart(2, '0')}-${label}.png`,
      blob: await canvasToBlob(canvas),
    });
  }
  return out;
}

/** 主要 PDF 路徑：交給瀏覽器列印，中文字是真正的向量文字 */
export async function printGuide(): Promise<void> {
  await document.fonts.ready;
  await new Promise(requestAnimationFrame);
  window.print();
}

/** 備援 PDF 路徑：直接組出檔案，不需要使用者按列印對話框 */
export async function buildPdfBlob(files: ExportedFile[]): Promise<Blob> {
  const A4 = { w: 595.28, h: 841.89 };
  const doc = await PDFDocument.create();
  for (const f of files) {
    const img = await doc.embedPng(await f.blob.arrayBuffer());
    const page = doc.addPage([A4.w, A4.h]);
    const m = 28;
    const s = Math.min((A4.w - 2 * m) / img.width, (A4.h - 2 * m) / img.height);
    page.drawImage(img, {
      x: (A4.w - img.width * s) / 2,
      y: (A4.h - img.height * s) / 2,
      width: img.width * s,
      height: img.height * s,
    });
  }
  const bytes = await doc.save();
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 完整封存：引導檔 JSON、每一聯的圖、每一步的特寫卡 */
export async function exportZip(guide: Guide, lang: LangCode, shareUrl?: string): Promise<Blob> {
  const zip = new JSZip();
  // 匯出的 JSON 必須是別台電腦也打得開的版本，圖片要內嵌而不是 blob: 網址
  zip.file('guide.json', JSON.stringify(await toPortableGuide(guide), null, 2));

  const copies = zip.folder('copies');
  for (const f of await exportCopyPngs(guide, lang)) copies?.file(f.name, f.blob);

  const steps = zip.folder('steps');
  for (const f of await exportStepPngs(guide, lang)) steps?.file(f.name, f.blob);

  if (shareUrl) {
    const dataUrl = await qrDataUrl(shareUrl, 800);
    const bin = await (await fetch(dataUrl)).blob();
    zip.file('qr.png', bin);
    zip.file('share-url.txt', shareUrl);
  }

  zip.file(
    'README.txt',
    [
      '這個壓縮檔由「實體表單引導」產生。',
      '',
      'guide.json  完整引導檔，可以在系統裡用「匯入」還原成可編輯的版本。',
      'copies/     每一聯的完整標註圖。',
      'steps/      每一步的特寫卡，可以直接存到手機相簿一張一張看。',
      'qr.png      分享用的 QR 碼（若有產生）。',
      '',
      '提醒：清除瀏覽器資料會讓系統裡的引導檔消失，這個壓縮檔就是你的備份。',
    ].join('\n'),
  );
  return zip.generateAsync({ type: 'blob' });
}

/* ------------------------------------------------------------------ */
/* 單檔離線 HTML                                                       */
/* ------------------------------------------------------------------ */

/**
 * 把目前這個網頁應用程式連同引導資料一起打包成一個 .html。
 *
 * 做法是抓取目前頁面自己載入的那支 JS 與 CSS，內嵌進一份新的 HTML，
 * 再把引導檔以 JSON 塞進去。開啟時應用程式會先找這塊 JSON，找到就直接用。
 *
 * 這是整個離線策略裡最硬的一層：沒有網路、沒有主機、沒有網域，
 * 只要一個瀏覽器就能打開，放隨身碟或用 LINE 傳都行。
 */
export async function buildSingleFileHtml(rawGuide: Guide): Promise<Blob> {
  const guide = await toPortableGuide(rawGuide);
  const scripts = Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'),
  );
  const styles = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'),
  );

  if (!scripts.length) {
    throw new Error('開發模式下無法產生離線版，請在正式部署的網站上使用這個功能');
  }

  const js: string[] = [];
  for (const s of scripts) js.push(await (await fetch(s.src)).text());
  const css: string[] = [];
  for (const l of styles) {
    if (l.href.includes('fonts.googleapis.com')) continue;
    css.push(await (await fetch(l.href)).text());
  }

  const title = resolveText(guide.title, guide.defaultLang) || '表單填寫引導';
  const html = [
    '<!doctype html>',
    '<html lang="zh-Hant">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${escapeHtml(title)}</title>`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Iansui&family=Noto+Sans+TC:wght@400;500;700&display=swap">',
    `<style>${css.join('\n')}</style>`,
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<script id="fgs-embedded-guide" type="application/json">${JSON.stringify(guide).replace(/</g, '\\u003c')}</script>`,
    `<script type="module">${js.join('\n;\n')}</script>`,
    '</body>',
    '</html>',
  ].join('\n');

  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** 開機時檢查有沒有內嵌的引導檔（單檔離線版會有） */
export function readEmbeddedGuide(): Guide | null {
  const el = document.getElementById('fgs-embedded-guide');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as Guide;
  } catch {
    return null;
  }
}
