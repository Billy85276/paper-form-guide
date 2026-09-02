/**
 * 實體表單多功能引導系統 — 核心資料模型
 *
 * 設計原則：
 * 1. 一份「引導檔」(Guide) 就是產品的原子單位，可完整序列化成 JSON，
 *    不依賴任何伺服器或資料庫。匯出 / 匯入 / 分享連結 / 單檔 HTML 都是它的投影。
 * 2. 所有座標一律使用「相對百分比 0~100」，相對於該聯的底圖。
 *    這樣同一份標註能同時在手機、桌機、A4 列印上正確對位。
 * 3. 文字一律是 LocalizedText，讓多語成為資料結構的一部分，而不是外掛。
 */

export const SCHEMA_VERSION = 2 as const;

/** 常見於臺灣大專院校的外籍生語言 */
export const LANGS = ['zh-TW', 'en', 'vi', 'ja', 'id', 'th', 'zh-CN'] as const;
export type LangCode = (typeof LANGS)[number];

export const LANG_LABEL: Record<LangCode, string> = {
  'zh-TW': '繁體中文',
  en: 'English',
  vi: 'Tiếng Việt',
  ja: '日本語',
  id: 'Bahasa Indonesia',
  th: 'ภาษาไทย',
  'zh-CN': '简体中文',
};

/** 一段可多語的文字。缺語系時由 resolveText() 依 fallback 鏈回退。 */
export type LocalizedText = Partial<Record<LangCode, string>>;

/* ------------------------------------------------------------------ */
/* 圖片素材                                                            */
/* ------------------------------------------------------------------ */

export interface ImageAsset {
  id: string;
  /** data:URL（匯出時內嵌）或 blob: URL（編輯時由 IndexedDB 還原） */
  src: string;
  width: number;
  height: number;
  /** 位元組數，用來提醒使用者控制分享連結長度 */
  bytes: number;
  name?: string;
}

/* ------------------------------------------------------------------ */
/* 標註區域                                                            */
/* ------------------------------------------------------------------ */

/** 標註外形。checkbox 與 underline 是為了貼近紙本語彙而特化的矩形。 */
export type RegionShape =
  | 'rect'
  | 'ellipse'
  | 'underline'
  | 'checkbox'
  | 'arrow'
  | 'pin';

/**
 * 這一格「要做什麼動作」。決定預設顏色、圖示，以及模擬模式怎麼畫。
 * - fill     寫字
 * - check    打勾
 * - strike   劃線刪除（例如不適用的費用欄整條劃掉）
 * - circle   圈選
 * - stamp    蓋章（通常是承辦人做的，學生不要碰）
 * - readonly 已經印好的內容，只是要你看懂
 * - warning  常見錯誤警告
 */
export type RegionRole =
  | 'fill'
  | 'check'
  | 'strike'
  | 'circle'
  | 'stamp'
  | 'readonly'
  | 'warning';

/** 誰負責這一格。學生端預設只強調 student，staff 的會標成灰色「不用你填」。 */
export type Audience = 'student' | 'staff' | 'both';

export interface RegionStyle {
  /** CSS 顏色。留空時由 role 決定預設色。 */
  color?: string;
  strokeWidth: number;
  /** 螢光呼吸閃爍 */
  pulse: boolean;
  /** 0~1，區域內填色濃度 */
  fillOpacity: number;
  dashed: boolean;
  /** 標號氣泡出現在框的哪一側 */
  labelPos: 'top' | 'bottom' | 'left' | 'right' | 'inside';
  /** 隱藏標號圓圈，只留外框 */
  hideBadge?: boolean;
}

export const DEFAULT_REGION_STYLE: RegionStyle = {
  strokeWidth: 2.5,
  pulse: true,
  fillOpacity: 0.08,
  dashed: false,
  labelPos: 'top',
};

/** 模擬填寫時，這一格要怎麼把使用者輸入畫回紙上 */
export interface HandwritingSpec {
  /** 相對於圖片寬度的字級百分比，預設 2.2 */
  size: number;
  /** 微幅旋轉角度，讓字看起來像人寫的 */
  rotate: number;
  ink: 'blue' | 'black' | 'red';
  align: 'left' | 'center' | 'right';
}

export const DEFAULT_HANDWRITING: HandwritingSpec = {
  size: 2.2,
  rotate: -1,
  ink: 'blue',
  align: 'left',
};

export interface Region {
  id: string;
  /** 對應到哪個邏輯欄位。同一欄位跨多聯時共用說明文字與模擬值。 */
  fieldKey?: string;
  shape: RegionShape;
  /** 左上角 X，百分比 0~100 */
  x: number;
  y: number;
  /** 寬高，百分比 */
  w: number;
  h: number;
  /** arrow 形狀專用：箭頭尾巴起點（百分比） */
  tail?: { x: number; y: number };
  /**
   * 編號圓圈的位置，畫布絕對座標（百分比），不是相對於這個標註的框。
   * 留空時預設貼在框的左上角。設定後可以拖到框外當成指示牌，
   * 這時畫面會自動補一條細線連回框上，讓人看得出它屬於哪一格。
   */
  badgePos?: { x: number; y: number };
  style: RegionStyle;
  role: RegionRole;
  audience: Audience;
  /** 逐步精靈的順序，1 起算 */
  step: number;
  /** 標記上的短標題，例如「系所」 */
  label: LocalizedText;
  /** 完整填寫說明 */
  instruction: LocalizedText;
  /** 正確範例，例如「資網系」 */
  example?: LocalizedText;
  /** 常見錯誤，例如「不要寫資訊工程系全名，格子放不下」 */
  pitfall?: LocalizedText;
  required: boolean;
  /** 只有解鎖某個處室檢視後才看得到 */
  deptOnly?: string;
  /** 模擬填寫設定 */
  handwriting?: HandwritingSpec;
}

/* ------------------------------------------------------------------ */
/* 聯 (Copy) — 複寫單的其中一張                                        */
/* ------------------------------------------------------------------ */

export interface Copy {
  id: string;
  /** 例如「課務組存根聯」 */
  name: LocalizedText;
  /** 這一聯交給誰 */
  goesTo?: LocalizedText;
  /** 分頁標籤顏色 */
  color: string;
  assetId: string;
  regions: Region[];
  note?: LocalizedText;
}

/* ------------------------------------------------------------------ */
/* 邏輯欄位                                                            */
/* ------------------------------------------------------------------ */

export type FieldKind = 'text' | 'number' | 'date' | 'phone' | 'select' | 'bool';

export interface Field {
  /** 程式用的鍵，例如 studentId / name / dept */
  key: string;
  label: LocalizedText;
  kind: FieldKind;
  /** 填寫規則提示，例如「填簡稱即可」 */
  hint?: LocalizedText;
  /** 正規表達式字串，用於即時檢查 */
  pattern?: string;
  placeholder?: string;
  options?: { value: string; label: LocalizedText }[];
  /** 三聯都要寫一樣的內容 */
  sameAcrossCopies: boolean;
  /** 出現在學生輸入面板 */
  askUser: boolean;
}

/* ------------------------------------------------------------------ */
/* 學號規則引擎                                                        */
/* ------------------------------------------------------------------ */

/**
 * 對照表。例如把學號中的系代碼 512 對到「資訊工程系」。
 * entries 的 value 是多語文字，所以外籍生也看得懂自己的系名。
 */
export interface LookupTable {
  id: string;
  name: string;
  entries: Record<string, LocalizedText>;
}

/** 一條推導指派。value 支援 $1 $2 取代 regex 捕獲群組。 */
export interface DeriveAssign {
  fieldKey: string;
  /** 樣板字串，可用 $1..$9 代入捕獲群組 */
  value?: string;
  /** 改為查表：用第 n 個捕獲群組去 lookup 表取值 */
  lookup?: { tableId: string; group: number };
  /** 直接把某些 region 標成「這格你要填這個」 */
  highlightRegionIds?: string[];
}

export interface IdPattern {
  id: string;
  /** 人看的名字，例如「日四技 111 學年入學」 */
  name: string;
  /** 正規表達式來源字串（不含斜線） */
  match: string;
  flags?: string;
  description?: LocalizedText;
  derive: DeriveAssign[];
}

export interface RuleSet {
  /** 觸發推導的欄位鍵，通常是 studentId */
  triggerFieldKey: string;
  patterns: IdPattern[];
  lookups: LookupTable[];
}

/* ------------------------------------------------------------------ */
/* 處室檢視                                                            */
/* ------------------------------------------------------------------ */

export interface DeptView {
  id: string;
  name: LocalizedText;
  /** SHA-256 十六進位。注意：這只是防呆遮蔽，不是資訊安全機制。 */
  passwordHash: string;
  note?: LocalizedText;
}

/* ------------------------------------------------------------------ */
/* 引導檔                                                              */
/* ------------------------------------------------------------------ */

export interface GuideMeta {
  id: string;
  title: LocalizedText;
  updatedAt: string;
  /** 封面縮圖 dataURL，清單用 */
  thumb?: string;
  copyCount: number;
  regionCount: number;
}

export interface Guide {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: LocalizedText;
  subtitle?: LocalizedText;
  org?: string;
  /** 這份表單哪裡拿、交到哪裡、截止日 */
  logistics?: {
    where?: LocalizedText;
    deadline?: LocalizedText;
    contact?: LocalizedText;
  };
  languages: LangCode[];
  defaultLang: LangCode;
  updatedAt: string;
  copies: Copy[];
  fields: Field[];
  rules: RuleSet;
  deptViews: DeptView[];
  simulation: {
    enabled: boolean;
    /** 手寫字型 CSS font-family 串 */
    fontFamily: string;
    jitter: boolean;
  };
  /** 匯出時內嵌；編輯時可能為空，圖片改由 IndexedDB 提供 */
  assets: Record<string, ImageAsset>;
}

/* ------------------------------------------------------------------ */
/* 學生端執行期狀態                                                    */
/* ------------------------------------------------------------------ */

export interface DerivedResult {
  matchedPattern?: IdPattern;
  values: Record<string, string>;
  /** 每個推導值的來源說明，讓學生知道系統為什麼這樣猜 */
  reasons: Record<string, string>;
  highlightRegionIds: string[];
}
