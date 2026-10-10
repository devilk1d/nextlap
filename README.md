# Next Lap Predictor

Dashboard replay dan prediksi lap time F1 (LSTM/GRU, 2022–2025). Backend berupa Route Handler Next.js
yang membaca database Supabase `nextlap` (read-only).

## Menjalankan

```bash
cp .env.example .env.local   # isi SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev
npm test                     # unit test logika turunan (assemble + summary)
```

Hanya publishable key yang dipakai: RLS di database hanya mengizinkan `SELECT`, jadi service role
tidak diperlukan. Key tidak pernah dikirim ke browser.

## Endpoint

Semua respons JSON dengan nama kolom persis seperti database (snake_case).
Error selalu berbentuk `{ "error": { "code", "message", "details?" } }`.

| Endpoint | Isi |
| --- | --- |
| `GET /api/races?year=&circuit_key=` | Katalog balapan + sirkuit; `predictable=false` untuk balapan basah / tidak dimodelkan |
| `GET /api/races/:raceId?model_run_id=` | Detail replay: `race`, `model`, `metrics`, `cars[]` → `laps[]` (lap + telemetri + `prediction` + `dirty_air`) |
| `GET /api/races/:raceId/summary` | Ringkasan faktual: pemenang, pole, fastest lap, margin, strategi, SC/VSC/yellow, DNF, cuaca |
| `GET /api/circuits` | Daftar sirkuit |
| `GET /api/circuits/:circuitKey/history` | Ringkasan per musim di sirkuit tersebut |
| `GET /api/models` | Daftar `model_runs` |
| `GET /api/experiments?scheme=&model_type=` | Hasil eksperimen per fold |

Catatan penting:

- `model_run_id` kosong → run dengan `is_default = true`.
- Setiap `prediction` membawa `origin` (`out_of_fold` / `validation` / `in_sample`). Hanya
  `in_sample` yang berasal dari data latih; jangan disajikan sebagai bukti generalisasi.
- Balapan yang tidak dapat diprediksi mengembalikan hasil (`cars` tanpa `laps`).

## Struktur

```
app/api/**          route tipis: validasi input → panggil service
server/
  env.ts            validasi environment (zod)
  http.ts           handle(), ApiError, parse()
  db/               klien Supabase, tipe skema, helper query (unwrap, fetchAll)
  reference/        circuits, teams, drivers (cached)
  models/           model_runs, experiment_results
  races/            repository → assemble (murni) → summary (murni) → service
  circuits/         riwayat sirkuit
```

Pembacaan database dibungkus `use cache` (`cacheLife('hours')`); logika turunan (`assemble`,
`summary`) berupa fungsi murni di luar cache sehingga mudah diuji.
