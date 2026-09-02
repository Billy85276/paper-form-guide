import type { LangCode } from './types';

/**
 * 介面文字
 *
 * 使用者自己寫的標註內容存在 Guide 裡，這裡只放介面本身的字。
 * 刻意不用 i18n 框架：字串數量固定、沒有複數變化、沒有動態載入需求，
 * 一個型別安全的字典物件就夠了，還省掉一整包相依。
 */

export type UiKey =
  | 'appName'
  | 'appTagline'
  | 'back'
  | 'overview'
  | 'wizard'
  | 'simulate'
  | 'guideMode'
  | 'language'
  | 'step'
  | 'of'
  | 'next'
  | 'prev'
  | 'done'
  | 'copyTab'
  | 'goesTo'
  | 'youFill'
  | 'staffFills'
  | 'required'
  | 'optional'
  | 'example'
  | 'pitfall'
  | 'yourInfo'
  | 'studentIdPrompt'
  | 'derivedFrom'
  | 'clearInput'
  | 'showFilled'
  | 'showBlank'
  | 'printPdf'
  | 'downloadPng'
  | 'downloadOffline'
  | 'share'
  | 'deptUnlock'
  | 'deptPassword'
  | 'unlock'
  | 'wrongPassword'
  | 'notSecurity'
  | 'summaryTitle'
  | 'summaryCopies'
  | 'summaryYours'
  | 'summaryStaff'
  | 'tapAnyMarker'
  | 'whereToGet'
  | 'deadline'
  | 'contact'
  | 'loading'
  | 'loadFailed'
  | 'noGuide'
  | 'zoomHint'
  | 'closeDetail'
  | 'allSteps'
  | 'checklist'
  | 'checklistDone';

type Dict = Record<UiKey, string>;

const zhTW: Dict = {
  appName: '實體表單引導',
  appTagline: '照著螢幕，把列印表單填對',
  back: '返回',
  overview: '總覽',
  wizard: '逐步精靈',
  simulate: '模擬完成',
  guideMode: '填寫引導',
  language: '語言',
  step: '第',
  of: '步，共',
  next: '下一步',
  prev: '上一步',
  done: '完成',
  copyTab: '聯',
  goesTo: '這一聯交給',
  youFill: '你要填',
  staffFills: '承辦人填，你不要動',
  required: '必填',
  optional: '選填',
  example: '正確範例',
  pitfall: '最多人寫錯',
  yourInfo: '你的資料',
  studentIdPrompt: '輸入學號，系統幫你判斷學制與系所',
  derivedFrom: '推導依據',
  clearInput: '清空',
  showFilled: '看填好的樣子',
  showBlank: '看空白引導',
  printPdf: '列印或存成 PDF',
  downloadPng: '下載圖片',
  downloadOffline: '下載離線版',
  share: '分享',
  deptUnlock: '處室內部檢視',
  deptPassword: '處室密碼',
  unlock: '解鎖',
  wrongPassword: '密碼不對',
  notSecurity: '這只是避免學生誤看，不是資安機制',
  summaryTitle: '開始之前',
  summaryCopies: '這份表單共',
  summaryYours: '你要填',
  summaryStaff: '承辦人填',
  tapAnyMarker: '點任何一個標記看說明',
  whereToGet: '哪裡拿表單',
  deadline: '什麼時候要交',
  contact: '問誰',
  loading: '載入中',
  loadFailed: '載入失敗',
  noGuide: '找不到這份引導',
  zoomHint: '雙指縮放可以放大',
  closeDetail: '關閉',
  allSteps: '全部步驟',
  checklist: '出門前檢查',
  checklistDone: '都填好了',
};

const en: Dict = {
  appName: 'Paper Form Guide',
  appTagline: 'Fill in the printed form correctly, guided on screen',
  back: 'Back',
  overview: 'Overview',
  wizard: 'Step by step',
  simulate: 'Filled example',
  guideMode: 'Guide',
  language: 'Language',
  step: 'Step',
  of: 'of',
  next: 'Next',
  prev: 'Back',
  done: 'Done',
  copyTab: 'Copy',
  goesTo: 'This copy goes to',
  youFill: 'You fill this in',
  staffFills: 'Staff fill this in, do not write here',
  required: 'Required',
  optional: 'Optional',
  example: 'Correct example',
  pitfall: 'Most common mistake',
  yourInfo: 'Your details',
  studentIdPrompt: 'Enter your student ID and the system works out your programme and department',
  derivedFrom: 'Worked out from',
  clearInput: 'Clear',
  showFilled: 'Show it filled in',
  showBlank: 'Show the blank guide',
  printPdf: 'Print or save as PDF',
  downloadPng: 'Download images',
  downloadOffline: 'Download offline copy',
  share: 'Share',
  deptUnlock: 'Staff view',
  deptPassword: 'Staff password',
  unlock: 'Unlock',
  wrongPassword: 'Wrong password',
  notSecurity: 'This only hides notes from students. It is not a security control.',
  summaryTitle: 'Before you start',
  summaryCopies: 'This form has',
  summaryYours: 'you fill in',
  summaryStaff: 'staff fill in',
  tapAnyMarker: 'Tap any marker to see the instructions',
  whereToGet: 'Where to get the form',
  deadline: 'When it is due',
  contact: 'Who to ask',
  loading: 'Loading',
  loadFailed: 'Could not load',
  noGuide: 'Guide not found',
  zoomHint: 'Pinch to zoom in',
  closeDetail: 'Close',
  allSteps: 'All steps',
  checklist: 'Check before you go',
  checklistDone: 'All filled in',
};

/**
 * 其餘語系。缺的鍵會自動回退到英文，所以即使翻譯不完整畫面也不會開天窗。
 */
const partials: Partial<Record<LangCode, Partial<Dict>>> = {
  vi: {
    appName: 'Hướng dẫn điền đơn',
    appTagline: 'Nhìn màn hình, điền đúng bản in',
    back: 'Quay lại',
    overview: 'Tổng quan',
    wizard: 'Từng bước',
    simulate: 'Mẫu đã điền',
    guideMode: 'Hướng dẫn',
    language: 'Ngôn ngữ',
    step: 'Bước',
    of: '/',
    next: 'Tiếp',
    prev: 'Quay lại',
    done: 'Xong',
    copyTab: 'Liên',
    goesTo: 'Liên này nộp cho',
    youFill: 'Bạn điền ô này',
    staffFills: 'Cán bộ điền, bạn đừng ghi',
    required: 'Bắt buộc',
    optional: 'Không bắt buộc',
    example: 'Ví dụ đúng',
    pitfall: 'Lỗi hay gặp nhất',
    yourInfo: 'Thông tin của bạn',
    studentIdPrompt: 'Nhập mã sinh viên, hệ thống tự suy ra hệ và khoa',
    derivedFrom: 'Suy ra từ',
    clearInput: 'Xóa',
    showFilled: 'Xem bản đã điền',
    showBlank: 'Xem bản trống',
    printPdf: 'In hoặc lưu PDF',
    downloadPng: 'Tải ảnh',
    downloadOffline: 'Tải bản ngoại tuyến',
    share: 'Chia sẻ',
    deptUnlock: 'Chế độ cán bộ',
    deptPassword: 'Mật khẩu cán bộ',
    unlock: 'Mở khóa',
    wrongPassword: 'Sai mật khẩu',
    notSecurity: 'Chỉ để giấu ghi chú với sinh viên, không phải bảo mật.',
    summaryTitle: 'Trước khi bắt đầu',
    summaryCopies: 'Đơn này có',
    summaryYours: 'bạn điền',
    summaryStaff: 'cán bộ điền',
    tapAnyMarker: 'Chạm vào dấu bất kỳ để xem hướng dẫn',
    whereToGet: 'Lấy đơn ở đâu',
    deadline: 'Hạn nộp khi nào',
    contact: 'Hỏi ai',
    loading: 'Đang tải',
    loadFailed: 'Tải không được',
    noGuide: 'Không thấy hướng dẫn này',
    zoomHint: 'Chụm hai ngón để phóng to',
    closeDetail: 'Đóng',
    allSteps: 'Tất cả các bước',
    checklist: 'Kiểm tra trước khi đi',
    checklistDone: 'Đã điền đủ',
  },
  ja: {
    appName: '紙の書類ガイド',
    appTagline: '画面のとおりに書けば大丈夫',
    back: '戻る',
    overview: '全体',
    wizard: 'ステップごと',
    simulate: '記入例',
    guideMode: 'ガイド',
    language: '言語',
    step: 'ステップ',
    of: '/',
    next: '次へ',
    prev: '前へ',
    done: '完了',
    copyTab: '複写',
    goesTo: 'この用紙の提出先',
    youFill: 'ここはあなたが記入',
    staffFills: '職員が記入。書かないで',
    required: '必須',
    optional: '任意',
    example: '正しい記入例',
    pitfall: 'よくある間違い',
    yourInfo: 'あなたの情報',
    studentIdPrompt: '学籍番号を入れると課程と学科を判定します',
    derivedFrom: '判定の根拠',
    clearInput: 'クリア',
    showFilled: '記入済みを見る',
    showBlank: '白紙ガイドを見る',
    printPdf: '印刷・PDF保存',
    downloadPng: '画像を保存',
    downloadOffline: 'オフライン版を保存',
    share: '共有',
    deptUnlock: '職員用表示',
    deptPassword: '職員パスワード',
    unlock: '解除',
    wrongPassword: 'パスワードが違います',
    notSecurity: '学生に注記を見せないだけで、セキュリティ機能ではありません',
    summaryTitle: '始める前に',
    summaryCopies: 'この書類は',
    summaryYours: 'あなたが記入',
    summaryStaff: '職員が記入',
    tapAnyMarker: '印をタップすると説明が出ます',
    whereToGet: '用紙のもらい方',
    deadline: '提出期限',
    contact: '問い合わせ先',
    loading: '読み込み中',
    loadFailed: '読み込めません',
    noGuide: 'ガイドが見つかりません',
    zoomHint: 'ピンチで拡大できます',
    closeDetail: '閉じる',
    allSteps: '全ステップ',
    checklist: '出発前チェック',
    checklistDone: '全部記入済み',
  },
  id: {
    appName: 'Panduan Formulir Kertas',
    appTagline: 'Ikuti layar, isi formulirnya dengan benar',
    back: 'Kembali',
    overview: 'Ringkasan',
    wizard: 'Langkah demi langkah',
    simulate: 'Contoh terisi',
    guideMode: 'Panduan',
    language: 'Bahasa',
    step: 'Langkah',
    of: 'dari',
    next: 'Lanjut',
    prev: 'Kembali',
    done: 'Selesai',
    copyTab: 'Rangkap',
    goesTo: 'Rangkap ini untuk',
    youFill: 'Kamu yang isi',
    staffFills: 'Diisi petugas, jangan ditulis',
    required: 'Wajib',
    optional: 'Opsional',
    example: 'Contoh yang benar',
    pitfall: 'Kesalahan paling sering',
    yourInfo: 'Data kamu',
    studentIdPrompt: 'Masukkan NIM, sistem menentukan jenjang dan jurusanmu',
    derivedFrom: 'Diambil dari',
    clearInput: 'Hapus',
    showFilled: 'Lihat versi terisi',
    showBlank: 'Lihat panduan kosong',
    printPdf: 'Cetak atau simpan PDF',
    downloadPng: 'Unduh gambar',
    downloadOffline: 'Unduh versi offline',
    share: 'Bagikan',
    deptUnlock: 'Tampilan petugas',
    deptPassword: 'Kata sandi petugas',
    unlock: 'Buka',
    wrongPassword: 'Kata sandi salah',
    notSecurity: 'Ini cuma menyembunyikan catatan dari mahasiswa, bukan pengaman.',
    summaryTitle: 'Sebelum mulai',
    summaryCopies: 'Formulir ini punya',
    summaryYours: 'kamu isi',
    summaryStaff: 'petugas isi',
    tapAnyMarker: 'Ketuk penanda mana pun untuk lihat petunjuk',
    whereToGet: 'Ambil formulir di mana',
    deadline: 'Batas waktunya kapan',
    contact: 'Tanya siapa',
    loading: 'Memuat',
    loadFailed: 'Gagal memuat',
    noGuide: 'Panduan tidak ditemukan',
    zoomHint: 'Cubit layar untuk memperbesar',
    closeDetail: 'Tutup',
    allSteps: 'Semua langkah',
    checklist: 'Cek sebelum berangkat',
    checklistDone: 'Sudah terisi semua',
  },
  th: {
    appName: 'คู่มือกรอกแบบฟอร์ม',
    appTagline: 'ดูหน้าจอ แล้วกรอกฉบับพิมพ์ให้ถูก',
    back: 'ย้อนกลับ',
    overview: 'ภาพรวม',
    wizard: 'ทีละขั้น',
    simulate: 'ตัวอย่างที่กรอกแล้ว',
    guideMode: 'คู่มือ',
    language: 'ภาษา',
    step: 'ขั้นที่',
    of: 'จาก',
    next: 'ถัดไป',
    prev: 'ก่อนหน้า',
    done: 'เสร็จ',
    copyTab: 'ฉบับ',
    goesTo: 'ฉบับนี้ส่งให้',
    youFill: 'ช่องนี้คุณกรอก',
    staffFills: 'เจ้าหน้าที่กรอก อย่าเขียน',
    required: 'ต้องกรอก',
    optional: 'ไม่บังคับ',
    example: 'ตัวอย่างที่ถูก',
    pitfall: 'ที่ผิดกันมากที่สุด',
    yourInfo: 'ข้อมูลของคุณ',
    studentIdPrompt: 'ใส่รหัสนักศึกษา ระบบจะบอกระดับและสาขาให้',
    derivedFrom: 'ดูจาก',
    clearInput: 'ล้าง',
    showFilled: 'ดูแบบกรอกแล้ว',
    showBlank: 'ดูแบบเปล่า',
    printPdf: 'พิมพ์หรือบันทึก PDF',
    downloadPng: 'ดาวน์โหลดรูป',
    downloadOffline: 'ดาวน์โหลดใช้ออฟไลน์',
    share: 'แชร์',
    deptUnlock: 'มุมมองเจ้าหน้าที่',
    deptPassword: 'รหัสผ่านเจ้าหน้าที่',
    unlock: 'ปลดล็อก',
    wrongPassword: 'รหัสผ่านไม่ถูก',
    notSecurity: 'แค่ซ่อนโน้ตจากนักศึกษา ไม่ใช่ระบบความปลอดภัย',
    summaryTitle: 'ก่อนเริ่ม',
    summaryCopies: 'แบบฟอร์มนี้มี',
    summaryYours: 'คุณกรอก',
    summaryStaff: 'เจ้าหน้าที่กรอก',
    tapAnyMarker: 'แตะจุดไหนก็ได้เพื่อดูคำอธิบาย',
    whereToGet: 'รับแบบฟอร์มที่ไหน',
    deadline: 'ส่งเมื่อไร',
    contact: 'ถามใคร',
    loading: 'กำลังโหลด',
    loadFailed: 'โหลดไม่สำเร็จ',
    noGuide: 'ไม่พบคู่มือนี้',
    zoomHint: 'ใช้สองนิ้วซูมเข้าได้',
    closeDetail: 'ปิด',
    allSteps: 'ทุกขั้นตอน',
    checklist: 'เช็คก่อนออกจากบ้าน',
    checklistDone: 'กรอกครบแล้ว',
  },
  'zh-CN': {
    appName: '纸质表单引导',
    appTagline: '照着屏幕，把打印表格填对',
    back: '返回',
    overview: '总览',
    wizard: '逐步向导',
    simulate: '模拟完成',
    guideMode: '填写引导',
    language: '语言',
    step: '第',
    of: '步，共',
    next: '下一步',
    prev: '上一步',
    done: '完成',
    copyTab: '联次',
    goesTo: '这一联交给',
    youFill: '你要填',
    staffFills: '经办人填，你别动',
    required: '必填',
    optional: '选填',
    example: '正确示例',
    pitfall: '最多人填错',
    yourInfo: '你的信息',
    studentIdPrompt: '输入学号，系统帮你判断学制与院系',
    derivedFrom: '推导依据',
    clearInput: '清空',
    showFilled: '看填好的样子',
    showBlank: '看空白引导',
    printPdf: '打印或存成 PDF',
    downloadPng: '下载图片',
    downloadOffline: '下载离线版',
    share: '分享',
    deptUnlock: '部门内部查看',
    deptPassword: '部门密码',
    unlock: '解锁',
    wrongPassword: '密码不对',
    notSecurity: '这只是避免学生误看，不是安全机制',
    summaryTitle: '开始之前',
    summaryCopies: '这份表单共',
    summaryYours: '你要填',
    summaryStaff: '经办人填',
    tapAnyMarker: '点任意标记看说明',
    whereToGet: '哪里领表',
    deadline: '什么时候交',
    contact: '问谁',
    loading: '加载中',
    loadFailed: '加载失败',
    noGuide: '找不到这份引导',
    zoomHint: '双指缩放可以放大',
    closeDetail: '关闭',
    allSteps: '全部步骤',
    checklist: '出门前检查',
    checklistDone: '都填好了',
  },
};

const TABLE: Record<LangCode, Dict> = {
  'zh-TW': zhTW,
  en,
  vi: { ...en, ...(partials.vi ?? {}) },
  ja: { ...en, ...(partials.ja ?? {}) },
  id: { ...en, ...(partials.id ?? {}) },
  th: { ...en, ...(partials.th ?? {}) },
  'zh-CN': { ...zhTW, ...(partials['zh-CN'] ?? {}) },
};

export function ui(lang: LangCode, key: UiKey): string {
  return TABLE[lang]?.[key] ?? en[key] ?? key;
}

export function makeUi(lang: LangCode) {
  return (key: UiKey) => ui(lang, key);
}
