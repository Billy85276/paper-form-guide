import { nanoid } from 'nanoid';
import { bi } from './text';
import {
  DEFAULT_REGION_STYLE,
  SCHEMA_VERSION,
  type Copy,
  type Guide,
  type Region,
  type RegionRole,
} from './types';

export const COPY_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626'];

/** 每個 role 的預設外框色。學生一眼就能靠顏色分辨要做什麼動作。 */
export const ROLE_COLOR: Record<RegionRole, string> = {
  fill: '#2563eb',
  check: '#059669',
  strike: '#e11d48',
  circle: '#d97706',
  stamp: '#94a3b8',
  readonly: '#64748b',
  warning: '#dc2626',
};

export const ROLE_LABEL: Record<RegionRole, string> = {
  fill: '填寫文字',
  check: '打勾',
  strike: '劃線刪除',
  circle: '圈選',
  stamp: '承辦人核章',
  readonly: '只是要你看懂',
  warning: '常見錯誤',
};

export const ROLE_HINT: Record<RegionRole, string> = {
  fill: '在這一格寫字',
  check: '在方框內打勾',
  strike: '整條劃掉表示不適用',
  circle: '把正確的那一個圈起來',
  stamp: '承辦人蓋章，你不用動',
  readonly: '這裡已經印好了，看懂就好',
  warning: '這裡最多人寫錯',
};

export function newRegion(partial: Partial<Region> = {}): Region {
  return {
    id: nanoid(8),
    shape: 'rect',
    x: 30,
    y: 30,
    w: 20,
    h: 8,
    style: { ...DEFAULT_REGION_STYLE },
    role: 'fill',
    audience: 'student',
    step: 1,
    label: {},
    instruction: {},
    required: true,
    ...partial,
  };
}

export function newCopy(assetId: string, index = 0, partial: Partial<Copy> = {}): Copy {
  return {
    id: nanoid(8),
    name: bi(`第 ${index + 1} 聯`),
    color: COPY_COLORS[index % COPY_COLORS.length],
    assetId,
    regions: [],
    ...partial,
  };
}

export function newGuide(stamp: string): Guide {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: nanoid(10),
    title: bi('未命名表單引導'),
    languages: ['zh-TW', 'en'],
    defaultLang: 'zh-TW',
    updatedAt: stamp,
    copies: [],
    fields: [],
    rules: { triggerFieldKey: 'studentId', patterns: [], lookups: [] },
    deptViews: [],
    simulation: {
      enabled: true,
      fontFamily: "'Iansui', 'LXGW WenKai TC', 'Klee One', cursive",
      jitter: true,
    },
    assets: {},
  };
}

/** 重新編號逐步精靈的順序，讓 step 永遠是 1..n 且沒有斷號 */
export function renumberSteps(guide: Guide): Guide {
  let n = 0;
  return {
    ...guide,
    copies: guide.copies.map((c) => ({
      ...c,
      regions: [...c.regions]
        .sort((a, b) => a.step - b.step)
        .map((r) => {
          n += 1;
          return { ...r, step: n };
        }),
    })),
  };
}

/** 所有聯的標註攤平成一維，附上所屬聯，逐步精靈與匯出都用它 */
export function flatRegions(guide: Guide): { region: Region; copy: Copy; copyIndex: number }[] {
  const out: { region: Region; copy: Copy; copyIndex: number }[] = [];
  guide.copies.forEach((copy, copyIndex) => {
    for (const region of copy.regions) out.push({ region, copy, copyIndex });
  });
  return out.sort((a, b) => a.region.step - b.region.step);
}
