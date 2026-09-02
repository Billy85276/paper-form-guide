import { nanoid } from 'nanoid';
import { cropImage, processUpload } from './image';
import { sha256Hex } from './share';
import { putAsset } from './storage';
import { DEFAULT_REGION_STYLE, type Guide, type Region, type RegionRole } from './types';

/**
 * 內建示範引導檔：暑修繳費單（三聯複寫單）
 *
 * 底圖 `sample-form-demo.jpg` 是純手繪產生的示範表單，
 * 不是任何真實學校的照片，人名、電話、學號、系所全部是虛構的，
 * 圖上還蓋了一個「範例」章，避免有人誤把它當成真的單據使用。
 * 這是刻意的選擇：範例資料絕對不能用真人資料，即使只是用來示範。
 *
 * 示範同時展示四件事：
 *   1. 一張照片切成兩聯，各自獨立標註
 *   2. 同一個欄位在兩聯都要重複寫（複寫單的核心困惑）
 *   3. 承辦人才填的核章區，明確標成「你不要動」
 *   4. 學號規則引擎推導學制與系所，並附上推導理由
 */

const DEMO_PASSWORD = 'DEMO2026';

function r(partial: Partial<Region> & { id: string; step: number }): Region {
  return {
    shape: 'rect',
    x: 0,
    y: 0,
    w: 10,
    h: 5,
    style: { ...DEFAULT_REGION_STYLE },
    role: 'fill' as RegionRole,
    audience: 'student',
    label: {},
    instruction: {},
    required: true,
    ...partial,
  };
}

/** 課務組存根聯的標註。座標是相對於「裁切後那一聯」的百分比。 */
function stubRegions(): Region[] {
  return [
    r({
      id: 'd-copytag',
      step: 1,
      shape: 'rect',
      x: 74,
      y: 4,
      w: 20,
      h: 12,
      role: 'readonly',
      audience: 'both',
      required: false,
      style: { ...DEFAULT_REGION_STYLE, pulse: false, fillOpacity: 0.05 },
      label: { 'zh-TW': '先看這裡', en: 'Read this first', vi: 'Xem chỗ này trước' },
      instruction: {
        'zh-TW': '這行字告訴你手上這一聯要交給誰。這張是課務組存根聯，填完會被課務組收走。整張單子有三聯，內容一模一樣，三聯都要寫。',
        en: 'This line tells you who keeps this copy. This one goes to the Curriculum Section. The form has three identical copies and you must fill in all of them.',
        vi: 'Dòng này cho biết liên này nộp cho ai. Liên này thuộc Phòng Giáo vụ. Biểu mẫu có ba liên giống nhau, bạn phải điền cả ba.',
      },
      pitfall: {
        'zh-TW': '很多人以為是複寫紙寫一張就好。這種分開的三聯不會複寫，每一聯都要自己寫一次。',
        en: 'Many people assume it is carbon paper. These three copies are separate, so write on each one.',
        vi: 'Nhiều người tưởng là giấy than. Ba liên này tách rời, phải viết từng liên.',
      },
    }),
    r({
      id: 'd-program',
      step: 2,
      shape: 'checkbox',
      x: 16.5,
      y: 19,
      w: 13.5,
      h: 20,
      role: 'check',
      fieldKey: 'program',
      label: { 'zh-TW': '學制', en: 'Program', vi: 'Hệ đào tạo' },
      instruction: {
        'zh-TW': '在你自己的學制前面打勾，只勾一個。日間部四年制技術學院就是「日四技」。輸入學號後系統會幫你判斷。',
        en: 'Tick exactly one program. Day-division four-year technical program is the first box. Enter your student ID and the system will work it out.',
        vi: 'Đánh dấu đúng một hệ. Hệ bốn năm ban ngày là ô đầu tiên. Nhập mã sinh viên để hệ thống tự xác định.',
      },
      example: { 'zh-TW': '日四技 打勾', en: 'Tick 日四技', vi: 'Đánh dấu 日四技' },
      pitfall: {
        'zh-TW': '用打勾，不要畫圈也不要畫正字。勾錯學制會被退件重寫。',
        en: 'Use a tick mark, not a circle. A wrong program means the form is returned.',
        vi: 'Dùng dấu tích, không khoanh tròn. Sai hệ sẽ bị trả lại.',
      },
      handwriting: { size: 2.6, rotate: -3, ink: 'blue', align: 'left' },
    }),
    r({
      id: 'd-dept',
      step: 3,
      shape: 'rect',
      x: 30,
      y: 19,
      w: 15,
      h: 20,
      role: 'fill',
      fieldKey: 'deptShort',
      label: { 'zh-TW': '系別班級', en: 'Department and class', vi: 'Khoa và lớp' },
      instruction: {
        'zh-TW': '填系所簡稱就好，例如「資工系」。格子只有三到四個字的寬度，寫全名會寫不下。年級和班別寫在下面兩條線上。',
        en: 'Write the short department name only, for example 資工系. The box fits three or four characters. Put your year and class on the two lines below.',
        vi: 'Chỉ ghi tên viết tắt của khoa, ví dụ 資工系. Ô chỉ đủ ba đến bốn chữ. Ghi năm học và lớp ở hai dòng bên dưới.',
      },
      example: { 'zh-TW': '資工系 / 四年甲班', en: '資工系 / Year 4 Class A', vi: '資工系 / Năm 4 lớp A' },
      pitfall: {
        'zh-TW': '不要寫「資訊工程系」全名，格子放不下，承辦人也只看簡稱。',
        en: 'Do not write the full name 資訊工程系. It does not fit and staff only read the short form.',
        vi: 'Đừng ghi tên đầy đủ 資訊工程系, sẽ không vừa ô.',
      },
      handwriting: { size: 2.4, rotate: -1.5, ink: 'blue', align: 'center' },
    }),
    r({
      id: 'd-sid',
      step: 4,
      shape: 'rect',
      x: 45.5,
      y: 19,
      w: 13,
      h: 18,
      role: 'fill',
      fieldKey: 'studentId',
      label: { 'zh-TW': '學號', en: 'Student ID', vi: 'Mã sinh viên' },
      instruction: {
        'zh-TW': '照學生證上的完整學號抄，一個英文字母加十個數字。這一格寫錯，繳費紀錄就掛不到你身上。',
        en: 'Copy the full student ID from your student card: one letter followed by ten digits. A mistake here means your payment will not be matched to you.',
        vi: 'Chép đầy đủ mã sinh viên trên thẻ: một chữ cái và mười chữ số. Sai ô này thì khoản nộp sẽ không khớp với bạn.',
      },
      example: { 'zh-TW': 'D1105123456' },
      handwriting: { size: 2.1, rotate: -1, ink: 'blue', align: 'left' },
    }),
    r({
      id: 'd-name',
      step: 5,
      shape: 'rect',
      x: 58.8,
      y: 17,
      w: 14.7,
      h: 19,
      role: 'fill',
      fieldKey: 'name',
      label: { 'zh-TW': '姓名', en: 'Name', vi: 'Họ tên' },
      instruction: {
        'zh-TW': '寫身分證或居留證上的正式姓名，不要寫綽號或英文名。外籍生請寫護照上的拼音全名。',
        en: 'Write your legal name as on your ID or resident certificate. International students should write the full romanised name on the passport.',
        vi: 'Ghi họ tên chính thức như trên giấy tờ tuỳ thân. Sinh viên quốc tế ghi tên đầy đủ theo hộ chiếu.',
      },
      handwriting: { size: 2.6, rotate: -2, ink: 'blue', align: 'left' },
    }),
    r({
      id: 'd-phone',
      step: 6,
      shape: 'rect',
      x: 73.8,
      y: 17,
      w: 19,
      h: 19,
      role: 'fill',
      fieldKey: 'phone',
      label: { 'zh-TW': '手機', en: 'Mobile', vi: 'Điện thoại' },
      instruction: {
        'zh-TW': '寫本人現在用得到的手機號碼，十碼。課程若因人數不足取消，課務組會直接打這支電話。',
        en: 'Write a mobile number you actually use, ten digits. If the class is cancelled for low enrolment the office calls this number.',
        vi: 'Ghi số điện thoại bạn đang dùng, mười chữ số. Nếu lớp bị huỷ, văn phòng sẽ gọi số này.',
      },
      example: { 'zh-TW': '0912345678' },
      handwriting: { size: 2.1, rotate: -1, ink: 'blue', align: 'left' },
    }),
    r({
      id: 'd-courses',
      step: 7,
      shape: 'rect',
      x: 16.5,
      y: 39,
      w: 42,
      h: 41,
      role: 'check',
      fieldKey: 'courses',
      label: { 'zh-TW': '勾選科目', en: 'Tick your courses', vi: 'Chọn môn học' },
      instruction: {
        'zh-TW': '勾選你這次要暑修的科目，可以勾多科。上面幾列是四技的科目，標了「五專」的那三列是五專生才勾的，四技生不要勾。',
        en: 'Tick the courses you are taking this summer. You may tick more than one. The rows marked 五專 are for the five-year junior college programme only.',
        vi: 'Đánh dấu các môn học hè, có thể chọn nhiều môn. Các dòng ghi 五專 chỉ dành cho hệ cao đẳng năm năm.',
      },
      example: { 'zh-TW': '共通專業英文(一) 與 基礎數學 各打一個勾' },
      pitfall: {
        'zh-TW': '勾之前先確認這科能不能抵你的畢業學分。單子上有寫，一旦繳費就不退費。',
        en: 'Check the course counts towards your graduation credits first. Fees are not refundable once paid.',
        vi: 'Kiểm tra môn có tính vào tín chỉ tốt nghiệp không. Đã nộp tiền thì không hoàn lại.',
      },
      handwriting: { size: 2.6, rotate: -3, ink: 'blue', align: 'left' },
    }),
    r({
      id: 'd-fee',
      step: 8,
      shape: 'rect',
      x: 58.8,
      y: 38,
      w: 34,
      h: 42,
      role: 'strike',
      fieldKey: 'fee',
      label: { 'zh-TW': '費用欄', en: 'Fee column', vi: 'Cột học phí' },
      instruction: {
        'zh-TW': '左邊那欄是四技的金額，右邊是五專的。勾選你對應的金額，另一欄整個劃一條斜線表示不適用。金額依你勾的科目而定。',
        en: 'The left column is the four-year programme fee, the right one is for the five-year college. Tick your amount and strike through the other column with one diagonal line.',
        vi: 'Cột trái là học phí hệ bốn năm, cột phải là hệ năm năm. Chọn số tiền của bạn và gạch chéo cột còn lại.',
      },
      pitfall: {
        'zh-TW': '不要兩欄都填。承辦人看到兩欄都有字會請你重寫一張。',
        en: 'Do not fill both columns. Staff will make you rewrite the form.',
        vi: 'Đừng điền cả hai cột, nhân viên sẽ bắt viết lại.',
      },
      handwriting: { size: 2.4, rotate: -2, ink: 'red', align: 'center' },
    }),
    r({
      id: 'd-stamp',
      step: 9,
      shape: 'ellipse',
      x: 47.5,
      y: 63,
      w: 11,
      h: 18,
      role: 'stamp',
      audience: 'staff',
      required: false,
      style: { ...DEFAULT_REGION_STYLE, color: '#e11d48', strokeWidth: 3, fillOpacity: 0.1 },
      label: { 'zh-TW': '承辦人核章', en: 'Staff stamp', vi: 'Dấu của nhân viên' },
      instruction: {
        'zh-TW': '這個紅圈和旁邊的紅字金額是櫃檯承辦人蓋的，你不要碰。如果你先寫了，這張單子就作廢。',
        en: 'This red stamp and the red amount beside it are added by the counter staff. Do not write here. If you do, the form is void.',
        vi: 'Con dấu đỏ và số tiền màu đỏ do nhân viên quầy ghi. Đừng viết vào đây, nếu không biểu mẫu sẽ bị huỷ.',
      },
    }),
    r({
      id: 'd-official',
      step: 10,
      shape: 'ellipse',
      x: 72.5,
      y: 76,
      w: 12,
      h: 22,
      role: 'stamp',
      audience: 'staff',
      required: false,
      style: { ...DEFAULT_REGION_STYLE, color: '#3b82f6', strokeWidth: 3, fillOpacity: 0.08 },
      label: { 'zh-TW': '教務處關防', en: 'Office seal', vi: 'Dấu của phòng đào tạo' },
      instruction: {
        'zh-TW': '教務處課務組的藍色關防，是這張單子有效的證明。沒有這個章的單子不能拿去繳費。',
        en: 'The blue seal of the Curriculum Section proves the form is valid. A form without it cannot be used to pay.',
        vi: 'Con dấu xanh của Phòng Giáo vụ chứng minh biểu mẫu hợp lệ. Không có dấu này thì không nộp tiền được.',
      },
    }),
    r({
      id: 'd-notice',
      step: 11,
      shape: 'underline',
      x: 16.5,
      y: 80,
      w: 42,
      h: 15,
      role: 'warning',
      audience: 'both',
      required: false,
      label: { 'zh-TW': '不退費條款', en: 'No refund', vi: 'Không hoàn tiền' },
      instruction: {
        'zh-TW': '這兩行是不退費條款，繳費前務必看懂。一旦繳費就不能以任何理由要求退費，而且要自己確認這門課能不能列入畢業學分。',
        en: 'These two lines say the fee is non-refundable for any reason, and that you are responsible for checking the course counts towards graduation.',
        vi: 'Hai dòng này nói học phí không hoàn lại vì bất kỳ lý do gì, và bạn tự chịu trách nhiệm kiểm tra tín chỉ.',
      },
    }),
  ];
}

/** 學生存根聯的標註。內容與存根聯幾乎相同，重點在提醒「這裡要再寫一次」。 */
function studentRegions(): Region[] {
  const dup = (
    id: string,
    step: number,
    x: number,
    y: number,
    w: number,
    h: number,
    label: Region['label'],
    fieldKey?: string,
  ): Region =>
    r({
      id,
      step,
      x,
      y,
      w,
      h,
      fieldKey,
      label,
      role: 'fill',
      instruction: {
        'zh-TW': '和上一聯寫一模一樣的內容。這一聯是你自己留存的，繳完費請收好，之後查詢或申訴都要靠它。',
        en: 'Write exactly the same content as the previous copy. Keep this one yourself after paying; you will need it for any enquiry.',
        vi: 'Ghi nội dung giống hệt liên trước. Giữ liên này sau khi nộp tiền để tra cứu về sau.',
      },
      handwriting: { size: 2.3, rotate: -1.5, ink: 'blue', align: 'left' },
    });

  return [
    r({
      id: 's-copytag',
      step: 12,
      x: 74,
      y: 1,
      w: 20,
      h: 10,
      role: 'readonly',
      audience: 'both',
      required: false,
      style: { ...DEFAULT_REGION_STYLE, pulse: false, fillOpacity: 0.05 },
      label: { 'zh-TW': '這聯你自己留', en: 'You keep this copy', vi: 'Liên này bạn giữ' },
      instruction: {
        'zh-TW': '這一聯寫著「學生存根聯」，繳完費之後由你自己保存，不要交出去。',
        en: 'This copy is marked as the student stub. Keep it after paying, do not hand it in.',
        vi: 'Liên này ghi là bản lưu của sinh viên. Giữ lại sau khi nộp tiền, đừng nộp đi.',
      },
    }),
    dup('s-program', 13, 16.5, 11, 13.5, 20, { 'zh-TW': '學制（再勾一次）', en: 'Program again', vi: 'Hệ đào tạo (lần nữa)' }, 'program'),
    dup('s-dept', 14, 30, 11, 15, 20, { 'zh-TW': '系別班級（再寫一次）', en: 'Department again', vi: 'Khoa (lần nữa)' }, 'deptShort'),
    dup('s-sid', 15, 45.5, 11, 13, 18, { 'zh-TW': '學號（再寫一次）', en: 'Student ID again', vi: 'Mã sinh viên (lần nữa)' }, 'studentId'),
    dup('s-name', 16, 58.8, 10, 14.7, 19, { 'zh-TW': '姓名（再寫一次）', en: 'Name again', vi: 'Họ tên (lần nữa)' }, 'name'),
    dup('s-phone', 17, 73.8, 10, 19, 19, { 'zh-TW': '手機（再寫一次）', en: 'Mobile again', vi: 'Điện thoại (lần nữa)' }, 'phone'),
    r({
      id: 's-courses',
      step: 18,
      x: 16.5,
      y: 32,
      w: 42,
      h: 42,
      role: 'check',
      fieldKey: 'courses',
      label: { 'zh-TW': '勾選科目（再勾一次）', en: 'Courses again', vi: 'Môn học (lần nữa)' },
      instruction: {
        'zh-TW': '勾的科目必須和上一聯完全一致。兩聯不一致時，承辦人會以課務組存根聯為準。',
        en: 'The ticked courses must match the previous copy exactly. If they differ, the office copy wins.',
        vi: 'Các môn đã chọn phải giống hệt liên trước. Nếu khác nhau, liên của văn phòng có hiệu lực.',
      },
      handwriting: { size: 2.6, rotate: -3, ink: 'blue', align: 'left' },
    }),
    r({
      id: 's-fee',
      step: 19,
      x: 58.8,
      y: 31,
      w: 34,
      h: 44,
      role: 'strike',
      fieldKey: 'fee',
      label: { 'zh-TW': '費用欄（再劃一次）', en: 'Fee column again', vi: 'Cột học phí (lần nữa)' },
      instruction: {
        'zh-TW': '一樣勾你的金額，另一欄劃一條斜線。兩聯的斜線方向不用一致，看得懂就好。',
        en: 'Tick your amount again and strike the other column. The direction of the line does not matter.',
        vi: 'Chọn số tiền và gạch chéo cột còn lại như liên trước.',
      },
      handwriting: { size: 2.4, rotate: -2, ink: 'red', align: 'center' },
    }),
    r({
      id: 's-stamp',
      step: 20,
      shape: 'ellipse',
      x: 47.5,
      y: 58,
      w: 11,
      h: 18,
      role: 'stamp',
      audience: 'staff',
      required: false,
      style: { ...DEFAULT_REGION_STYLE, color: '#e11d48', strokeWidth: 3, fillOpacity: 0.1 },
      label: { 'zh-TW': '承辦人核章', en: 'Staff stamp', vi: 'Dấu nhân viên' },
      instruction: {
        'zh-TW': '同樣是承辦人蓋的。收到單子時請確認這一聯也有蓋章和金額，沒有的話當場請承辦人補。',
        en: 'Also stamped by staff. Before you leave, check this copy has the stamp and the amount.',
        vi: 'Cũng do nhân viên đóng dấu. Trước khi rời quầy, kiểm tra liên này đã có dấu và số tiền.',
      },
    }),
  ];
}

export async function buildDemoGuide(stamp: string, sampleUrl: string): Promise<Guide> {
  const res = await fetch(sampleUrl);
  const blob = await res.blob();
  const full = await processUpload(blob, 1800, 0.86);

  // 一張照片上有兩聯，切開後各自成為獨立的一聯
  const top = await cropImage(full.dataUrl, { x: 0.015, y: 0.04, w: 0.97, h: 0.49 });
  const bottom = await cropImage(full.dataUrl, { x: 0.015, y: 0.53, w: 0.97, h: 0.46 });

  const topId = nanoid(8);
  const bottomId = nanoid(8);
  await putAsset(topId, top.blob);
  await putAsset(bottomId, bottom.blob);

  const passwordHash = await sha256Hex(DEMO_PASSWORD);

  return {
    schemaVersion: 2,
    id: 'demo-summer-fee',
    title: {
      'zh-TW': '暑修繳費單填寫引導',
      en: 'Summer Course Payment Form Guide',
      vi: 'Hướng dẫn điền phiếu học phí khoá hè',
    },
    subtitle: {
      'zh-TW': '114 學年第 3 學期暑修第一梯次 · 三聯複寫單',
      en: 'Academic year 114, summer term, first batch. Three separate copies.',
      vi: 'Năm học 114, khoá hè đợt một. Ba liên riêng biệt.',
    },
    org: '示範用途 · 示範科技大學（虛構學校）· 全部資料皆為虛構',
    logistics: {
      where: {
        'zh-TW': '教務處課務組櫃檯領取空白單',
        en: 'Collect the blank form at the Curriculum Section counter',
        vi: 'Nhận biểu mẫu trống tại quầy Phòng Giáo vụ',
      },
      deadline: {
        'zh-TW': '填妥後三日內至出納組繳費',
        en: 'Pay at the Cashier within three days',
        vi: 'Nộp tiền tại quầy thu ngân trong vòng ba ngày',
      },
    },
    languages: ['zh-TW', 'en', 'vi'],
    defaultLang: 'zh-TW',
    updatedAt: stamp,
    copies: [
      {
        id: 'copy-stub',
        name: { 'zh-TW': '課務組存根聯', en: 'Curriculum Section copy', vi: 'Liên Phòng Giáo vụ' },
        goesTo: { 'zh-TW': '交給課務組', en: 'Handed to the Curriculum Section', vi: 'Nộp cho Phòng Giáo vụ' },
        color: '#2563eb',
        assetId: topId,
        regions: stubRegions(),
        note: {
          'zh-TW': '這一聯會被收走，是學校認定的正本。',
          en: 'This copy is collected and treated as the official record.',
          vi: 'Liên này được thu lại và là bản chính thức.',
        },
      },
      {
        id: 'copy-student',
        name: { 'zh-TW': '學生存根聯', en: 'Student copy', vi: 'Liên sinh viên' },
        goesTo: { 'zh-TW': '你自己留存', en: 'You keep it', vi: 'Bạn giữ lại' },
        color: '#059669',
        assetId: bottomId,
        regions: studentRegions(),
        note: {
          'zh-TW': '內容必須和上一聯完全相同。繳費後請自行收好。',
          en: 'Content must match the first copy exactly. Keep it after payment.',
          vi: 'Nội dung phải giống hệt liên đầu. Giữ lại sau khi nộp tiền.',
        },
      },
    ],
    fields: [
      {
        key: 'studentId',
        label: { 'zh-TW': '學號', en: 'Student ID', vi: 'Mã sinh viên' },
        kind: 'text',
        hint: { 'zh-TW': '一個英文字母加十個數字', en: 'One letter and ten digits' },
        pattern: '^[A-Za-z]\\d{10}$',
        placeholder: 'D1105123456',
        sameAcrossCopies: true,
        askUser: true,
      },
      {
        key: 'name',
        label: { 'zh-TW': '姓名', en: 'Name', vi: 'Họ tên' },
        kind: 'text',
        placeholder: '王小明',
        sameAcrossCopies: true,
        askUser: true,
      },
      {
        key: 'phone',
        label: { 'zh-TW': '手機', en: 'Mobile', vi: 'Điện thoại' },
        kind: 'phone',
        pattern: '^09\\d{8}$',
        placeholder: '0912345678',
        sameAcrossCopies: true,
        askUser: true,
      },
      {
        key: 'program',
        label: { 'zh-TW': '學制', en: 'Program', vi: 'Hệ đào tạo' },
        kind: 'text',
        hint: { 'zh-TW': '由學號自動判斷', en: 'Derived from your student ID' },
        sameAcrossCopies: true,
        askUser: false,
      },
      {
        key: 'deptShort',
        label: { 'zh-TW': '系所簡稱', en: 'Department (short)', vi: 'Khoa (viết tắt)' },
        kind: 'text',
        hint: { 'zh-TW': '表單上填這個', en: 'This is what goes on the form' },
        sameAcrossCopies: true,
        askUser: false,
      },
      {
        key: 'deptFull',
        label: { 'zh-TW': '系所全稱', en: 'Department (full)', vi: 'Khoa (đầy đủ)' },
        kind: 'text',
        hint: { 'zh-TW': '只是讓你確認有沒有猜對，不要寫在表單上', en: 'For your confirmation only, do not write it on the form' },
        sameAcrossCopies: false,
        askUser: false,
      },
      {
        key: 'enrollYear',
        label: { 'zh-TW': '入學學年', en: 'Enrolment year', vi: 'Năm nhập học' },
        kind: 'text',
        sameAcrossCopies: false,
        askUser: false,
      },
      {
        key: 'courses',
        label: { 'zh-TW': '要暑修的科目', en: 'Courses', vi: 'Môn học' },
        kind: 'text',
        placeholder: '共通專業英文(一)、基礎數學',
        sameAcrossCopies: true,
        askUser: true,
      },
      {
        key: 'fee',
        label: { 'zh-TW': '應繳金額', en: 'Amount due', vi: 'Số tiền' },
        kind: 'text',
        placeholder: '6869',
        hint: { 'zh-TW': '由承辦人填寫，這裡只是讓你核對', en: 'Filled by staff, shown here for checking' },
        sameAcrossCopies: true,
        askUser: true,
      },
    ],
    rules: {
      triggerFieldKey: 'studentId',
      patterns: [
        {
          id: 'p-main',
          name: '學號拆解：學制碼 + 入學學年 + 系所代碼 + 流水號',
          match: '^([A-Z])(\\d{3})(\\d{3})(\\d{4})$',
          description: {
            'zh-TW': '例如 D1105123456 會被拆成 D（學制）、110（入學學年）、512（系所代碼）、3456（流水號）。',
            en: 'For example D1105123456 splits into D for programme, 110 for enrolment year, 512 for department, 3456 as the serial.',
          },
          derive: [
            { fieldKey: 'program', lookup: { tableId: 'tbl-program', group: 1 }, highlightRegionIds: ['d-program', 's-program'] },
            { fieldKey: 'enrollYear', value: '民國 $2 學年入學' },
            { fieldKey: 'deptShort', lookup: { tableId: 'tbl-dept-short', group: 3 }, highlightRegionIds: ['d-dept', 's-dept'] },
            { fieldKey: 'deptFull', lookup: { tableId: 'tbl-dept-full', group: 3 } },
          ],
        },
      ],
      lookups: [
        {
          id: 'tbl-program',
          name: '學制對照表',
          entries: {
            D: { 'zh-TW': '日四技', en: 'Day four-year programme', vi: 'Hệ bốn năm ban ngày' },
            N: { 'zh-TW': '進四技', en: 'Evening four-year programme', vi: 'Hệ bốn năm buổi tối' },
            F: { 'zh-TW': '五專', en: 'Five-year junior college', vi: 'Hệ cao đẳng năm năm' },
          },
        },
        {
          id: 'tbl-dept-short',
          name: '系所簡稱對照表',
          entries: {
            '512': { 'zh-TW': '資工系', en: '資工系 (CSIE)', vi: '資工系 (CSIE)' },
            '415': { 'zh-TW': '資管系', en: '資管系 (MIS)', vi: '資管系 (MIS)' },
            '412': { 'zh-TW': '電子系', en: '電子系 (EE)', vi: '電子系 (EE)' },
          },
        },
        {
          id: 'tbl-dept-full',
          name: '系所全稱對照表',
          entries: {
            '512': {
              'zh-TW': '資訊工程系',
              en: 'Department of Computer Network Engineering',
              vi: 'Khoa Kỹ thuật Mạng máy tính',
            },
            '415': { 'zh-TW': '資訊管理系', en: 'Department of Information Management' },
            '412': { 'zh-TW': '電子工程系', en: 'Department of Electronic Engineering' },
          },
        },
      ],
    },
    deptViews: [
      {
        id: 'dept-curriculum',
        name: { 'zh-TW': '課務組內部檢視', en: 'Curriculum Section internal view' },
        passwordHash,
        note: {
          'zh-TW': `示範密碼是 ${DEMO_PASSWORD}。解鎖後會顯示只給承辦人看的註記。請記得這只是前端遮蔽，不是資訊安全機制。`,
          en: `The demo password is ${DEMO_PASSWORD}. This only hides notes from students, it is not a security control.`,
        },
      },
    ],
    simulation: {
      enabled: true,
      fontFamily: "'Iansui', 'LXGW WenKai TC', 'Klee One', cursive",
      jitter: true,
    },
    assets: {
      [topId]: { id: topId, src: top.dataUrl, width: top.width, height: top.height, bytes: top.bytes, name: '課務組存根聯' },
      [bottomId]: { id: bottomId, src: bottom.dataUrl, width: bottom.width, height: bottom.height, bytes: bottom.bytes, name: '學生存根聯' },
    },
  };
}
