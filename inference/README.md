# Next Lap inference API

Service Python (FastAPI) yang menyajikan model final notebook v7 (LSTM, set fitur E, window 5)
untuk prediksi lap time putaran berikutnya (t+1). Dideploy sebagai service terpisah di Render;
website Next.js (di Vercel) tetap membaca Supabase.

## Cara kerja

```
Supabase (laps + lap_telemetry, read-only)
  → app/pipeline.py   pembersihan + rekayasa fitur, salinan langkah notebook (bagian 3.2, 4, 6, 7)
  → app/model.py      normalisasi window + MinMax scaler + forward pass LSTM dengan NumPy
  → prediksi = rata-rata lap time window + keluaran model
```

Model dijalankan dengan NumPy, bukan TensorFlow: bobot `model_final.keras` diekspor ke
`model/weights.npz` dan scaler ke `model/scaler.json`. Image jadi kecil (±250 MB, tanpa
TensorFlow ±2 GB) dan RAM cukup ±150 MB. Selisih terhadap Keras < 0,000001 detik.

Pengujian (`tests/`):

| Uji | Isi |
| --- | --- |
| `test_parity.py` | Pipeline API vs salinan verbatim kode notebook (`tests/notebook_reference.py`) pada balapan sintetis berisi pit stop, SC, bendera kuning, lap dihapus, telemetri rusak, hujan, balapan ban basah. Input window, target, dan prediksi harus identik, baik semua balapan sekaligus maupun per balapan. |
| `test_parity.py::test_numpy_forward_matches_keras` | Forward pass NumPy vs Keras (jalan bila TensorFlow terpasang dan `experiment_results_v7/` ada di root repo). |
| `test_api.py` | Semua endpoint dengan database tiruan. |

Uji pada data asli dilakukan oleh `scripts/backfill_predictions.py`: RMSE pada balapan validasi
(semua pembalap) harus sama dengan "RMSE without permutation" di notebook bagian 14.3 (**0,4505 s**).

## Endpoint

| Endpoint | Isi |
| --- | --- |
| `GET /health` | Status + jenis model (dipakai health check Render) |
| `GET /v1/model` | Kartu model: fitur, hyperparameter, daftar balapan validasi |
| `GET /v1/races` | Balapan + `origin` (`in_sample` / `validation`) untuk model final |
| `GET /v1/races/{race_id}/predictions?driver=VER&include_open=false` | Prediksi semua lap yang bisa diprediksi + metrik (RMSE, MAE, MAPE, Mean-3) |
| `GET /v1/races/{race_id}/drivers/{kode}/laps/{lap}` | Prakiraan satu lap dari 5 lap bersih sebelumnya |
| `POST /v1/predict` | Prediksi dari window fitur mentah `{ "windows": [[[55 nilai] × 5], ...] }` |
| `GET /docs` | Dokumentasi interaktif (Swagger) |

`include_open=true` menambahkan prakiraan untuk lap setelah window bersih terakhir tiap stint
(misalnya lap masuk pit); lap ini tidak punya padanan di notebook sehingga tidak masuk metrik.

Catatan jujur untuk skripsi: model final dilatih pada ±80% balapan awal kalender, jadi prediksinya
pada balapan `in_sample` berasal dari data latih. Untuk klaim generalisasi tetap pakai run
`generalization:unseen:LSTM:E` (default dashboard, prediksi out-of-fold). Pembersihan data juga
memakai statistik satu balapan penuh (median balapan, tren stint terpusat), sama seperti notebook,
sehingga ini replay protokol penelitian, bukan feed real-time.

## Menjalankan lokal

Windows (PowerShell):

```powershell
cd inference
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env        # lalu isi SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY di .env
uvicorn app.main:app --reload      # http://localhost:8000/docs
pytest
```

macOS / Linux: sama, ganti baris aktivasi dengan `source .venv/bin/activate` dan `cp .env.example .env`.

File `.env` dibaca otomatis oleh `app/db.py`, jadi tidak perlu mengatur variabel lewat shell.
Variabel yang sudah ada di environment tetap diutamakan (ini yang terjadi di Render).

Jika model dilatih ulang, ekspor lagi lalu commit folder `model/`:

```bash
python scripts/export_model.py ../experiment_results_v7
```

## Deploy ke Render

Konfigurasi ada di `render.yaml` (root repo): satu web service Docker, Root Directory `inference`,
health check `/health`, plan Free.

1. Render → **New → Blueprint** → hubungkan repo `devilk1d/nextlap` dan pilih branch yang berisi
   `render.yaml`. Render membaca file itu dan membuat service `nextlap-inference`.
2. Saat diminta, isi dua variabel rahasia:
   - `SUPABASE_URL` = URL project `nextlap`
   - `SUPABASE_PUBLISHABLE_KEY` = publishable key (read-only, sama dengan website)
3. Setelah build selesai, buka `https://<nama-service>.onrender.com/health` lalu `/docs`.
4. Di dashboard Render, ubah `ALLOWED_ORIGINS` dari `*` ke domain website di Vercel
   (mis. `https://nextlap.vercel.app`; beberapa origin dipisah koma).

Tanpa Blueprint (manual): **New → Web Service**, Language = Docker, Root Directory = `inference`,
Health Check Path = `/health`, lalu isi variabel yang sama.

Jangan isi `SUPABASE_SECRET_KEY` di Render; key itu hanya untuk backfill dari laptop.

Catatan plan Free: service tidur setelah ±15 menit tanpa permintaan, jadi permintaan pertama
sesudahnya bisa butuh beberapa puluh detik. Buka `/health` beberapa menit sebelum demo.

## Menyimpan prediksi model final ke Supabase (opsional)

Run `final:LSTM:E` (id 43) dan pembanding `final:Mean-3` (id 44) ada di `model_runs`. Skrip ini mengisi
prediksi keduanya (Mean-3 memakai label `origin` yang sama dengan LSTM, karena website membandingkan per origin):

```bash
cd inference
python -m scripts.backfill_predictions            # hitung + cetak RMSE per balapan dan per origin
# isi SUPABASE_SECRET_KEY di .env (hanya di laptop), lalu:
python -m scripts.backfill_predictions --write
```

Setelah itu prediksinya tersedia lewat `GET /api/races/:raceId?model_run_id=43` di website. Dashboard
memakai run dengan `is_default = true`. Jika run 43 dijadikan default, ingat bahwa 31.460 dari 40.440
prediksinya berlabel `in_sample` (data latih); untuk klaim generalisasi gunakan run 41 (out-of-fold).
Website menyimpan hasil query di cache (`"use cache"`, beberapa jam), jadi perubahan `is_default`
baru terlihat setelah server di-restart / redeploy.
