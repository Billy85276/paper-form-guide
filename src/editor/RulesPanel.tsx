import { nanoid } from 'nanoid';
import { useMemo, useState } from 'react';
import { LocalizedInput } from '../components/LocalizedInput';
import { Button, Card, Empty, Label, Select, TextArea, TextInput, cx } from '../components/ui';
import { safeRegExp, testRules } from '../lib/rules';
import { resolveText } from '../lib/text';
import type { DeriveAssign, IdPattern, LookupTable } from '../lib/types';
import type { EditorCtx } from './ctx';

/**
 * 學號規則引擎
 *
 * 這是整套系統裡唯一一個會「很有自信地給出錯答案」的功能，
 * 所以介面的設計重點不是讓人快速設定完，而是讓人隨時看得到自己設錯了什麼。
 *
 * 三個刻意的取捨：
 * 1. 正規表達式即時驗證並顯示捕獲群組數量。設錯的表達式在學生端是靜默失效，
 *    在這裡至少要當場看得見。
 * 2. 測試區永遠展開，而且預設就帶一組範例學號。設規則的人不會自己想到要測。
 * 3. 面板頂端直接警告哪些東西不適合推導。教室與班級每學期會變，
 *    推導錯了學生會白跑一趟，而「標了警語的錯誤資訊」仍然是錯誤資訊。
 */

export function RulesPanel({ ctx }: { ctx: EditorCtx }) {
  const g = ctx.guide;
  const [samples, setSamples] = useState('D1105123456\nF1123456789\nX999');

  const results = useMemo(
    () => testRules(g, samples.split('\n'), ctx.lang),
    [g, samples, ctx.lang],
  );

  const patchRules = (fn: (r: typeof g.rules) => typeof g.rules) => {
    ctx.update((prev) => ({ ...prev, rules: fn(prev.rules) }));
  };

  const addPattern = () => {
    const p: IdPattern = {
      id: nanoid(6),
      name: `規則 ${g.rules.patterns.length + 1}`,
      match: '^([A-Z])(\\d{3})(\\d{3})(\\d{4})$',
      derive: [],
    };
    patchRules((r) => ({ ...r, patterns: [...r.patterns, p] }));
  };

  const addLookup = () => {
    const t: LookupTable = {
      id: nanoid(6),
      name: `對照表 ${g.rules.lookups.length + 1}`,
      entries: {},
    };
    patchRules((r) => ({ ...r, lookups: [...r.lookups, t] }));
  };

  return (
    <div className="space-y-4">
      <Card className="bg-amber-50/70 p-3 text-sm text-amber-900">
        <p className="font-semibold">先想清楚哪些東西適合推導</p>
        <p className="mt-1">
          只推導真正由學號決定的東西：學制、系所、入學學年。
          教室、班級導師、應繳金額這些每學期都會變，猜錯會害學生白跑一趟。
          推導錯的資訊比沒有資訊更危險，因為學生會相信它。
        </p>
      </Card>

      <Card className="p-3">
        <Label hint="通常是學號">哪個欄位觸發推導</Label>
        <Select
          value={g.rules.triggerFieldKey}
          onChange={(e) => patchRules((r) => ({ ...r, triggerFieldKey: e.target.value }))}
          className="w-full"
        >
          <option value="">尚未選擇</option>
          {g.fields.map((f) => (
            <option key={f.key} value={f.key}>
              {resolveText(f.label, ctx.lang) || f.key}
            </option>
          ))}
        </Select>
        {!g.fields.length ? (
          <p className="mt-2 text-xs text-amber-700">
            還沒有任何欄位。請先到「欄位」分頁建立學號欄位，規則才有東西可以套。
          </p>
        ) : null}
      </Card>

      {/* 規則 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-600">
            規則（由上往下比對，第一條命中的生效）
          </p>
          <Button variant="soft" size="sm" onClick={addPattern}>
            新增規則
          </Button>
        </div>

        {g.rules.patterns.length === 0 ? (
          <Empty
            title="還沒有任何規則"
            body="一條規則就是一個正規表達式，把學號拆成幾段，再把每一段對到欄位值或查對照表。"
          />
        ) : (
          g.rules.patterns.map((p, i) => (
            <PatternCard
              key={p.id}
              ctx={ctx}
              pattern={p}
              index={i}
              total={g.rules.patterns.length}
              onPatch={(patch) =>
                patchRules((r) => ({
                  ...r,
                  patterns: r.patterns.map((x) => (x.id === p.id ? { ...x, ...patch } : x)),
                }))
              }
              onRemove={() =>
                patchRules((r) => ({ ...r, patterns: r.patterns.filter((x) => x.id !== p.id) }))
              }
              onMove={(delta) =>
                patchRules((r) => {
                  const next = i + delta;
                  if (next < 0 || next >= r.patterns.length) return r;
                  const arr = [...r.patterns];
                  const [item] = arr.splice(i, 1);
                  arr.splice(next, 0, item);
                  return { ...r, patterns: arr };
                })
              }
            />
          ))
        )}
      </div>

      {/* 對照表 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-600">對照表</p>
          <Button variant="soft" size="sm" onClick={addLookup}>
            新增對照表
          </Button>
        </div>

        {g.rules.lookups.map((t) => (
          <LookupCard
            key={t.id}
            ctx={ctx}
            table={t}
            usedBy={g.rules.patterns
              .filter((p) => p.derive.some((d) => d.lookup?.tableId === t.id))
              .map((p) => p.name)}
            onPatch={(patch) =>
              patchRules((r) => ({
                ...r,
                lookups: r.lookups.map((x) => (x.id === t.id ? { ...x, ...patch } : x)),
              }))
            }
            onRemove={() =>
              patchRules((r) => ({ ...r, lookups: r.lookups.filter((x) => x.id !== t.id) }))
            }
          />
        ))}
      </div>

      {/* 測試 */}
      <Card className="space-y-3 p-3">
        <p className="text-sm font-semibold text-slate-600">拿真的學號測一下</p>
        <TextArea
          rows={4}
          value={samples}
          onChange={(e) => setSamples(e.target.value)}
          placeholder="一行一個學號"
        />
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.id}
              className={cx(
                'rounded-xl p-2.5 text-sm',
                r.matched ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-700',
              )}
            >
              <p className="font-medium">
                {r.id}　{r.matched ? `命中「${r.matched}」` : '沒有任何規則命中'}
              </p>
              {r.matched ? (
                <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                  {Object.entries(r.values).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-slate-500">
                        {resolveText(g.fields.find((f) => f.key === k)?.label, ctx.lang) || k}
                      </dt>
                      <dd className="font-medium">{v || '（查無對照）'}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PatternCard({
  ctx,
  pattern,
  index,
  total,
  onPatch,
  onRemove,
  onMove,
}: {
  ctx: EditorCtx;
  pattern: IdPattern;
  index: number;
  total: number;
  onPatch: (p: Partial<IdPattern>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const g = ctx.guide;
  const re = safeRegExp(pattern.match, pattern.flags ?? '');
  const groups = re ? countGroups(pattern.match) : 0;

  const patchDerive = (di: number, p: Partial<DeriveAssign>) => {
    onPatch({ derive: pattern.derive.map((d, i) => (i === di ? { ...d, ...p } : d)) });
  };

  const allRegions = g.copies.flatMap((c) =>
    c.regions.map((r) => ({
      id: r.id,
      label: `${resolveText(c.name, ctx.lang) || '聯'} · 第 ${r.step} 步 · ${
        resolveText(r.label, ctx.lang) || '未命名'
      }`,
    })),
  );

  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
          {index + 1}
        </span>
        <TextInput
          value={pattern.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          className="flex-1"
        />
        <Button variant="ghost" size="sm" onClick={() => onMove(-1)} disabled={index === 0}>
          ↑
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onMove(1)} disabled={index === total - 1}>
          ↓
        </Button>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          🗑
        </Button>
      </div>

      <div>
        <Label hint="用小括號分出要取用的段落">正規表達式</Label>
        <TextInput
          value={pattern.match}
          onChange={(e) => onPatch({ match: e.target.value })}
          className="font-mono text-sm"
        />
        {re ? (
          <p className="mt-1 text-xs text-emerald-700">
            語法正確，有 {groups} 個捕獲群組，可以用 {Array.from({ length: groups }, (_, i) => `$${i + 1}`).join('、') || '無'}
          </p>
        ) : (
          <p className="mt-1 text-xs text-red-600">
            這串不是合法的正規表達式，學生端會直接跳過這條規則
          </p>
        )}
      </div>

      <div>
        <Label hint="給編輯者自己看的">這條規則在說什麼</Label>
        <LocalizedInput
          multiline
          rows={2}
          value={pattern.description}
          onChange={(v) => onPatch({ description: v })}
          lang={ctx.lang}
          languages={g.languages}
          placeholder="例如：D1105123456 拆成 D 學制、110 入學學年、512 系所代碼、3456 流水號"
        />
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500">命中之後推導什麼</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPatch({ derive: [...pattern.derive, { fieldKey: '', value: '' }] })}
          >
            新增一條
          </Button>
        </div>

        {pattern.derive.map((d, di) => (
          <div key={di} className="space-y-2 rounded-xl bg-slate-50 p-2">
            <div className="flex gap-2">
              <Select
                value={d.fieldKey}
                onChange={(e) => patchDerive(di, { fieldKey: e.target.value })}
                className="min-w-0 flex-1"
              >
                <option value="">選一個欄位</option>
                {g.fields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {resolveText(f.label, ctx.lang) || f.key}
                  </option>
                ))}
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onPatch({ derive: pattern.derive.filter((_, i) => i !== di) })}
              >
                移除
              </Button>
            </div>

            <div className="flex gap-1 text-xs">
              <button
                type="button"
                onClick={() => patchDerive(di, { lookup: undefined, value: d.value ?? '' })}
                className={cx(
                  'rounded-md px-2 py-1',
                  !d.lookup ? 'bg-slate-900 text-white' : 'bg-white text-slate-500',
                )}
              >
                填樣板
              </button>
              <button
                type="button"
                onClick={() =>
                  patchDerive(di, {
                    value: undefined,
                    lookup: d.lookup ?? { tableId: g.rules.lookups[0]?.id ?? '', group: 1 },
                  })
                }
                className={cx(
                  'rounded-md px-2 py-1',
                  d.lookup ? 'bg-slate-900 text-white' : 'bg-white text-slate-500',
                )}
              >
                查對照表
              </button>
            </div>

            {d.lookup ? (
              <div className="flex gap-2">
                <Select
                  value={d.lookup.tableId}
                  onChange={(e) =>
                    patchDerive(di, { lookup: { ...d.lookup!, tableId: e.target.value } })
                  }
                  className="min-w-0 flex-1"
                >
                  <option value="">選一張對照表</option>
                  {g.rules.lookups.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <input
                  type="number"
                  min={1}
                  max={9}
                  value={d.lookup.group}
                  onChange={(e) =>
                    patchDerive(di, {
                      lookup: { ...d.lookup!, group: Math.max(1, Number(e.target.value) || 1) },
                    })
                  }
                  className="w-20 rounded-xl border border-slate-300 px-2 py-2"
                  title="用第幾個捕獲群組去查"
                />
              </div>
            ) : (
              <TextInput
                value={d.value ?? ''}
                onChange={(e) => patchDerive(di, { value: e.target.value })}
                placeholder="例如：民國 $2 學年入學"
                className="font-mono text-sm"
              />
            )}

            <details>
              <summary className="cursor-pointer text-xs text-slate-500">
                順便高亮某些標註（{d.highlightRegionIds?.length ?? 0} 個）
              </summary>
              <div className="fgs-scroll mt-1 max-h-40 space-y-1 overflow-y-auto">
                {allRegions.map((r) => (
                  <label key={r.id} className="flex items-start gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={Boolean(d.highlightRegionIds?.includes(r.id))}
                      onChange={(e) => {
                        const cur = d.highlightRegionIds ?? [];
                        patchDerive(di, {
                          highlightRegionIds: e.target.checked
                            ? [...cur, r.id]
                            : cur.filter((x) => x !== r.id),
                        });
                      }}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </details>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** 數一數正規表達式裡有幾個捕獲群組，忽略跳脫過的括號與非捕獲群組 */
function countGroups(source: string): number {
  let n = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\\') {
      i += 1;
      continue;
    }
    if (source[i] === '(' && source.slice(i + 1, i + 2) !== '?') n += 1;
  }
  return n;
}

function LookupCard({
  ctx,
  table,
  usedBy,
  onPatch,
  onRemove,
}: {
  ctx: EditorCtx;
  table: LookupTable;
  usedBy: string[];
  onPatch: (p: Partial<LookupTable>) => void;
  onRemove: () => void;
}) {
  const [newCode, setNewCode] = useState('');
  const entries = Object.entries(table.entries);

  return (
    <Card className="space-y-2 p-3">
      <div className="flex items-center gap-2">
        <TextInput
          value={table.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          className="flex-1"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (usedBy.length && !confirm(`「${usedBy.join('、')}」還在用這張表，確定刪除？`)) return;
            onRemove();
          }}
        >
          🗑
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-slate-400">還沒有任何對照。加一筆試試，例如 512 對到資工系。</p>
      ) : null}

      {entries.map(([code, text]) => (
        <div key={code} className="flex items-start gap-2">
          <span className="mt-2 w-14 shrink-0 font-mono text-xs text-slate-500">{code}</span>
          <LocalizedInput
            className="min-w-0 flex-1"
            value={text}
            onChange={(v) => onPatch({ entries: { ...table.entries, [code]: v } })}
            lang={ctx.lang}
            languages={ctx.guide.languages}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = { ...table.entries };
              delete next[code];
              onPatch({ entries: next });
            }}
          >
            ✕
          </Button>
        </div>
      ))}

      <div className="flex gap-2">
        <TextInput
          value={newCode}
          placeholder="代碼，例如 512"
          onChange={(e) => setNewCode(e.target.value)}
          className="flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const c = newCode.trim();
            if (!c || table.entries[c]) return;
            onPatch({ entries: { ...table.entries, [c]: {} } });
            setNewCode('');
          }}
        >
          加一筆
        </Button>
      </div>

      {usedBy.length ? (
        <p className="text-xs text-slate-400">使用中：{usedBy.join('、')}</p>
      ) : (
        <p className="text-xs text-amber-600">目前沒有任何規則在用這張表</p>
      )}
    </Card>
  );
}
