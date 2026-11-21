# 香港智慧城市地圖

一幅可互動的香港地圖。底圖用 [OpenFreeMap](https://openfreemap.org/) 的公開服務。地圖上有目前營運中的 10 條港鐵重鐵綫，以及運輸署的交通快拍點。

點選車站，可以查看該站最多四班即將到站的列車。點選快拍點，可以查看該處的最新照片。沒有班次或未能提供照片時，畫面會直接說明。

## 資料從哪裡來

- 底圖：OpenFreeMap 公開樣式，資料來自 OpenStreetMap。不需註冊或鑰匙。
- 路綫和站名：港鐵車站表 `mtr_lines_and_stations.csv`。馬場站不在這份表內，已按到站接口補上。
- 路軌形狀：OpenStreetMap 的港鐵路綫，沿實際軌道繪製，而不是把車站直線相連。
- 車站位置：地政總署三維室內港鐵站地圖。這個接口不允許瀏覽器直接讀取，所以座標存在 `src/data/network.json`。
- 到站班次：資料一線通港鐵實時列車服務資訊。正式版由一個定時工作每分鐘更新一份共用的 `trains.json`，瀏覽者和車站板都讀這份檔。本機沒有設定快取網址時，仍然直接查港鐵。
- 交通快拍：運輸署攝影機位置表和最新 JPEG。點選快拍點時才下載照片。

這版包括機場快綫、東涌綫、屯馬綫、將軍澳綫、東鐵綫、南港島綫、荃灣綫、港島綫、觀塘綫和迪士尼綫。輕鐵不在這版裡面。路軌包括落馬洲、康城和馬場支綫。

若要更新車站位置或快拍點清單，執行：

```bash
python3 scripts/prepare_data.py
```

## 在本機預覽

需要 Node.js 22 或以上。

```bash
npm install
npm run dev
```

開發伺服器會在連接埠 3456 啟動。

```bash
npm test
npm run lint
npm run build
```

`npm run build` 會輸出靜態網站到 `out/`。正式版用 Cloudflare Workers 的靜態檔案發佈，頁面請求不計入每日 10 萬次程式請求。

## 列車快取

`workers/refresh-trains.ts` 每分鐘向港鐵查 40 個車站，把結果合併進 R2 的 `trains.json`。全部車站大約 3 分鐘輪完。檔案的快取時間是 30 秒，所以同一地點的瀏覽者共用一份副本。

本機預覽不需要這個工作。要讓正式版改讀快取，建置前設定：

```bash
NEXT_PUBLIC_TRAIN_CACHE_URL=https://你的-r2-網址/trains.json npm run build
```

發佈前要先建立 R2 bucket `hk-map-trains`，允許公開讀取，並套用 `workers/r2-cors.json`。然後：

```bash
npm run build
npx wrangler deploy
```

定時工作每天大約跑 1,500 次，在免費方案的每日 10 萬次之內。瀏覽者直接讀 R2，不經過 Worker。
