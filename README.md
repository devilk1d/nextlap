# Next Lap Predictor

Dashboard replay dan prediksi lap time F1 (LSTM/GRU, 2022–2025). Backend berupa Route Handler
Next.js yang membaca database Supabase `nextlap` (read-only); frontend berupa dashboard lima
tampilan yang mengikuti desain `Next Lap Predictor v4`.

## Menjalankan

```bash
cp .env.example .env.local   # isi SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev
npm test                     # unit test logika turunan (backend + replay engine)
```

Hanya publishable key yang dipakai: RLS di database hanya mengizinkan `SELECT`, jadi service role
tidak diperlukan. Key tidak pernah dikirim ke browser.

## Tampilan

| URL | Isi |
| --- | --- |
| `/` atau `?view=replay` | Lap replay: forecast lap berjalan, peta lintasan, grafik stint, live order, ban, telemetri |
| `?view=h2h` | Head to head dua pembalap: interval, lap time, selisih, perbandingan |
| `?view=strat` | Strategi seluruh grid: gantt ban, tren lap time per umur ban, pit stop, pit lane per tim |
| `?view=ov` | Ringkasan balapan: klasifikasi, kualifikasi, pace tim, posisi per lap, explorer metrik, traffic |
| `?view=hist` | Riwayat sirkuit per musim |

Parameter lain: `race=<race_id>`, `drv=<kode>`, `a=<kode>&b=<kode>` (head to head). Seluruh pilihan
disimpan di URL sehingga setiap tampilan bisa dibagikan.

Yang sengaja **tidak** ada karena bukan keluaran model / tidak divalidasi: dekomposisi kontribusi
fitur per lap, forecast sektor, persentase umur ban, "pit now?", simulator what-if, dan pita ±1σ
(database hanya menyimpan prediksi titik). Kemiringan "degradasi" dihitung dari lap time mentah dan
diberi label bahwa pengurangan bahan bakar ikut terhitung.

## API

Semua respons JSON dengan nama kolom persis seperti database (snake_case).
Error selalu berbentuk `{ "error": { "code", "message", "details?" } }`.

| Endpoint | Isi |
| --- | --- |
| `GET /api/races?year=&circuit_key=` | Katalog balapan + sirkuit; `predictable=false` untuk balapan basah / tidak dimodelkan |
| `GET /api/races/:raceId?model_run_id=` | Detail replay: `race`, `model`, `metrics`, `cars[]` → `laps[]` (lap + telemetri + `prediction` + `dirty_air`) |
| `GET /api/races/:raceId/summary` | Ringkasan faktual: pemenang, pole, fastest lap, margin, strategi, SC/VSC/yellow, DNF, lead changes, cuaca |
| `GET /api/circuits` | Daftar sirkuit |
| `GET /api/circuits/:circuitKey/history` | Ringkasan per musim di sirkuit tersebut |
| `GET /api/models` | Daftar `model_runs` |
| `GET /api/experiments?scheme=&model_type=` | Hasil eksperimen per fold |

Catatan penting:

- `model_run_id` kosong → run dengan `is_default = true`.
- Setiap `prediction` membawa `origin` (`out_of_fold` / `validation` / `in_sample`). Hanya
  `in_sample` yang berasal dari data latih; jangan disajikan sebagai bukti generalisasi.
- `metrics` dihitung dari prediksi tersimpan terhadap lap time aktual; `rmse_mean3` adalah baseline
  Mean-3 pada balapan yang sama.
- Role `anon` Supabase dibatasi `statement_timeout = 3s`; query berat (view agregat) sengaja dihindari.

## Struktur

```
app/
  api/**              route tipis: validasi input → panggil service
  page.tsx            memuat katalog balapan di server, lalu merender <Dashboard/>
  globals.css         token desain (warna, font) dan grid dashboard
server/               backend
  http.ts             handle(), ApiError, parse()
  db/                 klien Supabase, tipe skema, helper query (unwrap, fetchAll)
  races/              repository → assemble (murni) → summary (murni) → service
  models/ circuits/ reference/
features/             frontend per fitur
  dashboard/          shell: header, transport, URL state, konteks balapan
  replay/ h2h/ strategy/ overview/ history/   satu folder per tampilan
  common/             panel yang dipakai beberapa tampilan (live order, track panel)
components/
  ui/                 Card, Segmented, Dropdown, Table, Tile, ...
  charts/             Plot, LineChart, TrackMap, CarMarkers
lib/
  race/               timeline engine (replay), flag lap, event balapan, geometri lintasan
  format.ts stats.ts  format waktu dan statistik kecil yang dipakai ulang
data/                 geometri lintasan 10 sirkuit studi, permutation importance
```

## Library

| Library | Alasan |
| --- | --- |
| `@supabase/supabase-js` | Akses database dari server |
| `zod` | Validasi env dan input request |
| `swr` | Fetch + cache data balapan di klien (direkomendasikan dokumentasi Next.js) |
| `zustand` | Jam replay (update ~20×/detik) tanpa me-render ulang seluruh dashboard |
| `server-only` | Menjamin modul backend tidak ikut ke bundle klien |
| `vitest` | Unit test fungsi murni |

Grafik sengaja digambar dengan SVG/CSS sendiri: desain memakai gaya visual khusus (crosshair,
band SC/VSC, marker prediksi) yang tidak dicapai library chart tanpa banyak override.
Font (Barlow, Barlow Condensed, Michroma, JetBrains Mono) dimuat lewat `next/font/google`.

## Data yang perlu dilengkapi

- `data/permutation-importance.json`: isi dengan keluaran notebook (`[{feature, label, importance}]`);
  tab **Context** pada Lap replay otomatis menampilkannya.
- `circuits.official_name`, `country_code`, `length_km` hanya terisi untuk 10 sirkuit studi.
- Garis lintasan (`data/track-geometry.json`) hanya tersedia untuk 10 sirkuit studi; sirkuit lain
  menampilkan pemberitahuan.
