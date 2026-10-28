# 棲光小島｜RiveMCP（Polymation）試用計畫

建立：2026-10-28。這份是給**新對話**用的交接文件：在隔離環境試用社群版 RiveMCP，看它能不能幫「每種體型的動物」做出待機、張望、甩尾、走路等小動作，再決定動物動態要走哪條路。

---

## 1. 背景（為什麼要試）

- 棲光小島是專注 App（React 19 + Vite + Capacitor 8，Android 實機 Galaxy A8s）。專注畫面正在改成**望遠鏡搜尋**：上方圓形鏡片在橫向全景上左右掃、推近拉遠；動物中段才在遠方出現，只在鏡頭轉開的死角換到更近的位置，時間到才走到鏡頭正前方。
  - 原型程式：`src/components/Scope.tsx`（分支 `proto/scope`）。
  - 依習性的出現方式：walk（地上）、perch（鳥類停倒木）、soar（猛禽盤旋）、eyes（貓頭鷹先亮眼睛）。
- 現在每隻動物、每個成長階段**只有一張站姿圖**，動作只能整張平移、旋轉、壓扁。想讓動物「活著」（低頭、張望、甩尾巴、跳兩步、定格走路），要決定做法。
- 已評估的方案（詳細比較見對話紀錄）：

| 方案 | 執行時負擔 | 製作成本 | 備註 |
| --- | --- | --- | --- |
| A. 一張圖＋程式動作 | 最省 | 不用另外畫 | 現況 |
| **B. 部件拆圖＋程式（CSS）動作** | 幾乎一樣省、不用套件 | 每隻多 3～5 個部件，動作手寫 | **目前建議的正式做法** |
| C. Spine 輸出 JSON | 中等（每格算骨架） | 拆部件＋綁骨架＋做動畫；要買授權（網格變形需 Pro） | |
| D. Rive | 中等，播放器比 Spine 小 | 同 C；有狀態機 | **這次要試的** |

- **省工關鍵：照體型共用骨架與動作。** 29 隻動物只有 9 種體型（`shape`：bird、owl、cat、bear、goat、mustelid、pheasant、raptor、pangolin），每種體型做 1 套動作，同體型換貼圖（Rive／Spine 叫 skin），幼年、亞成年用同一套縮小。約 9 套，而不是 29 × 3 套。

## 2. RiveMCP 是什麼（2026-10-28 檢查結果）

- npm 套件 `rivemcp`，產品改名 **Polymation**；作者 paradoxsyn（單人），2026-04-21 首次發布，檢查時最新 **1.19.0**（2026-10-26）。
- 宣稱 224 個工具：從零產生 `.riv`／`.rev`、狀態機、骨架與網格變形、**「一張圖或分層 PSD → 有骨架的角色」**、物理、Lottie／AE／Figma 互轉。
- 發布頁：https://github.com/paradoxsyn/rivemcp-releases ；授權碼：polymation.stunning.gg（沒有授權碼時有試用額度，價格未查到）。

### 安全檢查（只下載套件讀內容，沒有安裝或執行）

1. **沒有可讀的原始碼**：npm 套件只有 `bin/rivemcp.mjs`（啟動程式）和 `scripts/postinstall.mjs`。
2. **安裝時下載混淆過的原生執行檔**：postinstall 從 `github.com/paradoxsyn/rivemcp-releases/releases/download/v{版本}/rivemcp-win-x64.exe` 下載，**沒有雜湊或簽章驗證**。
3. **以使用者完整權限執行**：接上 MCP 後在背景跑，讀得到檔案、連得上網路；程式碼無法審查。
4. **專有授權、需付費**（LICENSE：RiveMCP Proprietary License）。
5. **`.riv` 由它自己從零產生**（非官方編輯器），宣稱會用 Rive 官方 runtime 驗證；Rive 改格式時可能有相容風險。
6. **權限一次放行全部**：所有工具包在 `find_tool`／`use_tool` 裡，同意 `use_tool` 等於同意全部；可設 `POLYMATION_TOOLS=core|standard|full` 改成逐一列出、逐一同意。
7. 預覽用無頭瀏覽器（Playwright 的 Chromium，沒有就用 Chrome／Edge）。

**結論：不要裝在存放專案的這台電腦上；只在隔離環境試。**

## 3. 測試環境（隔離）

- 建議 **Windows 沙箱**（Windows 10 專業版內建，關掉就全部清除）。要由使用者自己在「開啟或關閉 Windows 功能」勾選「Windows 沙箱」並重開機。
- 沙箱裡只放：
  - 測試用的一隻動物素材（見第 4 節），**不要放專案原始碼、金鑰、帳號資料**。
  - Node.js（官方安裝檔）、Claude Code 或其他 MCP 客戶端。
- 安裝（在沙箱裡）：

```json
{
  "mcpServers": {
    "polymation": {
      "command": "npx",
      "args": ["-y", "rivemcp@1.19.0"],
      "env": { "POLYMATION_TOOLS": "core" }
    }
  }
}
```

- 先不填授權碼，用試用額度；`POLYMATION_TOOLS=core` 讓每個工具都要個別同意。
- 備案：也可以直接下載發布頁的 `rivemcp-win-x64.exe` 在沙箱執行。

## 4. 測試素材

- **先試一種體型：貓科（cat）**，代表動物石虎 `leopard_cat`（專案裡已有正式圖：`src/assets/animals/leopard_cat.webp`）。
- 準備兩種輸入，比較哪個效果好：
  1. **一張完整的動物圖**（512×512 去背，側面朝右，腳底在畫布底部往上 8%）。
  2. **分層 PSD**：頭、身體、前腳、後腳、尾巴，各一層；圖層名稱用英文（head、body、leg_front、leg_back、tail）。拆圖可以請 GPT 協助，或用影像工具手動切。
- 風格：霧面黏土、低彩度；動作要安靜、療癒，不要誇張（專注 App，不能讓人分心）。

## 5. 要做出來的動作（每種體型同一套）

| 動作 | 說明 | 長度 |
| --- | --- | --- |
| idle | 呼吸、身體微微起伏 | 3～4 秒循環 |
| look | 抬頭張望、轉頭看一邊再轉回來 | 2～3 秒 |
| sniff | 低頭聞地面 | 2 秒 |
| tail | 甩尾巴一次 | 1 秒 |
| walk | 走幾步（可試「定格感」：每秒約 8 格的一頓一頓） | 1 個循環約 0.8 秒 |
| sit（選做） | 坐下 | 1.5 秒 |

- 狀態機：idle 為預設，每隔幾秒隨機切到 look／sniff／tail，再回 idle；外部可以觸發 walk。
- 加分：同一份檔案換另一隻貓科（例如西表山貓、雲豹）的貼圖，動作直接共用。

## 6. 評估標準

| 項目 | 怎麼看 | 及格 |
| --- | --- | --- |
| 動作品質 | 自然、不扭曲、關節不穿幫 | 不用大改就能用 |
| 黏土感 | 網格變形有沒有柔軟、被擠壓的感覺 | 比 CSS 方案明顯好 |
| 共用性 | 換同體型另一隻的貼圖能不能直接用 | 可以 |
| 檔案大小 | 一隻動物的 `.riv` | 越小越好，目標 < 200 KB |
| 播放效能 | 在 Galaxy A8s 的 WebView 播放（`@rive-app/canvas`），量 CPU、每秒格數 | 不卡、耗電增加不明顯 |
| 製作時間 | 從素材到可用動作花多久 | 比手寫 CSS 快 |
| 成本 | 授權費 | 可接受 |

- 效能實測方式：把 `.riv` 拿回主電腦，用 Rive 官方的網頁播放器做一個最小 HTML（不要在主電腦安裝 RiveMCP），用 `adb` 在手機上量（`dumpsys gfxinfo`、`top`）。
- 對照組：同樣幾個動作，用方案 B（部件＋CSS 動作）做一版，並排比較。

## 7. 試完要帶回主對話的結論

1. 動作品質截圖或錄影（每個動作各一段）。
2. `.riv` 檔大小、手機上的 CPU／每秒格數。
3. 實際花的時間、試用額度夠不夠、正式授權價格。
4. 建議：用 RiveMCP（D）、改用 Spine（C）、還是維持方案 B。

## 8. 相關檔案

- 望遠鏡原型：`src/components/Scope.tsx`、`src/pages/Focus.tsx`、`src/styles.css`（搜尋「望遠鏡」）
- 動物繪製：`src/components/Animal.tsx`（`AnimalArt`、`STAGE_SCALE`）
- 動物資料（體型 `shape`）：`src/content/config.ts`
- 美術清單（全景與出現方式的小道具）：`docs/清單-美術.md` 第 I、J 節
