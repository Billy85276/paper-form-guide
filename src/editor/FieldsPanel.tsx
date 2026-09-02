import { useMemo, useState } from 'react';
import { LocalizedInput } from '../components/LocalizedInput';
import { Badge, Button, Card, Empty, Label, Modal, Select, TextInput, cx } from '../components/ui';
import { safeRegExp } from '../lib/rules';
import { resolveText } from '../lib/text';
import type { Field, FieldKind, LocalizedText } from '../lib/types';
import type { EditorCtx } from './ctx';

/**
 * 邏輯欄位面板
 *
 * 這個面板存在的理由：複寫單的同一個資料（例如姓名）會在三聯上各出現一次，
 * 如果讓編輯者對著三個標註各寫一次說明，維護成本會乘以聯數，而且遲早不一致。
 * 邏輯欄位把「這是什麼資料」從「它畫在紙上的哪裡」拆開，說明只寫一次，
 * 學生也只輸入一次，模擬填寫時三處同時落筆。
 *
 * 幾個刻意的取捨：
 * 1. 用手風琴一次只展開一個欄位。面板在手機上可能只有 320px 寬，
 *    七八個欄位同時攤開會讓人完全找不到自己在編哪一個。
 * 2. key 改名採「離開輸入框才生效」，並連帶改寫所有指向它的標註與學號規則。
 *    如果邊打字邊套用，打到一半的 key 會先把既有連結全部打斷。
 * 3. 刪除欄位時順手把標註上的孤兒 fieldKey 清掉。留著一個指向不存在欄位的鍵，
 *    只會在匯出或學生端變成一個沒有人看得懂的沉默失敗。
 */

const KIND_LABEL: Record<FieldKind, string> = {
  text: '文字',
  number: '數字',
  date: '日期',
  phone: '電話',
  select: '下拉選單',
  bool: '是否',
};

const KIND_ORDER: FieldKind[] = ['text', 'number', 'date', 'phone', 'select', 'bool'];

/** 程式用鍵只允許英數與底線，因為它會出現在規則樣板與匯出的 JSON 鍵位上 */
const KEY_RE = /^[A-Za-z0-9_]+$/;

interface Usage {
  copyIndex: number;
  copyName: string;
  regionId: string;
  regionLabel: string;
  step: number;
}

interface Candidate {
  key: string;
  label: LocalizedText;
  picked: boolean;
  regionIds: string[];
  /** 給人看的來源描述，例如「存根聯 第 3 步」 */
  from: string[];
}

/** 把一段人看的文字壓成合法的程式鍵，中文之類的字元會被整段吃掉而回傳空字串 */
function slugKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** 在既有鍵之外找一個不衝突的名字 */
function uniqueKey(base: string, taken: Set<string>): string {
  const seed = base || 'field';
  if (!taken.has(seed)) return seed;
  let n = 2;
  while (taken.has(`${seed}_${n}`)) n += 1;
  return `${seed}_${n}`;
}

export function FieldsPanel({ ctx }: { ctx: EditorCtx }) {
  const { guide, lang } = ctx;
  const fields = guide.fields;

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);

  /* 使用狀況 --------------------------------------------------------- */

  /** 每個 fieldKey 被哪些標註引用。一次掃完，避免每張卡片各掃一遍。 */
  const usageByKey = useMemo(() => {
    const map = new Map<string, Usage[]>();
    guide.copies.forEach((copy, copyIndex) => {
      const copyName = resolveText(copy.name, lang) || `第 ${copyIndex + 1} 聯`;
      for (const region of copy.regions) {
        if (!region.fieldKey) continue;
        const list = map.get(region.fieldKey) ?? [];
        list.push({
          copyIndex,
          copyName,
          regionId: region.id,
          regionLabel: resolveText(region.label, lang) || '未命名標註',
          step: region.step,
        });
        map.set(region.fieldKey, list);
      }
    });
    for (const list of map.values()) list.sort((a, b) => a.step - b.step);
    return map;
  }, [guide.copies, lang]);

  /** 還沒接上任何欄位的標註數量，決定自動建立按鈕值不值得按 */
  const orphanCount = useMemo(
    () => guide.copies.reduce((n, c) => n + c.regions.filter((r) => !r.fieldKey).length, 0),
    [guide.copies],
  );

  /* 基本操作 --------------------------------------------------------- */

  const patchField = (key: string, patch: Partial<Field>) => {
    ctx.update((g) => ({
      ...g,
      fields: g.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
    }));
  };

  const addField = () => {
    const taken = new Set(fields.map((f) => f.key));
    const key = uniqueKey('field', taken);
    ctx.update((g) => ({
      ...g,
      fields: [
        ...g.fields,
        {
          key,
          label: {},
          kind: 'text',
          sameAcrossCopies: true,
          askUser: true,
        },
      ],
    }));
    setOpenKey(key);
    setKeyDraft(key);
  };

  const moveField = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    ctx.update((g) => {
      const next = [...g.fields];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return { ...g, fields: next };
    });
  };

  const removeField = (key: string) => {
    ctx.update((g) => ({
      ...g,
      fields: g.fields.filter((f) => f.key !== key),
      // 一併清掉指向它的標註，否則會留下一批連不到任何欄位的死鍵
      copies: g.copies.map((c) => ({
        ...c,
        regions: c.regions.map((r) => (r.fieldKey === key ? { ...r, fieldKey: undefined } : r)),
      })),
    }));
    if (openKey === key) setOpenKey(null);
    setPendingDelete(null);
    ctx.toast('已刪除欄位');
  };

  /* key 改名 --------------------------------------------------------- */

  const keyError = (() => {
    if (openKey === null) return null;
    const draft = keyDraft.trim();
    if (!draft) return '程式用鍵不能空白';
    if (!KEY_RE.test(draft)) return '只能使用英文、數字與底線，不能有空白或中文';
    if (draft !== openKey && fields.some((f) => f.key === draft)) {
      return `已經有一個欄位叫「${draft}」了，鍵必須唯一，否則標註會連錯欄位`;
    }
    return null;
  })();

  const commitKey = () => {
    if (openKey === null) return;
    const nextKey = keyDraft.trim();
    if (keyError || nextKey === openKey) return;
    const oldKey = openKey;
    ctx.update((g) => ({
      ...g,
      fields: g.fields.map((f) => (f.key === oldKey ? { ...f, key: nextKey } : f)),
      copies: g.copies.map((c) => ({
        ...c,
        regions: c.regions.map((r) => (r.fieldKey === oldKey ? { ...r, fieldKey: nextKey } : r)),
      })),
      rules: {
        ...g.rules,
        triggerFieldKey:
          g.rules.triggerFieldKey === oldKey ? nextKey : g.rules.triggerFieldKey,
        patterns: g.rules.patterns.map((p) => ({
          ...p,
          derive: p.derive.map((d) => (d.fieldKey === oldKey ? { ...d, fieldKey: nextKey } : d)),
        })),
      },
    }));
    setOpenKey(nextKey);
    ctx.toast('已改名，指向它的標註與規則同步更新');
  };

  /* 從標註自動建立 --------------------------------------------------- */

  const openCandidates = () => {
    const taken = new Set(fields.map((f) => f.key));
    const groups = new Map<string, Candidate>();

    guide.copies.forEach((copy, copyIndex) => {
      const copyName = resolveText(copy.name, lang) || `第 ${copyIndex + 1} 聯`;
      for (const region of copy.regions) {
        if (region.fieldKey) continue;
        const text = resolveText(region.label, lang).trim();
        // 同名的標註視為同一件事，這正是複寫單「一次輸入三處落筆」的來源
        const groupId = text || `__${region.id}`;
        const exist = groups.get(groupId);
        if (exist) {
          exist.regionIds.push(region.id);
          exist.from.push(`${copyName} 第 ${region.step} 步`);
          continue;
        }
        const base = slugKey(region.label.en ?? '') || slugKey(text);
        const key = uniqueKey(base, taken);
        taken.add(key);
        groups.set(groupId, {
          key,
          label: { ...region.label },
          picked: true,
          regionIds: [region.id],
          from: [`${copyName} 第 ${region.step} 步`],
        });
      }
    });

    setCandidates([...groups.values()]);
  };

  /** 候選清單自己內部也可能撞鍵，所以送出前逐列檢查一次 */
  const candidateError = (list: Candidate[], index: number): string | null => {
    const c = list[index];
    if (!c.picked) return null;
    const key = c.key.trim();
    if (!key) return '鍵不能空白';
    if (!KEY_RE.test(key)) return '只能用英數與底線';
    if (fields.some((f) => f.key === key)) return '與既有欄位重複';
    if (list.some((o, i) => i !== index && o.picked && o.key.trim() === key)) return '與上面的候選重複';
    return null;
  };

  const confirmCandidates = () => {
    if (!candidates) return;
    const picked = candidates.filter((c) => c.picked);
    if (!picked.length) {
      setCandidates(null);
      return;
    }
    const owner = new Map<string, string>();
    for (const c of picked) {
      for (const id of c.regionIds) owner.set(id, c.key.trim());
    }
    ctx.update((g) => ({
      ...g,
      fields: [
        ...g.fields,
        ...picked.map<Field>((c) => ({
          key: c.key.trim(),
          label: c.label,
          kind: 'text',
          sameAcrossCopies: c.regionIds.length > 1,
          askUser: true,
        })),
      ],
      copies: g.copies.map((copy) => ({
        ...copy,
        regions: copy.regions.map((r) => {
          const key = owner.get(r.id);
          return key ? { ...r, fieldKey: key } : r;
        }),
      })),
    }));
    ctx.toast(`已建立 ${picked.length} 個欄位`);
    setCandidates(null);
  };

  /* 畫面 ------------------------------------------------------------- */

  const deleting = pendingDelete ? fields.find((f) => f.key === pendingDelete) : undefined;
  const deletingUsage = pendingDelete ? (usageByKey.get(pendingDelete) ?? []) : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold text-slate-700">
          邏輯欄位
          {fields.length ? <span className="ml-1 text-slate-400">{fields.length}</span> : null}
        </h2>
        <Button size="sm" onClick={openCandidates} disabled={orphanCount === 0}>
          從標註建立
          {orphanCount ? <span className="text-slate-400">{orphanCount}</span> : null}
        </Button>
        <Button size="sm" variant="primary" onClick={addField}>
          新增欄位
        </Button>
      </div>

      {fields.length === 0 ? (
        <Empty
          title="還沒有邏輯欄位"
          body={
            '邏輯欄位是「同一筆資料」的定義，例如姓名。' +
            '複寫單上姓名會在三聯各出現一次，把三個標註都接到同一個欄位後，' +
            '說明只要寫一次，學生也只要輸入一次，模擬填寫時三處會同時寫上。' +
            '花幾分鐘設定，換來的是日後改字只改一處。'
          }
          action={
            orphanCount ? (
              <Button variant="primary" onClick={openCandidates}>
                從現有 {orphanCount} 個標註自動建立
              </Button>
            ) : (
              <Button variant="primary" onClick={addField}>
                手動新增第一個欄位
              </Button>
            )
          }
        />
      ) : null}

      {fields.map((field, index) => {
        const usage = usageByKey.get(field.key) ?? [];
        const open = openKey === field.key;
        const title = resolveText(field.label, lang) || field.key;
        return (
          <Card key={field.key} className={cx('overflow-hidden', open && 'ring-1 ring-blue-200')}>
            <div className="flex items-center gap-1 px-2 py-2">
              <button
                type="button"
                onClick={() => {
                  const next = open ? null : field.key;
                  setOpenKey(next);
                  if (next) setKeyDraft(field.key);
                }}
                className="min-w-0 flex-1 rounded-lg px-1 py-1 text-left hover:bg-slate-50"
              >
                <div className="truncate text-sm font-medium text-slate-800">{title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  <code className="rounded bg-slate-100 px-1 text-[11px] text-slate-500">
                    {field.key}
                  </code>
                  <Badge>{KIND_LABEL[field.kind]}</Badge>
                  <Badge color={usage.length ? '#059669' : '#dc2626'}>
                    {usage.length ? `${usage.length} 處標註` : '沒有標註使用'}
                  </Badge>
                </div>
              </button>
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  aria-label="上移"
                  disabled={index === 0}
                  onClick={() => moveField(index, -1)}
                  className="px-1.5 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label="下移"
                  disabled={index === fields.length - 1}
                  onClick={() => moveField(index, 1)}
                  className="px-1.5 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label="刪除欄位"
                onClick={() => setPendingDelete(field.key)}
              >
                🗑
              </Button>
            </div>

            {open ? (
              <div className="space-y-3 border-t border-slate-100 px-3 py-3">
                <div>
                  <Label hint="英數與底線，規則與匯出都用它">程式用鍵</Label>
                  <TextInput
                    value={keyDraft}
                    spellCheck={false}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    onBlur={commitKey}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    className={keyError ? 'border-red-400' : undefined}
                  />
                  {keyError ? (
                    <p className="mt-1 text-xs text-red-600">{keyError}</p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      改名後，指向它的標註與學號規則會一起更新
                    </p>
                  )}
                </div>

                <div>
                  <Label>顯示名稱</Label>
                  <LocalizedInput
                    value={field.label}
                    onChange={(next) => patchField(field.key, { label: next })}
                    lang={lang}
                    languages={guide.languages}
                    placeholder="例如：姓名"
                  />
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label>資料型別</Label>
                    <Select
                      value={field.kind}
                      onChange={(e) =>
                        patchField(field.key, { kind: e.target.value as FieldKind })
                      }
                    >
                      {KIND_ORDER.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="min-w-[8rem] flex-1">
                    <Label>輸入框提示字</Label>
                    <TextInput
                      value={field.placeholder ?? ''}
                      placeholder="例如：王小明"
                      onChange={(e) =>
                        patchField(field.key, { placeholder: e.target.value || undefined })
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label hint="寫給學生看的填寫規則">說明</Label>
                  <LocalizedInput
                    value={field.hint}
                    onChange={(next) => patchField(field.key, { hint: next })}
                    lang={lang}
                    languages={guide.languages}
                    multiline
                    rows={2}
                    placeholder="例如：填身分證上的本名，不要填綽號"
                  />
                </div>

                <PatternRow
                  value={field.pattern ?? ''}
                  onChange={(v) => patchField(field.key, { pattern: v || undefined })}
                />

                {field.kind === 'select' ? (
                  <OptionsEditor ctx={ctx} field={field} onPatch={patchField} />
                ) : null}

                <div className="space-y-2 rounded-xl bg-slate-50 px-3 py-2">
                  <CheckRow
                    checked={field.sameAcrossCopies}
                    onChange={(v) => patchField(field.key, { sameAcrossCopies: v })}
                    title="各聯內容一致"
                    note="複寫單同一筆資料，勾起來後模擬填寫會在每一聯寫上同樣的字"
                  />
                  <CheckRow
                    checked={field.askUser}
                    onChange={(v) => patchField(field.key, { askUser: v })}
                    title="出現在學生輸入面板"
                    note="關掉的話學生看不到這格，適合由學號自動推導出來的欄位"
                  />
                </div>

                <div>
                  <Label hint="點一下跳到那個標註">目前被哪些標註使用</Label>
                  {usage.length === 0 ? (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      還沒有標註連到這個欄位。學生輸入後不會有任何地方被填上，
                      請到畫布上選一個標註並指定這個欄位。
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {usage.map((u) => (
                        <li key={u.regionId}>
                          <button
                            type="button"
                            onClick={() => {
                              ctx.setCopyIndex(u.copyIndex);
                              ctx.setSelectedId(u.regionId);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                          >
                            <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 text-[11px] text-white">
                              {u.step}
                            </span>
                            <span className="truncate text-slate-700">{u.regionLabel}</span>
                            <span className="ml-auto shrink-0 text-slate-400">{u.copyName}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </Card>
        );
      })}

      {/* 刪除確認：先講清楚會斷掉幾個連結，再讓人按下去 */}
      <Modal
        open={Boolean(deleting)}
        onClose={() => setPendingDelete(null)}
        title="刪除這個欄位？"
      >
        {deleting ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-700">
              即將刪除「{resolveText(deleting.label, lang) || deleting.key}」（
              <code className="rounded bg-slate-100 px-1 text-xs">{deleting.key}</code>）。
            </p>
            {deletingUsage.length ? (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-red-700">
                <p className="font-medium">有 {deletingUsage.length} 個標註正連到它，會失去連結。</p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {deletingUsage.map((u) => (
                    <li key={u.regionId}>
                      第 {u.step} 步 · {u.regionLabel} · {u.copyName}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">
                  這些標註本身會留著，只是不再自動填字，說明也要改回逐格撰寫。
                </p>
              </div>
            ) : (
              <p className="text-slate-500">目前沒有任何標註使用它，刪掉不會影響畫面。</p>
            )}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPendingDelete(null)}>取消</Button>
              <Button variant="danger" onClick={() => removeField(deleting.key)}>
                確定刪除
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* 自動建立：把沒有欄位的標註依名稱聚成候選，勾選後一次接上 */}
      <Modal
        open={candidates !== null}
        onClose={() => setCandidates(null)}
        title="從標註自動建立欄位"
        wide
      >
        {candidates ? (
          candidates.length === 0 ? (
            <p className="text-sm text-slate-500">
              每個標註都已經接上欄位了，沒有需要建立的項目。
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                名稱相同的標註會聚成同一個欄位，這樣三聯的姓名就只需要輸入一次。
                程式用鍵可以直接改，中文標題無法轉成鍵時會先給一個預設名字。
              </p>
              <ul className="space-y-2">
                {candidates.map((c, i) => {
                  const err = candidateError(candidates, i);
                  return (
                    <li
                      key={`${c.regionIds[0]}-${i}`}
                      className="rounded-xl border border-slate-200 px-3 py-2"
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={c.picked}
                          onChange={(e) =>
                            setCandidates((prev) =>
                              prev
                                ? prev.map((o, j) =>
                                    j === i ? { ...o, picked: e.target.checked } : o,
                                  )
                                : prev,
                            )
                          }
                          className="mt-1 size-4 shrink-0 accent-slate-900"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-800">
                            {resolveText(c.label, lang) || '未命名標註'}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-400">
                            {c.from.join('、')}
                          </div>
                          <div className="mt-1.5">
                            <TextInput
                              value={c.key}
                              spellCheck={false}
                              disabled={!c.picked}
                              onChange={(e) =>
                                setCandidates((prev) =>
                                  prev
                                    ? prev.map((o, j) =>
                                        j === i ? { ...o, key: e.target.value } : o,
                                      )
                                    : prev,
                                )
                              }
                              className={cx(
                                'text-sm',
                                err && 'border-red-400',
                                !c.picked && 'bg-slate-50 text-slate-400',
                              )}
                            />
                            {err ? <p className="mt-1 text-xs text-red-600">{err}</p> : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap justify-end gap-2">
                <Button onClick={() => setCandidates(null)}>取消</Button>
                <Button
                  variant="primary"
                  disabled={
                    !candidates.some((c) => c.picked) ||
                    candidates.some((_, i) => candidateError(candidates, i))
                  }
                  onClick={confirmCandidates}
                >
                  建立 {candidates.filter((c) => c.picked).length} 個欄位
                </Button>
              </div>
            </div>
          )
        ) : null}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 內部小元件                                                          */
/* ------------------------------------------------------------------ */

/** 正規表達式輸入。語法錯誤要當場講出來，不然只會在學生端安靜失效 */
function PatternRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const broken = Boolean(value) && safeRegExp(value) === null;
  return (
    <div>
      <Label hint="選填，留空表示不檢查">格式檢查（正規表達式）</Label>
      <TextInput
        value={value}
        spellCheck={false}
        placeholder="例如：^[A-Z]\d{9}$"
        onChange={(e) => onChange(e.target.value)}
        className={cx('font-mono text-sm', broken && 'border-red-400')}
      />
      {broken ? (
        <p className="mt-1 text-xs text-red-600">
          這段正規表達式語法有誤，存下去也不會生效，請修正後再離開。
        </p>
      ) : null}
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  title,
  note,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  note: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-slate-900"
      />
      <span className="min-w-0">
        <span className="block text-sm text-slate-700">{title}</span>
        <span className="block text-xs text-slate-400">{note}</span>
      </span>
    </label>
  );
}

/** 下拉選單的選項編輯器。value 存進資料、label 給學生看，兩者刻意分開 */
function OptionsEditor({
  ctx,
  field,
  onPatch,
}: {
  ctx: EditorCtx;
  field: Field;
  onPatch: (key: string, patch: Partial<Field>) => void;
}) {
  const options = field.options ?? [];

  const setOptions = (next: { value: string; label: LocalizedText }[]) => {
    onPatch(field.key, { options: next.length ? next : undefined });
  };

  return (
    <div>
      <Label hint="學生會從這些項目挑一個">選項</Label>
      {options.length === 0 ? (
        <p className="mb-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          還沒有選項。下拉選單沒有選項時，學生端會退回成一般文字輸入。
        </p>
      ) : (
        <ul className="mb-2 space-y-2">
          {options.map((opt, i) => (
            <li key={i} className="rounded-xl border border-slate-200 px-2 py-2">
              <div className="flex items-center gap-1">
                <TextInput
                  value={opt.value}
                  spellCheck={false}
                  placeholder="存起來的值"
                  onChange={(e) =>
                    setOptions(
                      options.map((o, j) => (j === i ? { ...o, value: e.target.value } : o)),
                    )
                  }
                  className="font-mono text-sm"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="刪除這個選項"
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                >
                  ✕
                </Button>
              </div>
              <div className="mt-1.5">
                <LocalizedInput
                  value={opt.label}
                  onChange={(next) =>
                    setOptions(options.map((o, j) => (j === i ? { ...o, label: next } : o)))
                  }
                  lang={ctx.lang}
                  languages={ctx.guide.languages}
                  placeholder="給人看的名稱"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button
        size="sm"
        onClick={() => setOptions([...options, { value: '', label: {} }])}
      >
        新增選項
      </Button>
    </div>
  );
}
