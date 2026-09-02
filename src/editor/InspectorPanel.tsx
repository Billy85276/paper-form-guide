import { LocalizedInput } from '../components/LocalizedInput';
import { Button, Card, Empty, Label, Select, cx } from '../components/ui';
import { ROLE_COLOR, ROLE_HINT, ROLE_LABEL } from '../lib/factory';
import { resolveText } from '../lib/text';
import {
  DEFAULT_HANDWRITING,
  type Audience,
  type Region,
  type RegionRole,
  type RegionShape,
} from '../lib/types';
import type { EditorCtx } from './ctx';

/**
 * 標註屬性面板
 *
 * 這裡的欄位順序刻意照「編輯者腦中的思考順序」排，而不是照資料結構排：
 * 先問這一格是誰要填（決定學生看到的顏色與語氣），
 * 再問要做什麼動作（寫字還是打勾還是劃掉），
 * 最後才是說明文字。因為前兩個決定了後面該怎麼寫。
 */

const SHAPES: { value: RegionShape; label: string }[] = [
  { value: 'rect', label: '方框' },
  { value: 'ellipse', label: '圈選' },
  { value: 'underline', label: '底線' },
  { value: 'checkbox', label: '勾選框' },
  { value: 'arrow', label: '箭頭' },
  { value: 'pin', label: '點' },
];

const ROLES: RegionRole[] = ['fill', 'check', 'strike', 'circle', 'stamp', 'readonly', 'warning'];

const AUDIENCES: { value: Audience; label: string; hint: string }[] = [
  { value: 'student', label: '填表人', hint: '學生自己要填' },
  { value: 'staff', label: '承辦人', hint: '學生不要碰，會標成灰色' },
  { value: 'both', label: '兩者都看', hint: '只是要讓人看懂的資訊' },
];

export function InspectorPanel({ ctx }: { ctx: EditorCtx }) {
  const copy = ctx.guide.copies[ctx.copyIndex];
  const region = copy?.regions.find((r) => r.id === ctx.selectedId);

  if (!region || !copy) {
    return (
      <Empty
        title="還沒選中任何標註"
        body="在左邊的照片上點一個標註來編輯它，或用上方的工具在照片上拖曳畫出新的標註。"
      />
    );
  }

  const patch = (p: Partial<Region>) => {
    ctx.update((g) => ({
      ...g,
      copies: g.copies.map((c) =>
        c.id !== copy.id
          ? c
          : { ...c, regions: c.regions.map((r) => (r.id === region.id ? { ...r, ...p } : r)) },
      ),
    }));
  };

  const patchStyle = (p: Partial<Region['style']>) => patch({ style: { ...region.style, ...p } });

  const remove = () => {
    if (!confirm('刪除這個標註？')) return;
    ctx.update((g) => ({
      ...g,
      copies: g.copies.map((c) =>
        c.id !== copy.id ? c : { ...c, regions: c.regions.filter((r) => r.id !== region.id) },
      ),
    }));
    ctx.setSelectedId(null);
  };

  const color = region.style.color || ROLE_COLOR[region.role];

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {region.step}
          </span>
          <span className="flex-1 truncate text-sm font-medium">
            {resolveText(region.label, ctx.lang) || '未命名標註'}
          </span>
          <Button variant="ghost" size="sm" onClick={remove} aria-label="刪除標註">
            🗑
          </Button>
        </div>

        <Label hint="決定學生看到的顏色與語氣">誰要填這一格</Label>
        <div className="mb-3 grid grid-cols-3 gap-1">
          {AUDIENCES.map((a) => (
            <button
              key={a.value}
              type="button"
              title={a.hint}
              onClick={() => patch({ audience: a.value })}
              className={cx(
                'rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                region.audience === a.value
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>

        <Label hint={ROLE_HINT[region.role]}>要做什麼動作</Label>
        <Select
          value={region.role}
          onChange={(e) => patch({ role: e.target.value as RegionRole })}
          className="mb-3 w-full"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>外形</Label>
            <Select
              value={region.shape}
              onChange={(e) => patch({ shape: e.target.value as RegionShape })}
              className="w-full"
            >
              {SHAPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label hint="逐步精靈的順序">第幾步</Label>
            <input
              type="number"
              min={1}
              value={region.step}
              onChange={(e) => patch({ step: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-3">
        <div>
          <Label hint="標記上的短名稱，四到八個字">標題</Label>
          <LocalizedInput
            value={region.label}
            onChange={(v) => patch({ label: v })}
            lang={ctx.lang}
            languages={ctx.guide.languages}
            placeholder="例如：系別班級"
          />
        </div>

        <div>
          <Label hint="像站在旁邊指著紙教他一樣">完整說明</Label>
          <LocalizedInput
            multiline
            rows={4}
            value={region.instruction}
            onChange={(v) => patch({ instruction: v })}
            lang={ctx.lang}
            languages={ctx.guide.languages}
            placeholder="例如：填系所簡稱就好，格子只有三到四個字的寬度。"
          />
        </div>

        <div>
          <Label hint="讓人直接照抄">正確範例</Label>
          <LocalizedInput
            value={region.example}
            onChange={(v) => patch({ example: v })}
            lang={ctx.lang}
            languages={ctx.guide.languages}
            placeholder="例如：資網系"
          />
        </div>

        <div>
          <Label hint="這一格最多人在哪裡出錯">常見錯誤</Label>
          <LocalizedInput
            multiline
            rows={2}
            value={region.pitfall}
            onChange={(v) => patch({ pitfall: v })}
            lang={ctx.lang}
            languages={ctx.guide.languages}
            placeholder="例如：不要寫全名，格子放不下。"
          />
        </div>
      </Card>

      <Card className="space-y-3 p-3">
        <div>
          <Label hint="連到邏輯欄位後，學生輸入一次就三聯都填好">對應欄位</Label>
          <Select
            value={region.fieldKey ?? ''}
            onChange={(e) => patch({ fieldKey: e.target.value || undefined })}
            className="w-full"
          >
            <option value="">不連結任何欄位</option>
            {ctx.guide.fields.map((f) => (
              <option key={f.key} value={f.key}>
                {resolveText(f.label, ctx.lang) || f.key}
              </option>
            ))}
          </Select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={region.required}
            onChange={(e) => patch({ required: e.target.checked })}
          />
          必填
        </label>

        {ctx.guide.deptViews.length ? (
          <div>
            <Label hint="只有解鎖該處室才看得到這個標註">處室限定</Label>
            <Select
              value={region.deptOnly ?? ''}
              onChange={(e) => patch({ deptOnly: e.target.value || undefined })}
              className="w-full"
            >
              <option value="">所有人都看得到</option>
              {ctx.guide.deptViews.map((d) => (
                <option key={d.id} value={d.id}>
                  {resolveText(d.name, ctx.lang)}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3 p-3">
        <p className="text-sm font-semibold text-slate-600">外觀</p>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>顏色</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => patchStyle({ color: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border border-slate-300"
              />
              <Button variant="ghost" size="sm" onClick={() => patchStyle({ color: undefined })}>
                依動作自動
              </Button>
            </div>
          </div>
          <div>
            <Label>線寬</Label>
            <input
              type="range"
              min={1}
              max={6}
              step={0.5}
              value={region.style.strokeWidth}
              onChange={(e) => patchStyle({ strokeWidth: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>

        <div>
          <Label hint={`${Math.round(region.style.fillOpacity * 100)}%`}>填色濃度</Label>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.02}
            value={region.style.fillOpacity}
            onChange={(e) => patchStyle({ fillOpacity: Number(e.target.value) })}
            className="w-full"
          />
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={region.style.pulse}
              onChange={(e) => patchStyle({ pulse: e.target.checked })}
            />
            呼吸閃爍
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={region.style.dashed}
              onChange={(e) => patchStyle({ dashed: e.target.checked })}
            />
            虛線
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={Boolean(region.style.hideBadge)}
              onChange={(e) => patchStyle({ hideBadge: e.target.checked })}
            />
            隱藏編號
          </label>
        </div>
      </Card>

      {region.fieldKey ? (
        <Card className="space-y-3 p-3">
          <p className="text-sm font-semibold text-slate-600">模擬填寫的手寫外觀</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label hint="相對於圖片寬度">字級</Label>
              <input
                type="range"
                min={1}
                max={6}
                step={0.1}
                value={region.handwriting?.size ?? DEFAULT_HANDWRITING.size}
                onChange={(e) =>
                  patch({
                    handwriting: {
                      ...DEFAULT_HANDWRITING,
                      ...region.handwriting,
                      size: Number(e.target.value),
                    },
                  })
                }
                className="w-full"
              />
            </div>
            <div>
              <Label hint="讓字看起來像人寫的">傾斜角度</Label>
              <input
                type="range"
                min={-6}
                max={6}
                step={0.5}
                value={region.handwriting?.rotate ?? DEFAULT_HANDWRITING.rotate}
                onChange={(e) =>
                  patch({
                    handwriting: {
                      ...DEFAULT_HANDWRITING,
                      ...region.handwriting,
                      rotate: Number(e.target.value),
                    },
                  })
                }
                className="w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>墨水顏色</Label>
              <Select
                value={region.handwriting?.ink ?? DEFAULT_HANDWRITING.ink}
                onChange={(e) =>
                  patch({
                    handwriting: {
                      ...DEFAULT_HANDWRITING,
                      ...region.handwriting,
                      ink: e.target.value as 'blue' | 'black' | 'red',
                    },
                  })
                }
                className="w-full"
              >
                <option value="blue">藍色原子筆</option>
                <option value="black">黑色原子筆</option>
                <option value="red">紅筆</option>
              </Select>
            </div>
            <div>
              <Label>對齊</Label>
              <Select
                value={region.handwriting?.align ?? DEFAULT_HANDWRITING.align}
                onChange={(e) =>
                  patch({
                    handwriting: {
                      ...DEFAULT_HANDWRITING,
                      ...region.handwriting,
                      align: e.target.value as 'left' | 'center' | 'right',
                    },
                  })
                }
                className="w-full"
              >
                <option value="left">靠左</option>
                <option value="center">置中</option>
                <option value="right">靠右</option>
              </Select>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-3">
        <p className="mb-2 text-sm font-semibold text-slate-600">位置與大小</p>
        <div className="grid grid-cols-4 gap-2 text-xs">
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <div key={k}>
              <span className="text-slate-400 uppercase">{k}</span>
              <input
                type="number"
                step={0.1}
                value={Number(region[k].toFixed(1))}
                onChange={(e) => patch({ [k]: Number(e.target.value) } as Partial<Region>)}
                className="w-full rounded-lg border border-slate-300 px-1.5 py-1"
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          單位是相對於這張圖的百分比，所以在手機、桌機、A4 紙上都會落在同一個位置。
        </p>
      </Card>
    </div>
  );
}
