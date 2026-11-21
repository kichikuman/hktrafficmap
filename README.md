# 香港智慧城市地圖

一幅可互動的香港地圖。底圖用 [OpenFreeMap](https://openfreemap.org/) 的公開服務。地圖上有目前營運中的 10 條港鐵重鐵綫，以及運輸署的交通快拍點。

點選車站，可以查看該站最多四班即將到站的列車。點選快拍點，可以查看該處的最新照片。沒有班次或未能提供照片時，畫面會直接說明。

## 資料從哪裡來

- 底圖：OpenFreeMap 公開樣式，資料來自 OpenStreetMap。不需註冊或鑰匙。
- 路綫和站名：港鐵車站表 `mtr_lines_and_stations.csv`。馬場站不在這份表內，已按到站接口補上。
- 路軌形狀：OpenStreetMap 的港鐵路綫，沿實際軌道繪製，而不是把車站直線相連。
- 車站位置：地政總署三維室內港鐵站地圖。這個接口不允許瀏覽器直接讀取，所以座標存在 `src/data/network.json`。
- 到站班次：資料一線通港鐵實時列車服務資訊。點選車站時才查詢。
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

`npm run build` 會輸出靜態網站到 `out/`。正式版預計在驗收後，以 Cloudflare Workers 免費方案發佈到 `workers.dev`。靜態檔案請求不計入每日 10 萬次程式請求，預計費用是 0 美元。
