import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { readEmbeddedGuide } from './lib/exporters';
import { EditorPage } from './editor/EditorPage';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { ViewerPage } from './viewer/ViewerPage';

/**
 * 路由用 hash 而不是 history。
 *
 * 理由是這份產出必須能在任何地方跑：Vercel 根目錄、GitHub Pages 子路徑、
 * 學校內網的某個資料夾、隨身碟上的 file:// 檔案。
 * hash 路由不需要伺服器端的 rewrite 規則，搬到哪裡都不會 404。
 * 順帶一提，分享連結把資料放在 # 之後也就順理成章，
 * 因為 # 後面的內容本來就不會送到伺服器，等於資料不外流。
 */

export default function App() {
  // 單檔離線版會在 HTML 裡內嵌一份引導檔，此時直接進檢視畫面
  const embedded = readEmbeddedGuide();

  return (
    <HashRouter>
      <Routes>
        {embedded ? (
          <>
            <Route path="/" element={<ViewerPage embedded={embedded} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<HomePage />} />
            <Route path="/edit/:id" element={<EditorPage />} />
            <Route path="/v" element={<ViewerPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </HashRouter>
  );
}
