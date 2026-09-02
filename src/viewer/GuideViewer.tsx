import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FormCanvas } from '../components/FormCanvas';
import { Badge, Button, Card, Modal, Select, TextInput, cx } from '../components/ui';
import { downloadBlob, exportCopyPngs, exportStepPngs, printGuide } from '../lib/exporters';
import { ROLE_HINT, ROLE_LABEL, flatRegions } from '../lib/factory';
import { deriveFromId, validateField } from '../lib/rules';
import { verifyPassword } from '../lib/share';
import { resolveText } from '../lib/text';
import { makeUi } from '../lib/ui-i18n';
import { LANG_LABEL, type Guide, type LangCode, type Region } from '../lib/types';
import { PrintSheet } from './PrintSheet';
import { TextView } from './TextView';

/**
 * 學生端
 *
 * 設計上的核心判斷：一進來就把所有標記都畫在紙上，讓人先有全貌。
 * 站在櫃檯前的人需要的是「這張紙總共有幾件事要做」，不是被強迫走一條線。
 * 想看細節就點那個標記，想被牽著走就按逐步精靈。兩種都給，預設是全貌。
 */

type Mode = 'overview' | 'wizard';

export function GuideViewer({ guide, editHref }: { guide: Guide; editHref?: string }) {
  const [lang, setLang] = useState<LangCode>(guide.defaultLang);
  const [copyIndex, setCopyIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('overview');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [simulate, setSimulate] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [showDeptDialog, setShowDeptDialog] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [textOnly, setTextOnly] = useState(false);

  const t = makeUi(lang);
  const steps = useMemo(() => flatRegions(guide), [guide]);
  const copy = guide.copies[copyIndex];

  /* 學號推導 ------------------------------------------------------- */
  const derived = useMemo(() => {
    const raw = inputs[guide.rules.triggerFieldKey] ?? '';
    return deriveFromId(guide.rules, raw, lang);
  }, [guide.rules, inputs, lang]);

  const values = useMemo(
    () => ({ ...derived.values, ...stripEmpty(inputs) }),
    [derived.values, inputs],
  );

  /* 目前聚焦的標註 ------------------------------------------------- */
  const selected = useMemo(
    () => steps.find((s) => s.region.id === selectedId) ?? null,
    [steps, selectedId],
  );

  // 逐步精靈換頁時，如果那一步在另一聯，自動切到那一聯
  useEffect(() => {
    if (!selected) return;
    const idx = guide.copies.findIndex((c) => c.id === selected.copy.id);
    if (idx >= 0 && idx !== copyIndex) setCopyIndex(idx);
  }, [selected, guide.copies, copyIndex]);

  const stepIndex = selected ? steps.findIndex((s) => s.region.id === selected.region.id) : -1;

  const goStep = (delta: number) => {
    const next = Math.max(0, Math.min(steps.length - 1, stepIndex + delta));
    setSelectedId(steps[next]?.region.id ?? null);
  };

  const startWizard = () => {
    setMode('wizard');
    setSelectedId(steps[0]?.region.id ?? null);
  };

  const yours = steps.filter((s) => s.region.audience !== 'staff').length;
  const staffCount = steps.length - yours;

  // 選中任何一個標記就放大聚焦，不只是逐步精靈模式。
  // 使用者的期待是「想看哪裡就點過去放大」，強迫他先進精靈才會放大很不直覺。
  const focus =
    selected && selected.copy.id === copy?.id
      ? {
          x: selected.region.x,
          y: selected.region.y,
          w: selected.region.w,
          h: selected.region.h,
        }
      : null;

  /* 匯出 ----------------------------------------------------------- */
  const doExportPngs = async () => {
    setBusy('正在產生圖片');
    try {
      const files = [
        ...(await exportCopyPngs(guide, lang, { simulate, values })),
        ...(await exportStepPngs(guide, lang)),
      ];
      for (const f of files) downloadBlob(f.blob, f.name);
    } finally {
      setBusy(null);
    }
  };

  if (!copy) {
    return <div className="p-8 text-center text-slate-500">{t('noGuide')}</div>;
  }

  if (textOnly) {
    return <TextView guide={guide} lang={lang} onClose={() => setTextOnly(false)} />;
  }

  return (
    <div className="min-h-full bg-slate-50 pb-28">
      {/* 頂部列 */}
      <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2">
          {editHref ? (
            <Link
              to={editHref}
              className="no-print inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ← 返回編輯
            </Link>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base leading-tight font-semibold">
              {resolveText(guide.title, lang)}
            </h1>
            {guide.subtitle ? (
              <p className="truncate text-xs text-slate-500">{resolveText(guide.subtitle, lang)}</p>
            ) : null}
          </div>
          <Select
            aria-label={t('language')}
            value={lang}
            onChange={(e) => setLang(e.target.value as LangCode)}
            className="h-9 py-0 text-sm"
          >
            {guide.languages.map((l) => (
              <option key={l} value={l}>
                {LANG_LABEL[l]}
              </option>
            ))}
          </Select>
        </div>

        {/* 聯別分頁。複寫單的困惑就從這裡開始解 */}
        {guide.copies.length > 1 ? (
          <div className="fgs-scroll mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2">
            {guide.copies.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setCopyIndex(i)}
                className={cx(
                  'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  i === copyIndex
                    ? 'border-transparent text-white'
                    : 'border-slate-200 bg-white text-slate-600',
                )}
                style={i === copyIndex ? { backgroundColor: c.color } : undefined}
              >
                {resolveText(c.name, lang)}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {/* 互動畫面不列印。列印時只出 PrintSheet 的專用版型，
          否則同一份內容會印兩次，而且互動版的版面完全不適合 A4。 */}
      <main className="no-print mx-auto max-w-5xl px-3 pt-3">
        {/* 這一聯交給誰 */}
        {copy.goesTo ? (
          <div
            className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
            style={{
              backgroundColor: `color-mix(in srgb, ${copy.color} 10%, white)`,
              color: copy.color,
            }}
          >
            <span className="font-medium">{t('goesTo')}</span>
            <span>{resolveText(copy.goesTo, lang)}</span>
          </div>
        ) : null}

        <FormCanvas
          guide={guide}
          copy={copy}
          lang={lang}
          activeRegionId={selectedId}
          dimOthers={mode === 'wizard'}
          onSelect={setSelectedId}
          simulate={simulate}
          values={values}
          unlockedDepts={unlocked}
          focus={focus}
          className="border border-slate-200 shadow-sm"
        />

        {copy.note ? (
          <p className="mt-2 text-sm text-slate-500">{resolveText(copy.note, lang)}</p>
        ) : null}

        {/* 標註細節。選中任何一個標記時，取代下面的總覽卡片，直接嵌在版面中 */}
        {selected ? (
          <DetailSheet
            region={selected.region}
            copyName={resolveText(selected.copy.name, lang)}
            lang={lang}
            index={stepIndex}
            total={steps.length}
            t={t}
            value={selected.region.fieldKey ? values[selected.region.fieldKey] : undefined}
            onPrev={() => goStep(-1)}
            onNext={() => goStep(1)}
            onClose={() => {
              setSelectedId(null);
              setMode('overview');
            }}
          />
        ) : null}

        {/* 開始之前 */}
        {mode === 'overview' && !selected ? (
          <Card className="mt-3 p-4">
            <h2 className="text-sm font-semibold text-slate-500">{t('summaryTitle')}</h2>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { n: guide.copies.length, label: t('copyTab'), tone: 'text-slate-900' },
                { n: yours, label: t('summaryYours'), tone: 'text-blue-600' },
                { n: staffCount, label: t('summaryStaff'), tone: 'text-slate-400' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                  <p className={cx('text-2xl leading-none font-bold', s.tone)}>{s.n}</p>
                  <p className="mt-1 text-xs text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-sm text-slate-500">{t('tapAnyMarker')}</p>

            {guide.logistics ? (
              <dl className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-3">
                {guide.logistics.where ? (
                  <div>
                    <dt className="text-xs text-slate-400">{t('whereToGet')}</dt>
                    <dd>{resolveText(guide.logistics.where, lang)}</dd>
                  </div>
                ) : null}
                {guide.logistics.deadline ? (
                  <div>
                    <dt className="text-xs text-slate-400">{t('deadline')}</dt>
                    <dd>{resolveText(guide.logistics.deadline, lang)}</dd>
                  </div>
                ) : null}
                {guide.logistics.contact ? (
                  <div>
                    <dt className="text-xs text-slate-400">{t('contact')}</dt>
                    <dd>{resolveText(guide.logistics.contact, lang)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="lg" onClick={startWizard} className="flex-1">
                {t('wizard')} →
              </Button>
              <Button variant="outline" onClick={() => setShowInfo(true)}>
                {t('yourInfo')}
              </Button>
            </div>
          </Card>
        ) : null}

        {/* 全部步驟清單 */}
        {mode === 'overview' && !selected ? (
          <Card className="mt-3 divide-y divide-slate-100">
            <h2 className="px-4 pt-3 pb-2 text-sm font-semibold text-slate-500">{t('allSteps')}</h2>
            {steps
              .filter((s) => !s.region.deptOnly || unlocked.includes(s.region.deptOnly))
              .map(({ region, copy: c }) => (
                <button
                  key={region.id}
                  onClick={() => {
                    setSelectedId(region.id);
                    setMode('wizard');
                  }}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: region.style.color || undefined }}
                  >
                    {region.step}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{resolveText(region.label, lang)}</span>
                    <span className="block truncate text-sm text-slate-500">
                      {resolveText(c.name, lang)} · {ROLE_LABEL[region.role]}
                    </span>
                  </span>
                  {region.audience === 'staff' ? (
                    <Badge color="#64748b">{t('staffFills')}</Badge>
                  ) : null}
                </button>
              ))}
          </Card>
        ) : null}
      </main>

      {/* 底部工具列 */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <Button
            variant={simulate ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSimulate((v) => !v)}
            className="flex-1"
          >
            {simulate ? t('showBlank') : t('showFilled')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowInfo(true)}>
            {t('yourInfo')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setTextOnly(true)}>
            純文字版
          </Button>
          <Button variant="ghost" size="sm" onClick={() => printGuide()}>
            {t('printPdf')}
          </Button>
          <Button variant="ghost" size="sm" onClick={doExportPngs} disabled={Boolean(busy)}>
            {busy ?? t('downloadPng')}
          </Button>
          {guide.deptViews.length ? (
            <Button variant="ghost" size="sm" onClick={() => setShowDeptDialog(true)}>
              {t('deptUnlock')}
            </Button>
          ) : null}
        </div>
      </nav>

      <YourInfoDialog
        open={showInfo}
        onClose={() => setShowInfo(false)}
        guide={guide}
        lang={lang}
        inputs={inputs}
        setInputs={setInputs}
        derived={derived}
        t={t}
      />

      <DeptDialog
        open={showDeptDialog}
        onClose={() => setShowDeptDialog(false)}
        guide={guide}
        lang={lang}
        unlocked={unlocked}
        setUnlocked={setUnlocked}
        t={t}
      />

      {/* 列印時才出現的完整版面 */}
      <PrintSheet guide={guide} lang={lang} values={values} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function stripEmpty(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v?.trim()));
}

function DetailSheet({
  region,
  copyName,
  lang,
  index,
  total,
  t,
  value,
  onPrev,
  onNext,
  onClose,
}: {
  region: Region;
  copyName: string;
  lang: LangCode;
  index: number;
  total: number;
  t: (k: Parameters<ReturnType<typeof makeUi>>[0]) => string;
  value?: string;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const instruction = resolveText(region.instruction, lang);
  const example = resolveText(region.example, lang);
  const pitfall = resolveText(region.pitfall, lang);
  const isStaff = region.audience === 'staff';
  const color = region.style.color || undefined;

  return (
    <Card className="fgs-pop mt-3 overflow-hidden">
      <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
        <span
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: color ?? '#2563eb' }}
        >
          {region.step}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="leading-tight font-semibold">{resolveText(region.label, lang)}</h3>
          <p className="text-xs text-slate-500">
            {copyName} · {index + 1} / {total}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('closeDetail')}>
          ✕
        </Button>
      </div>

      <div className="px-4 py-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge color={isStaff ? '#64748b' : (color ?? '#2563eb')}>
            {isStaff ? t('staffFills') : ROLE_HINT[region.role]}
          </Badge>
          {!isStaff ? (
            <Badge color={region.required ? '#dc2626' : '#94a3b8'}>
              {region.required ? t('required') : t('optional')}
            </Badge>
          ) : null}
        </div>

        <p className="text-[15px] leading-relaxed text-slate-800">{instruction}</p>

        {value ? (
          <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            你這一格要寫：<strong className="fgs-hand text-lg">{value}</strong>
          </p>
        ) : null}

        {example ? (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <strong>{t('example')}</strong>　{example}
          </p>
        ) : null}

        {pitfall ? (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <strong>{t('pitfall')}</strong>　{pitfall}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
        <Button variant="outline" onClick={onPrev} disabled={index <= 0} className="flex-1">
          ← {t('prev')}
        </Button>
        <Button variant="primary" onClick={index >= total - 1 ? onClose : onNext} className="flex-1">
          {index >= total - 1 ? t('done') : `${t('next')} →`}
        </Button>
      </div>
    </Card>
  );
}

function YourInfoDialog({
  open,
  onClose,
  guide,
  lang,
  inputs,
  setInputs,
  derived,
  t,
}: {
  open: boolean;
  onClose: () => void;
  guide: Guide;
  lang: LangCode;
  inputs: Record<string, string>;
  setInputs: (v: Record<string, string>) => void;
  derived: ReturnType<typeof deriveFromId>;
  t: (k: Parameters<ReturnType<typeof makeUi>>[0]) => string;
}) {
  const asked = guide.fields.filter((f) => f.askUser);
  const auto = guide.fields.filter((f) => !f.askUser && derived.values[f.key]);

  return (
    <Modal open={open} onClose={onClose} title={t('yourInfo')}>
      <p className="mb-3 text-sm text-slate-500">{t('studentIdPrompt')}</p>

      <div className="space-y-3">
        {asked.map((f) => {
          const err = validateField(inputs[f.key] ?? '', f.pattern);
          return (
            <div key={f.key}>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-sm font-medium">{resolveText(f.label, lang)}</span>
                {f.hint ? (
                  <span className="text-xs text-slate-400">{resolveText(f.hint, lang)}</span>
                ) : null}
              </div>
              <TextInput
                value={inputs[f.key] ?? ''}
                placeholder={f.placeholder}
                inputMode={f.kind === 'phone' || f.kind === 'number' ? 'numeric' : undefined}
                onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })}
              />
              {err && (inputs[f.key] ?? '').length > 2 ? (
                <p className="mt-1 text-xs text-amber-600">{err}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {auto.length ? (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <p className="mb-2 text-xs font-semibold text-blue-800">
            系統依你的學號推導出下面這些，請自己確認一次
          </p>
          <dl className="space-y-2">
            {auto.map((f) => (
              <div key={f.key}>
                <dt className="text-xs text-slate-500">{resolveText(f.label, lang)}</dt>
                <dd className="font-medium text-slate-900">{derived.values[f.key]}</dd>
                {derived.reasons[f.key] ? (
                  <dd className="text-xs text-slate-400">
                    {t('derivedFrom')}：{derived.reasons[f.key]}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button variant="ghost" onClick={() => setInputs({})}>
          {t('clearInput')}
        </Button>
        <Button variant="primary" onClick={onClose} className="flex-1">
          {t('done')}
        </Button>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        你輸入的內容只留在這台裝置的這個分頁，關掉就沒了，不會傳到任何伺服器。
      </p>
    </Modal>
  );
}

function DeptDialog({
  open,
  onClose,
  guide,
  lang,
  unlocked,
  setUnlocked,
  t,
}: {
  open: boolean;
  onClose: () => void;
  guide: Guide;
  lang: LangCode;
  unlocked: string[];
  setUnlocked: (v: string[]) => void;
  t: (k: Parameters<ReturnType<typeof makeUi>>[0]) => string;
}) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const tryUnlock = async () => {
    for (const dv of guide.deptViews) {
      if (await verifyPassword(pw, dv.passwordHash)) {
        setUnlocked([...new Set([...unlocked, dv.id])]);
        setPw('');
        setError('');
        onClose();
        return;
      }
    }
    setError(t('wrongPassword'));
  };

  return (
    <Modal open={open} onClose={onClose} title={t('deptUnlock')}>
      <div className="space-y-3">
        <TextInput
          type="password"
          value={pw}
          placeholder={t('deptPassword')}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && tryUnlock()}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button variant="primary" onClick={tryUnlock} className="w-full">
          {t('unlock')}
        </Button>

        {unlocked.length ? (
          <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            已解鎖：
            {guide.deptViews
              .filter((d) => unlocked.includes(d.id))
              .map((d) => resolveText(d.name, lang))
              .join('、')}
          </div>
        ) : null}

        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{t('notSecurity')}</p>
      </div>
    </Modal>
  );
}
