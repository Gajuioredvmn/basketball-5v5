# 全場 5v5 籃球

手機瀏覽器就能玩的 3D 全場 5 對 5 籃球（NBA 規格場地與規則）。

- 線上玩：<https://gajuioredvmn.github.io/basketball-5v5/>
- 全螢幕：iPhone 用 Safari 開 →「分享」→「加入主畫面」；Android 用 Chrome 開 → 按遊戲裡的「全螢幕」或「加到主畫面」。

## 檔案

| 路徑 | 說明 |
|---|---|
| `index.html` | 打包好的遊戲（單一檔案，含 three.js），GitHub Pages 直接提供這個 |
| `manifest.webmanifest`、`icon-*.png` | 加到主畫面用的設定與圖示 |
| `source/src/main.js` | 遊戲邏輯：規則、AI、操控、鏡頭、模式、轉播 |
| `source/src/player.js` | 球員模型（蒙皮骨架）、球衣貼圖、動作 |
| `source/src/arena.js` | 球館：NBA 尺寸球場、籃架、看台、燈光 |
| `source/src/audio.js` | 音效（WebAudio 合成） |
| `source/src/const.js` | 尺寸常數、球隊顏色 |
| `source/src/index.html` | 介面版型與樣式（打包時把程式塞進去） |

## 修改後重新打包

```bash
cd source
./build.sh        # 需要 Node.js 與 Python 3，會輸出 ../index.html
```

改的是 `source/`，不要直接改根目錄的 `index.html`（會被打包覆蓋）。

## 已完成

- NBA 規格球場與規則：24／14 秒、8 秒、回場、進攻與防守 3 秒、干擾球、犯規與罰球、加罰、6 犯離場、暫停、換人與體力、NBA 計時
- 操控：投籃時機條、傳球、運球招式（胯下、背後、後撤步、猶豫步、轉身）、歐洲步、後仰、背打（勾射、夢幻腳步）、灌籃（掛框、慢動作）、空中接力
- AI：人盯人／2-3 區域／全場緊迫、擋拆與換防、包夾、低位單打、三分戰術
- 模式：單場、季後賽搶四、三分大賽、灌籃大賽；球隊顏色可選
- 轉播：電視記分條、賽前介紹、精彩重播、文字播報、關鍵時刻、全場最佳
- 設定：按鈕大小、左右手、拖曳按鈕位置、震動、畫質

## 接下來可以做

- 換成真人球員模型與動作捕捉動畫（例如 Tripo 模型＋Unity 籃球動作包）
