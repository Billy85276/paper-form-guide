import { useCallback, useMemo, useRef, useState } from 'react';
import { ROLE_COLOR } from '../lib/factory';
import { resolveText } from '../lib/text';
import type { Copy, Guide, LangCode, Region, RegionShape } from '../lib/types';
import { cx } from './ui';

/**
 * 表單畫布
 *
 * 這是整套系統唯一一個「把標註畫到照片上」的地方，學生檢視與編輯臺共用它。
 * 共用的理由很實際：編輯者拖出來的框，跟學生看到的框，必須是同一段程式畫的，
 * 不然編輯時對得好好的位置，學生打開就跑掉了。
 *
 * 座標一律是百分比，容器用 aspect-ratio 鎖住比例，
 * 所以不論在 iPhone SE 還是 27 吋螢幕還是 A4 紙上，標註都落在同一個位置。
 */

export interface FocusRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FormCanvasProps {
  guide: Guide;
  copy: Copy;
  lang: LangCode;
  activeRegionId?: string | null;
  /** 逐步精靈模式：非當前標註淡出 */
  dimOthers?: boolean;
  onSelect?: (id: string | null) => void;
  /** 編輯模式：可拖曳、可縮放、可框選新增 */
  editable?: boolean;
  onChangeRegions?: (regions: Region[]) => void;
  /** 設定後，在空白處拖曳會畫出新的標註 */
  drawShape?: RegionShape | null;
  onDrawEnd?: (rect: FocusRect) => void;
  simulate?: boolean;
  values?: Record<string, string>;
  /** 已解鎖的處室檢視 id */
  unlockedDepts?: string[];
  /** 承辦人負責的區塊要不要顯示 */
  showStaff?: boolean;
  /** 放大聚焦到某個區域 */
  focus?: FocusRect | null;
  showBadges?: boolean;
  className?: string;
}

const INK_CLASS = { blue: 'text-[#1a3c8a]', black: 'text-slate-900', red: 'text-red-700' };

type DragState =
  | { kind: 'move'; id: string; startX: number; startY: number; orig: Region }
  | { kind: 'resize'; id: string; corner: string; startX: number; startY: number; orig: Region }
  | { kind: 'draw'; startX: number; startY: number; cur: FocusRect }
  | null;

export function FormCanvas(props: FormCanvasProps) {
  const {
    guide,
    copy,
    lang,
    activeRegionId,
    dimOthers,
    onSelect,
    editable,
    onChangeRegions,
    drawShape,
    onDrawEnd,
    simulate,
    values,
    unlockedDepts = [],
    showStaff = true,
    focus,
    showBadges = true,
    className,
  } = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState>(null);

  const asset = guide.assets[copy.assetId];
  const ratio = asset && asset.width > 0 ? asset.width / asset.height : 4 / 3;

  const visible = useMemo(
    () =>
      copy.regions
        .filter((r) => !r.deptOnly || unlockedDepts.includes(r.deptOnly))
        .filter((r) => showStaff || r.audience !== 'staff'),
    [copy.regions, unlockedDepts, showStaff],
  );

  /** 把滑鼠或手指的位置換算成百分比座標 */
  const toPct = useCallback((clientX: number, clientY: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return {
      x: ((clientX - box.left) / box.width) * 100,
      y: ((clientY - box.top) / box.height) * 100,
    };
  }, []);

  const commit = useCallback(
    (next: Region) => {
      onChangeRegions?.(copy.regions.map((r) => (r.id === next.id ? next : r)));
    },
    [copy.regions, onChangeRegions],
  );

  const onPointerDownCanvas = (e: React.PointerEvent) => {
    if (!editable || !drawShape) {
      if (e.target === e.currentTarget) onSelect?.(null);
      return;
    }
    const p = toPct(e.clientX, e.clientY);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: 'draw', startX: p.x, startY: p.y, cur: { x: p.x, y: p.y, w: 0, h: 0 } });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toPct(e.clientX, e.clientY);

    if (drag.kind === 'draw') {
      setDrag({
        ...drag,
        cur: {
          x: Math.min(drag.startX, p.x),
          y: Math.min(drag.startY, p.y),
          w: Math.abs(p.x - drag.startX),
          h: Math.abs(p.y - drag.startY),
        },
      });
      return;
    }

    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;

    if (drag.kind === 'move') {
      commit({
        ...drag.orig,
        x: clamp(drag.orig.x + dx, 0, 100 - drag.orig.w),
        y: clamp(drag.orig.y + dy, 0, 100 - drag.orig.h),
      });
      return;
    }

    const o = drag.orig;
    let { x, y, w, h } = o;
    if (drag.corner.includes('e')) w = clamp(o.w + dx, 0.6, 100 - o.x);
    if (drag.corner.includes('s')) h = clamp(o.h + dy, 0.6, 100 - o.y);
    if (drag.corner.includes('w')) {
      x = clamp(o.x + dx, 0, o.x + o.w - 0.6);
      w = o.w + (o.x - x);
    }
    if (drag.corner.includes('n')) {
      y = clamp(o.y + dy, 0, o.y + o.h - 0.6);
      h = o.h + (o.y - y);
    }
    commit({ ...o, x, y, w, h });
  };

  const onPointerUp = () => {
    if (drag?.kind === 'draw') {
      const { cur } = drag;
      if (cur.w > 0.8 && cur.h > 0.8) onDrawEnd?.(cur);
    }
    setDrag(null);
  };

  // 聚焦某一格時，把整張圖放大並平移，讓那一格落在畫面中央
  const focusStyle = useMemo(() => {
    if (!focus) return undefined;
    const pad = 1.9;
    const scale = Math.min(4, Math.max(1, 100 / Math.max(focus.w * pad, focus.h * pad * 1.4)));
    const cxp = focus.x + focus.w / 2;
    const cyp = focus.y + focus.h / 2;
    return {
      transform: `scale(${scale}) translate(${(50 - cxp) / scale}%, ${(50 - cyp) / scale}%)`,
      transformOrigin: '50% 50%',
      transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
    } as React.CSSProperties;
  }, [focus]);

  return (
    <div className={cx('relative w-full overflow-hidden rounded-xl bg-white', className)}>
      <div style={focusStyle} className="relative">
        <div
          ref={wrapRef}
          className={cx(
            'relative w-full select-none',
            editable && drawShape ? 'cursor-crosshair' : '',
          )}
          style={{ aspectRatio: String(ratio), containerType: 'inline-size' }}
          onPointerDown={onPointerDownCanvas}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {asset?.src ? (
            <img
              src={asset.src}
              alt={resolveText(copy.name, lang)}
              draggable={false}
              className="pointer-events-none absolute inset-0 size-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-slate-100 text-sm text-slate-400">
              這一聯還沒有底圖
            </div>
          )}

          {visible.map((region) => (
            <RegionView
              key={region.id}
              region={region}
              lang={lang}
              active={region.id === activeRegionId}
              dimmed={Boolean(dimOthers && activeRegionId && region.id !== activeRegionId)}
              editable={editable}
              showBadge={showBadges}
              simulate={simulate}
              value={region.fieldKey ? values?.[region.fieldKey] : undefined}
              onSelect={() => onSelect?.(region.id)}
              onStartMove={(e) => {
                if (!editable) return;
                e.stopPropagation();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                const p = toPct(e.clientX, e.clientY);
                onSelect?.(region.id);
                setDrag({ kind: 'move', id: region.id, startX: p.x, startY: p.y, orig: region });
              }}
              onStartResize={(e, corner) => {
                if (!editable) return;
                e.stopPropagation();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                const p = toPct(e.clientX, e.clientY);
                setDrag({ kind: 'resize', id: region.id, corner, startX: p.x, startY: p.y, orig: region });
              }}
            />
          ))}

          {/* 模擬填寫時一律蓋上浮水印。這張圖看起來太像真的填好的表單，
              沒有這行字它會被轉傳、被誤當成有效單據。 */}
          {simulate ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden"
            >
              <span
                className="font-bold whitespace-nowrap text-red-600/15"
                style={{ fontSize: '9cqw', transform: 'rotate(-24deg)' }}
              >
                模擬示範 SAMPLE
              </span>
            </div>
          ) : null}

          {drag?.kind === 'draw' && drag.cur.w > 0 ? (
            <div
              className="pointer-events-none absolute rounded border-2 border-dashed border-blue-500 bg-blue-500/10"
              style={pctStyle(drag.cur)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function pctStyle(r: { x: number; y: number; w: number; h: number }): React.CSSProperties {
  return { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` };
}

const HANDLES = ['nw', 'ne', 'sw', 'se'] as const;

function RegionView({
  region,
  lang,
  active,
  dimmed,
  editable,
  showBadge,
  simulate,
  value,
  onSelect,
  onStartMove,
  onStartResize,
}: {
  region: Region;
  lang: LangCode;
  active: boolean;
  dimmed: boolean;
  editable?: boolean;
  showBadge: boolean;
  simulate?: boolean;
  value?: string;
  onSelect: () => void;
  onStartMove: (e: React.PointerEvent) => void;
  onStartResize: (e: React.PointerEvent, corner: string) => void;
}) {
  const color = region.style.color || ROLE_COLOR[region.role];
  const isStaff = region.audience === 'staff';

  const shapeClass = (() => {
    switch (region.shape) {
      case 'ellipse':
        return 'rounded-full';
      case 'underline':
        return 'rounded-none border-x-0 border-t-0';
      case 'pin':
        return 'rounded-full';
      default:
        return 'rounded-md';
    }
  })();

  const base: React.CSSProperties = {
    ...pctStyle(region),
    color,
    borderColor: color,
    borderWidth: `${region.style.strokeWidth}px`,
    borderStyle: region.style.dashed || isStaff ? 'dashed' : 'solid',
    backgroundColor: `color-mix(in srgb, ${color} ${Math.round(region.style.fillOpacity * 100)}%, transparent)`,
    // 呼吸動畫要知道自己該用什麼顏色
    ['--marker' as string]: color,
  };

  if (region.shape === 'arrow') {
    return (
      <ArrowRegion region={region} color={color} active={active} dimmed={dimmed} onSelect={onSelect} />
    );
  }

  return (
    <div
      role={editable ? undefined : 'button'}
      tabIndex={editable ? -1 : 0}
      aria-label={resolveText(region.label, lang)}
      onClick={editable ? undefined : onSelect}
      onKeyDown={(e) => {
        if (!editable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect();
        }
      }}
      onPointerDown={editable ? onStartMove : undefined}
      className={cx(
        'absolute box-border transition-opacity',
        shapeClass,
        region.style.pulse && !dimmed ? 'fgs-pulse' : '',
        active ? 'fgs-active' : '',
        dimmed ? 'fgs-dimmed' : '',
        editable ? 'cursor-move' : 'cursor-pointer',
      )}
      style={base}
    >
      {showBadge && !region.style.hideBadge ? (
        <span
          className="pointer-events-none absolute -top-2.5 -left-2.5 grid size-5 place-items-center rounded-full text-[10px] font-bold text-white shadow sm:size-6 sm:text-xs"
          style={{ backgroundColor: color }}
        >
          {region.step}
        </span>
      ) : null}

      {simulate && value ? (
        <span
          className={cx(
            'fgs-hand absolute inset-0 flex items-center px-[2%]',
            INK_CLASS[region.handwriting?.ink ?? 'blue'],
            region.handwriting?.align === 'center'
              ? 'justify-center'
              : region.handwriting?.align === 'right'
                ? 'justify-end'
                : 'justify-start',
          )}
          style={{
            fontSize: `${(region.handwriting?.size ?? 2.2) * 0.9}cqw`,
            transform: `rotate(${region.handwriting?.rotate ?? -1}deg)`,
          }}
        >
          {value}
        </span>
      ) : null}

      {simulate && region.role === 'check' && !region.fieldKey ? (
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full">
          <polyline
            points="18,52 38,76 84,20"
            fill="none"
            stroke="#1a3c8a"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}

      {simulate && region.role === 'strike' ? (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <line x1="3" y1="94" x2="97" y2="6" stroke="#b91c1c" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      ) : null}

      {editable
        ? HANDLES.map((c) => (
            <span
              key={c}
              onPointerDown={(e) => onStartResize(e, c)}
              className={cx(
                'absolute size-3 rounded-full border-2 border-white bg-slate-800 shadow',
                c === 'nw' && '-top-1.5 -left-1.5 cursor-nwse-resize',
                c === 'ne' && '-top-1.5 -right-1.5 cursor-nesw-resize',
                c === 'sw' && '-bottom-1.5 -left-1.5 cursor-nesw-resize',
                c === 'se' && '-right-1.5 -bottom-1.5 cursor-nwse-resize',
              )}
            />
          ))
        : null}
    </div>
  );
}

/** 箭頭是唯一一個不是矩形的標註，用 SVG 畫在整張圖的座標系上 */
function ArrowRegion({
  region,
  color,
  active,
  dimmed,
  onSelect,
}: {
  region: Region;
  color: string;
  active: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  const hx = region.x + region.w / 2;
  const hy = region.y + region.h / 2;
  const tx = region.tail?.x ?? Math.max(1, region.x - 10);
  const ty = region.tail?.y ?? Math.max(1, region.y - 10);
  const id = `arrow-${region.id}`;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      onClick={onSelect}
      className={cx(
        'absolute inset-0 size-full cursor-pointer',
        active ? 'drop-shadow' : '',
        dimmed ? 'fgs-dimmed' : '',
      )}
      style={{ color }}
    >
      <defs>
        <marker id={id} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 z" fill={color} />
        </marker>
      </defs>
      <line
        x1={tx}
        y1={ty}
        x2={hx}
        y2={hy}
        stroke={color}
        strokeWidth={region.style.strokeWidth * 0.35}
        markerEnd={`url(#${id})`}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
