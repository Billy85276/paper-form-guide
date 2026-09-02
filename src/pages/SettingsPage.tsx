import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Label, Select, TextInput } from '../components/ui';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from '../lib/storage';

/**
 * 設定頁
 *
 * 金鑰放在使用者自己的瀏覽器，不經過任何中繼伺服器。
 * 這個決定不是為了偷懶，而是因為它讓這套工具可以真的免費開放給任何人用：
 * 每個人的用量都算在自己頭上，不會有人替所有人付帳。
 * 代價是必須把風險講清楚，所以這一頁花了不少篇幅在說明而不是在填欄位。
 */

export function SettingsPage() {
  const [s, setS] = useState<AppSettings>(() => loadSettings());
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">設定</h1>
        <Link
          to="/"
          className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50"
        >
          回首頁
        </Link>
      </header>

      <Card className="mb-4 p-5">
        <h2 className="mb-3 font-semibold">AI 供應商</h2>
        <p className="mb-4 text-sm text-slate-500">
          用來看照片幫你畫框、寫填寫說明，以及把說明翻成其他語言。不設定也能用，只是所有標註要自己畫。
        </p>

        <Label>要用哪一家</Label>
        <Select
          value={s.aiProvider}
          onChange={(e) => update({ aiProvider: e.target.value as AppSettings['aiProvider'] })}
          className="mb-4 w-full"
        >
          <option value="gemini">Google Gemini（推薦，標框最準）</option>
          <option value="openai">OpenAI</option>
        </Select>

        {s.aiProvider === 'gemini' ? (
          <div className="space-y-3">
            <div>
              <Label hint="在 Google AI Studio 產生">Gemini API 金鑰</Label>
              <TextInput
                type="password"
                value={s.geminiKey}
                placeholder="AIza..."
                onChange={(e) => update({ geminiKey: e.target.value })}
              />
            </div>
            <div>
              <Label hint="不確定就用預設值">模型</Label>
              <TextInput
                value={s.geminiModel}
                onChange={(e) => update({ geminiModel: e.target.value })}
              />
            </div>
            <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-900">
              Gemini 是唯一一家在官方文件裡明確定義標框座標格式的供應商，
              對「請框出學號欄位」這種任務準確度明顯較高。
              建議到 Google AI Studio 把金鑰加上網站來源限制，
              這樣就算金鑰外流，別人拿去自己的網站上也用不了。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>OpenAI API 金鑰</Label>
              <TextInput
                type="password"
                value={s.openaiKey}
                placeholder="sk-..."
                onChange={(e) => update({ openaiKey: e.target.value })}
              />
            </div>
            <div>
              <Label>模型</Label>
              <TextInput
                value={s.openaiModel}
                onChange={(e) => update({ openaiModel: e.target.value })}
              />
            </div>
            <div>
              <Label hint="要接自架或第三方相容端點才需要改">API 位址</Label>
              <TextInput
                value={s.openaiBaseUrl}
                onChange={(e) => update({ openaiBaseUrl: e.target.value })}
              />
            </div>
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              提醒一個實際會遇到的狀況：OpenAI 在金鑰無效時是在邊緣節點就擋掉請求，
              瀏覽器只會看到一個沒有內容的連線錯誤，讀不到真正的錯誤訊息。
              所以如果你看到「無法連線」，第一個要懷疑的就是金鑰貼錯了。
            </p>
          </div>
        )}
      </Card>

      <Card className="mb-4 p-5">
        <h2 className="mb-3 font-semibold">分享網址</h2>
        <p className="mb-4 text-sm text-slate-500">
          設定之後，產生 QR 碼時會用這些網址。留空就用你現在打開這個網站的網址。
        </p>
        <div className="space-y-3">
          <div>
            <Label hint="印在紙上的主要 QR，留空就用目前這個網站的網址">主要網址</Label>
            <TextInput
              value={s.primaryHost}
              placeholder="https://billy85276.github.io/form-guide-studio"
              onChange={(e) => update({ primaryHost: e.target.value })}
            />
          </div>
          <div>
            <Label hint="主要網址掛掉時掃這個，選填">備援網址</Label>
            <TextInput
              value={s.mirrorHost}
              placeholder="https://your-name.pages.dev"
              onChange={(e) => update({ mirrorHost: e.target.value })}
            />
          </div>
        </div>
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          目前只部署在 GitHub Pages 一個主機，這樣最單純。
          如果日後想要更高的韌性，可以把同一份程式碼再部署一份到 Cloudflare Pages 之類的免費服務，
          紙上印兩顆 QR，兩家同時掛掉的機率極低，這是唯一能救「已經印出去的 QR」的方法。
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">金鑰放在瀏覽器，你該知道的事</h2>
        <ul className="space-y-2 text-sm text-slate-600">
          <li>
            金鑰存在這台裝置的瀏覽器儲存空間，不會傳到我們這裡，因為我們根本沒有伺服器。
          </li>
          <li>不要在公用電腦上使用。用完請按下面的清除鍵。</li>
          <li>
            建議到供應商後台設定用量上限。就算金鑰外流，損失也有天花板。
          </li>
          <li>
            如果這個網站被植入惡意程式碼，金鑰就會外洩。這是所有「金鑰放前端」的做法共同的風險，
            我們的對策是把外部相依壓到最少，但無法宣稱這個風險是零。
          </li>
        </ul>
        <div className="mt-4">
          <Button
            variant="danger"
            onClick={() => {
              if (!confirm('清除所有金鑰？')) return;
              const cleared = { ...s, geminiKey: '', openaiKey: '' };
              setS(cleared);
              saveSettings(cleared);
            }}
          >
            清除所有金鑰
          </Button>
          <Button
            variant="ghost"
            className="ml-2"
            onClick={() => {
              setS({ ...DEFAULT_SETTINGS });
              saveSettings({ ...DEFAULT_SETTINGS });
            }}
          >
            全部回到預設
          </Button>
        </div>
      </Card>

      {saved ? (
        <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          已儲存
        </p>
      ) : null}
    </div>
  );
}
