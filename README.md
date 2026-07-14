# HADŌ HEN / 波動変

**変拍子 (odd-meter) dot-beat generator** — EL-SYSTEMA.

HADŌ DUST のユークリッド／粒子ロジックを土台に、**加算拍子（3+2+2…）の連結 × ポリメーター**で
変拍子の組み合わせを組めるビートジェネレータ。音色は Ryoji Ikeda 的な dot 感のある
ミニマルで固いクリック・ノック、全体に重く低域がしっかりあるエレクトロ・ビート。

## 変拍子モデル

- **Bar** = 均等 16分ユニットの加算グルーピング（例 `[2,2,3]` = 7/8）。グループ頭がダウンビート。
- **Groove** = Bar の連結ループ（例 `7+5+9` = 7/8 → 5/8 → 9/8 を巡回）。
- 各グループ頭に KICK が乗り、拍子の変化がそのまま体感できる。

## レーン発音ルール（各レーン独立）

| mode | 挙動 |
|------|------|
| `DOWNBEAT` | 現在の小節の各グループ頭で発音 |
| `EUCLID`   | 小節長 N に k 発音をユークリッド分配（rot で回転） |
| `POLY`     | 小節を無視し独立周期 len に k 発音 → 小節と位相がずれる（ポリメーター） |

## 音色（Ikeda dot × heavy low）

- **KICK** — hard-clip した sine の急降下 = 重く固い低域アンカー
- **SUB** — 純 sine の深い持続低域
- **KNOCK** — 乾いた木/樹脂的ノック（sine burst + hard clip）
- **CLICK** — 純 sine pip + 微ノイズトランジェント（razor digital click）
- **TICK** — 高域 sine の点（dot 感）
- **NOISE** — 短いデジタル・グリット
- **BEEP** — 純テストトーン（Ikeda シグネチャ、既定 off）

マスターは dry/hard：軽いサチュ → 90Hz ローシェルフ（低域の重み）→ 24Hz HP → limiter。

## 開発

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/
```
