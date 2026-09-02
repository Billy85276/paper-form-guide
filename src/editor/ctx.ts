import type { Guide, LangCode } from '../lib/types';

/**
 * 編輯臺各面板共用的操作介面。
 *
 * 所有面板都只透過這個介面改資料，不各自持有狀態。
 * 這樣「改了什麼」永遠只有一條路徑，自動存檔與復原才不會有漏網之魚。
 */
export interface EditorCtx {
  guide: Guide;
  /** 以函式更新，避免面板拿到過期的 guide 造成覆蓋 */
  update: (fn: (g: Guide) => Guide) => void;
  /** 目前正在編輯哪一個語系的文字 */
  lang: LangCode;
  setLang: (l: LangCode) => void;
  /** 目前選中的標註 */
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  /** 目前正在編輯哪一聯 */
  copyIndex: number;
  setCopyIndex: (i: number) => void;
  /** 顯示一則短暫的提示訊息 */
  toast: (message: string) => void;
}
