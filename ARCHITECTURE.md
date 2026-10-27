# Arsitektur: Affiliate Prompt Studio v1 (Next.js + Supabase)
*24 Oktober 2026 · berdasarkan [PRD.md](PRD.md) v0.5*

## 0. Ringkasan

Versi ini menambahkan **login, database, dan penyimpanan gambar di cloud** pada MVP yang sekarang masih web statis. Prinsip PRD tetap berlaku:

- **Gratis.** Semua komponen jalan di free tier: Vercel Hobby + Supabase Free.
- **Tanpa API AI.** Server tidak pernah memanggil ChatGPT, Gemini, atau Flow. Pengguna tetap copy-paste ke tool tersebut. Tugas server hanya menyimpan, memvalidasi, dan menyusun prompt.
- **Logika inti dipakai ulang.** Penyusun prompt, parser JSON, dan validasi Flow dari `app.js` dipindah ke `src/lib/` sebagai fungsi murni, sehingga bisa dipakai di browser maupun server.

| Lapisan | Teknologi |
|---|---|
| Frontend | Next.js 15 (App Router), React, TypeScript, Tailwind CSS |
| State & form | TanStack Query (data server), React Hook Form + Zod (form) |
| Backend | Next.js Route Handlers (`/api/*`) di Vercel Functions |
| Database | Supabase Postgres + Row Level Security (RLS) |
| Auth | Supabase Auth: Google OAuth (PKCE), cadangan magic link email |
| File | Supabase Storage (bucket privat + signed URL) |
| Test | Vitest (unit), Playwright (e2e) |

```
┌─────────────────────────── Browser ───────────────────────────┐
│  Next.js (React)                                               │
│  ├─ UI wizard & kartu scene                                    │
│  ├─ lib/prompts · lib/parser · lib/flow  (fungsi murni)        │
│  └─ supabase-js (sesi + upload langsung ke Storage)            │
└───────────┬───────────────────────────────┬────────────────────┘
            │ fetch /api/* (cookie sesi)    │ PUT signed upload URL
┌───────────▼──────────── Vercel ───────────┼────────────────────┐
│  middleware.ts (refresh sesi, guard)      │                    │
│  Route Handlers /api/*                    │                    │
│  └─ Zod → lib/* → Supabase server client  │                    │
└───────────┬───────────────────────────────┼────────────────────┘
            │ SQL (sebagai user, RLS aktif) │
┌───────────▼──────────── Supabase ─────────▼────────────────────┐
│  Auth (Google)   Postgres + RLS          Storage (privat)      │
└────────────────────────────────────────────────────────────────┘

Di luar sistem (manual oleh pengguna, copy-paste):
  ChatGPT / Gemini  ← prompt naskah, prompt gambar, regenerate
  Google Flow       ← gambar scene + JSON scene
```

---

## 1. Struktur Project

```
affiliate-prompt-studio/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                       # landing + tombol "Masuk dengan Google"
│  │  ├─ login/page.tsx
│  │  ├─ auth/callback/route.ts         # tukar kode OAuth → sesi (cookie)
│  │  ├─ (app)/                         # semua halaman di sini wajib login
│  │  │  ├─ layout.tsx                  # navbar, cek sesi
│  │  │  ├─ dashboard/page.tsx          # daftar konten (pengganti "Riwayat")
│  │  │  ├─ projects/new/page.tsx       # wizard: Produk → Model → Konten → Flow
│  │  │  ├─ projects/[id]/page.tsx      # prompt naskah, tempel JSON, kartu scene
│  │  │  ├─ library/products/page.tsx   # produk tersimpan
│  │  │  ├─ library/models/page.tsx     # Model Profile tersimpan
│  │  │  └─ settings/page.tsx           # default Pengaturan Flow, nomor konten
│  │  └─ api/                           # lihat bagian 4
│  │     ├─ me/route.ts
│  │     ├─ import/route.ts
│  │     ├─ templates/route.ts
│  │     ├─ products/route.ts · products/[id]/route.ts · products/[id]/photo/route.ts
│  │     ├─ models/route.ts · models/[id]/route.ts · models/[id]/photo/route.ts
│  │     ├─ projects/route.ts · projects/[id]/route.ts
│  │     ├─ projects/[id]/script/route.ts
│  │     ├─ projects/[id]/export/route.ts
│  │     ├─ scenes/[id]/route.ts
│  │     ├─ scenes/[id]/images/route.ts
│  │     └─ scene-images/[id]/route.ts · scene-images/[id]/complete/route.ts
│  ├─ components/
│  │  ├─ wizard/        # ProductStep, ModelStep, ContentStep, FlowSettingsStep
│  │  ├─ scene/         # SceneCard, FlowSetup, ImageDrop, RegenPanel, SceneJson
│  │  └─ ui/            # Button, Card, Alert, Toast, CopyButton
│  ├─ lib/
│  │  ├─ prompts/       # script.ts, image.ts, regen.ts   ← dari app.js
│  │  ├─ parser/        # extract.ts, repair.ts, normalize.ts, validate.ts
│  │  ├─ flow/          # compat.ts (flowIssues), labels.ts
│  │  ├─ export/        # sheet.ts (sheetRows), filenames.ts (fileBase)
│  │  ├─ schemas/       # Zod: brief, flowSettings, scene, project
│  │  ├─ images/        # compress.ts (resize + WebP sebelum upload)
│  │  ├─ api/           # respons standar, error, wrapper auth
│  │  └─ supabase/      # browser.ts, server.ts, middleware.ts
│  └─ middleware.ts
├─ supabase/
│  ├─ migrations/0001_init.sql          # tabel, RLS, trigger, bucket
│  └─ seed.sql                          # template sistem (Skincare, Fashion, …)
├─ tests/
│  ├─ unit/      # parser (pakai contoh "Konten 81"), compat Flow, prompt
│  └─ e2e/       # login → buat konten → tempel JSON → upload gambar
└─ .env.local    # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
```

**Aturan:** `src/lib/*` tidak boleh mengimpor React atau Supabase. Isinya fungsi murni yang dipakai komponen (untuk preview langsung) dan route handler (untuk validasi final). Dengan begitu, aturan seperti "Ingredients tidak didukung di Quality" cukup ditulis sekali.

---

## 2. Alur Frontend & Backend

### 2.1 Halaman & navigasi

```
/ (landing) ──login──► /dashboard ──"Konten baru"──► /projects/new
                          │                              │ simpan (POST /api/projects)
                          │                              ▼
                          └──────── klik konten ──► /projects/[id]
                                                      ├─ Tab 1: Prompt naskah (copy)
                                                      ├─ Tab 2: Tempel JSON
                                                      └─ Tab 3: Scene (gambar + JSON)
```

### 2.2 Alur frontend di `/projects/[id]`

| Langkah UI | Yang terjadi di frontend | Panggilan server |
|---|---|---|
| Buka halaman | Ambil project + scene + signed URL gambar | `GET /api/projects/:id` |
| Copy prompt naskah | Teks sudah tersimpan di `project.script_prompt` | – |
| Tempel JSON → Proses | Parser lokal langsung menampilkan error/peringatan (cepat). Kalau valid, kirim teks mentah ke server | `PUT /api/projects/:id/script` |
| Copy prompt gambar / regenerate | Disusun di browser dari `lib/prompts` | – |
| Masukkan gambar (seret / Ctrl+V / pilih file) | Kompres ke WebP ≤ 1080×1920 → minta URL upload → upload langsung ke Storage → konfirmasi | `POST /api/scenes/:id/images` → PUT Storage → `POST /api/scene-images/:id/complete` |
| Edit JSON scene | Validasi Zod lokal → simpan | `PATCH /api/scenes/:id` |
| Copy untuk spreadsheet | `lib/export/sheet.ts` di browser | – |
| Download semua gambar | Unduh dari signed URL, zip di browser (JSZip) | – |

**State:**
- Data server dikelola TanStack Query (cache + invalidasi setelah mutasi).
- Form wizard memakai React Hook Form + Zod.
- Draft sebelum disimpan: localStorage. Setelah project dibuat: auto-save `PATCH` dengan debounce 1 detik.

### 2.3 Alur backend (setiap request `/api/*`)

```
Request
  │
  ▼
middleware.ts ── refresh token Supabase di cookie
  │
  ▼
Route Handler
  ├─ 1. createServerClient(cookies) → getUser()        ✗ → 401 UNAUTHENTICATED
  ├─ 2. Validasi body/query dengan Zod                  ✗ → 400 VALIDATION_ERROR
  ├─ 3. Aturan domain dari lib/* (flowIssues,
  │      produk terlarang, parser, batas ukuran)        ✗ → 422 (kode spesifik)
  ├─ 4. Query Supabase sebagai user (RLS menyaring)     ✗ → 404 NOT_FOUND
  └─ 5. Respons { data } atau { error }
```

Server **tidak memakai service role key** untuk request pengguna. Semua query berjalan sebagai user yang login, jadi meskipun ada bug di handler, RLS tetap mencegah akses ke data orang lain.

---

## 3. Struktur Database

### 3.1 ERD

```
auth.users (Supabase)
    │ 1
    │ 1
profiles ──1───────────────┐
    │                      │
    │1                     │1
    │ *                    │ *
products            models (Model Profile)
    │ 0..1                 │ 0..1
    └──────────┐   ┌───────┘
               │ * │ *
              projects ──1────* scenes ──1────* scene_images
                 │                  └── active_image_id ──► scene_images (0..1)
                 * (opsional)
templates (sistem + milik user)
```

### 3.2 Tabel

**profiles**: 1 baris per user, dibuat otomatis oleh trigger saat pendaftaran.

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid PK, FK → auth.users | |
| display_name | text | |
| next_content_number | int, default 1 | Nomor konten berikutnya (81 → 82) |
| default_flow | jsonb | Pengaturan Flow default (mode, model, ratio, …) |
| created_at | timestamptz | |

**products**

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → profiles | |
| name | text, not null | |
| category, size | text | |
| details, selling_points, promo | text | |
| photo_path | text | Path di bucket `product-photos` |
| created_at, updated_at | timestamptz | |

**models** (Model Profile)

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| name | text | cth. "Rina – kasual" |
| gender | text check in ('Perempuan','Laki-laki') | |
| notes | text | |
| photo_path | text | Bucket `model-photos` |
| consent_at | timestamptz, not null | Waktu centang "punya izin & 18+" |

**projects**: 1 konten = 1 project.

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| content_number | int | Unik per user → nama file "Konten 81 - Scene 1" |
| title, style | text | Dari JSON ChatGPT (`project_title`, `style`) |
| product_id | uuid FK null | Snapshot data produk juga disimpan di `brief` |
| model_id | uuid FK null | |
| talent_mode | text check in ('model','product') | Dengan model / produk saja |
| brief | jsonb | Isian form: produk, story, tone, setting, CTA, jumlah scene, catatan |
| flow_settings | jsonb | `{mode, model, ratio, duration, outputs, image_tool, image_model, voice}` |
| script_prompt | text | Prompt naskah yang dikirim ke ChatGPT |
| raw_script | jsonb | JSON lengkap dari ChatGPT setelah dirapikan |
| status | text | `draft` → `script_ready` → `images_ready` → `done` |
| created_at, updated_at | timestamptz | |
| | | `unique (user_id, content_number)` |

**scenes**

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK, on delete cascade | |
| scene_number | int | `unique (project_id, scene_number)` |
| start_time, end_time | text | "00:08" |
| duration_seconds | int | |
| data | jsonb | Objek scene **utuh** (visual_description, audio_transcript, …). Field tambahan dari ChatGPT tidak hilang |
| active_image_id | uuid FK → scene_images, null | Gambar yang dipakai sebagai start frame |
| updated_at | timestamptz | |

**scene_images**: menyimpan setiap versi gambar, termasuk hasil regenerate.

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid PK | |
| scene_id | uuid FK, on delete cascade | |
| user_id | uuid FK | Untuk RLS & path storage |
| storage_path | text | `{user_id}/{project_id}/{scene_number}/{id}.webp` |
| mime, width, height, bytes | text/int | |
| source | text check in ('flow','chatgpt','gemini','upload') | |
| regen_fixes | text[] | Pilihan cepat, cth. "Produk berubah" |
| regen_notes | text | Catatan perbaikan |
| status | text check in ('pending','ready') | `pending` sampai upload dikonfirmasi |
| created_at | timestamptz | |

**templates**

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid PK | |
| user_id | uuid null | null = template sistem (Skincare, Fashion, …) |
| key, label | text | |
| values | jsonb | Isian form yang diisi otomatis |

**Kenapa memakai jsonb untuk `scenes.data`, `brief`, dan `flow_settings`?** Format JSON dari ChatGPT dan menu Flow bisa berubah sewaktu-waktu. Struktur ini divalidasi dengan Zod di aplikasi, sedangkan kolom yang dipakai untuk urutan atau filter (scene_number, status, content_number) tetap dibuat sebagai kolom biasa.

### 3.3 Potongan migrasi (inti)

```sql
-- Profil otomatis saat user mendaftar
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nomor konten atomik (aman kalau dua tab membuat konten bersamaan)
create function public.take_content_number() returns int
language sql security invoker as $$
  update profiles set next_content_number = next_content_number + 1
  where id = auth.uid()
  returning next_content_number - 1;
$$;

-- RLS: pola yang sama untuk products, models, projects, scene_images
alter table projects enable row level security;
create policy "own rows" on projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- scenes tidak punya user_id → cek lewat project
alter table scenes enable row level security;
create policy "own scenes" on scenes for all using (
  exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
);

-- Storage: folder pertama path = user id
create policy "own files" on storage.objects for all using (
  bucket_id in ('product-photos','model-photos','scene-images')
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

---

## 4. Struktur API

**Konvensi**
- Semua endpoint wajib login (cookie sesi Supabase). Tanpa sesi → `401`.
- Respons sukses: `{ "data": … }`. Respons error: `{ "error": { "code": "…", "message": "…", "details"?: … } }`. Pesan error berbahasa Indonesia, siap ditampilkan.
- Daftar memakai cursor pagination: `?cursor=<created_at,id>&limit=20`.

### 4.1 Daftar endpoint

| Method | Path | Body / Query | Respons | Catatan |
|---|---|---|---|---|
| GET | `/api/me` | – | profil + default_flow | |
| PATCH | `/api/me` | `{display_name?, default_flow?, next_content_number?}` | profil | |
| POST | `/api/import` | `{ history: [...] }` dari localStorage v2 | `{ imported: n }` | Sekali jalan setelah login pertama |
| GET | `/api/templates` | – | template sistem + milik user | |
| GET / POST | `/api/products` | `?q=` / data produk | list / produk | Produk terlarang → `422 PRODUCT_BLOCKED` |
| GET / PATCH / DELETE | `/api/products/:id` | | | |
| POST | `/api/products/:id/photo` | `{mime, bytes}` | `{upload_url, path}` | Signed upload URL |
| GET / POST | `/api/models` | data model + `consent: true` | list / model | Tanpa consent → `422 CONSENT_REQUIRED` |
| GET / PATCH / DELETE | `/api/models/:id` | | | |
| POST | `/api/models/:id/photo` | `{mime, bytes}` | `{upload_url, path}` | |
| GET | `/api/projects` | `?status=&q=&cursor=` | list ringkas + thumbnail scene 1 | Untuk dashboard |
| POST | `/api/projects` | `{product_id? \| product, model_id?, talent_mode, brief, flow_settings, content_number?}` | project + `script_prompt` | Server menjalankan `flowIssues` & filter produk, lalu menyusun prompt |
| GET | `/api/projects/:id` | – | project + scenes + gambar aktif (signed URL 1 jam) | |
| PATCH | `/api/projects/:id` | `{title?, brief?, flow_settings?, status?}` | project | Ubah brief/flow → `script_prompt` disusun ulang |
| DELETE | `/api/projects/:id` | – | `204` | Hapus scene, gambar, dan file storage |
| PUT | `/api/projects/:id/script` | `{ text }` (teks mentah tempelan) | `{project, scenes, info[], warnings[]}` | Parser + normalize + validate. Mengganti semua scene. Gagal → `422 SCRIPT_INVALID` + `{line, column}` |
| GET | `/api/projects/:id/export` | `?format=json\|sheet` | `text/plain` | `sheet` = baris TSV seperti format spreadsheet |
| PATCH | `/api/scenes/:id` | `{ data }` | scene | Edit JSON scene manual |
| POST | `/api/scenes/:id/images` | `{mime, bytes, width, height, source, regen_fixes?, regen_notes?}` | `{image_id, upload_url}` | Membuat baris `pending`. Maks. 10 MB, hanya image/* |
| POST | `/api/scene-images/:id/complete` | – | gambar + signed URL | Cek file ada di Storage → `ready`, jadikan gambar aktif |
| PATCH | `/api/scene-images/:id` | `{ active: true }` | scene | Pilih versi lama sebagai gambar aktif |
| DELETE | `/api/scene-images/:id` | – | `204` | |

### 4.2 Kode error

| Kode | HTTP | Kapan |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Tidak ada sesi / sesi kedaluwarsa |
| `NOT_FOUND` | 404 | Data tidak ada atau milik user lain (RLS) |
| `VALIDATION_ERROR` | 400 | Body tidak sesuai skema Zod |
| `PRODUCT_BLOCKED` | 422 | Produk masuk kategori terlarang |
| `CONSENT_REQUIRED` | 422 | Model tanpa persetujuan izin/18+ |
| `FLOW_INCOMPATIBLE` | 422 | Kombinasi Flow tidak didukung (`details: string[]`) |
| `SCRIPT_INVALID` | 422 | JSON tidak bisa dibaca (`details: {line, column}`) |
| `CONTENT_NUMBER_TAKEN` | 409 | Nomor konten sudah dipakai |
| `FILE_TOO_LARGE` / `UNSUPPORTED_FILE` | 413 / 415 | Upload gambar |

### 4.3 Contoh: `PUT /api/projects/:id/script`

```http
PUT /api/projects/7f3c…/script
Content-Type: application/json

{ "text": "Berikut naskahnya:\n```json\n{ \"project_title\": \"Jas Hujan…\", \"scenes\": [ … ] }\n```" }
```
```json
{
  "data": {
    "project": { "id": "7f3c…", "title": "Jas Hujan Spotlight APD Setelan Viral", "status": "script_ready" },
    "scenes": [{ "id": "…", "scene_number": 1, "start_time": "00:00", "end_time": "00:08", "data": { "…": "…" } }],
    "info": ["JSON diperbaiki otomatis (format spreadsheet, …)"],
    "warnings": ["Scene 2: dialog 24 kata, kemungkinan terlalu panjang untuk 8 detik"]
  }
}
```

---

## 5. Alur Autentikasi

Memakai **Supabase Auth + Google OAuth (PKCE)** dengan sesi di cookie httpOnly (`@supabase/ssr`).

```
Browser                 Next.js (Vercel)            Supabase Auth           Google
   │ klik "Masuk dengan Google"                          │                     │
   │── signInWithOAuth({provider:'google',               │                     │
   │     redirectTo:'/auth/callback'}) ─────────────────►│                     │
   │◄──────────────── redirect ke halaman izin Google ───┼────────────────────►│
   │                                                      │◄── kode otorisasi ──│
   │◄──── redirect /auth/callback?code=… ─────────────────│                     │
   │── GET /auth/callback?code ──►│                       │                     │
   │                              │── exchangeCodeForSession(code) ────►│       │
   │                              │◄── access + refresh token ──────────│       │
   │                              │   (trigger DB membuat baris profiles)       │
   │◄── Set-Cookie (httpOnly) + redirect /dashboard ──│                         │
   │                                                                            │
   │── request berikutnya (cookie) ──►│ middleware.ts: refresh token jika perlu │
   │                                  │ route (app)/* tanpa sesi → /login       │
   │── Keluar ──► signOut() → cookie dihapus → /                                │
```

**Detail penting**
- **Guard:** `middleware.ts` melindungi `/dashboard`, `/projects/*`, `/library/*`, `/settings`, dan `/api/*`. Halaman dan API juga memanggil `getUser()` sendiri, tidak hanya mengandalkan middleware.
- **Login pertama:** kalau localStorage berisi riwayat dari versi lama (`aps.history.v2`), tampilkan tawaran "Impor riwayat lokal?" → `POST /api/import`.
- **Cadangan:** magic link email untuk pengguna yang tidak mau memakai Google.
- **Keamanan:** hanya anon key yang ada di browser. Service role key hanya untuk migrasi/admin dan tidak pernah dipakai di route pengguna.

---

## 6. Alur Data

### 6.1 Siklus hidup satu konten

```
[1] Wizard ──POST /api/projects──► projects (status=draft, script_prompt)
         │  (produk/model dari library atau baru)
         ▼
[2] Pengguna copy prompt naskah ──► ChatGPT (+ foto produk & model)       ← manual
         │                             │
         │                             ▼ JSON naskah
[3] Tempel ──PUT /script──► parser (extract → repair → normalize → validate)
         │                    ├─ projects.raw_script, title, style
         │                    └─ scenes (1 baris/scene, data jsonb)      status=script_ready
         ▼
[4] Per scene: copy prompt gambar ──► Flow Images / ChatGPT / Gemini     ← manual
         │                                  │ gambar
         ▼                                  ▼
[5] Masukkan gambar ──► kompres WebP (browser)
         ├─ POST /scenes/:id/images ──► scene_images (pending) + signed upload URL
         ├─ PUT file ───────────────► Storage scene-images/{uid}/{project}/{n}/{id}.webp
         └─ POST /complete ─────────► ready + scenes.active_image_id
         │   (regenerate = ulangi [4]–[5]; versi lama tetap tersimpan)
         ▼                                         semua scene ada gambar → images_ready
[6] Ekspor: download gambar (nama "Konten 81 - Scene n") + copy JSON scene
         └──────────────────────────────► Google Flow (Frames/Ingredients) ← manual
[7] Tandai selesai ──PATCH status=done
```

### 6.2 Data apa disimpan di mana

| Data | Lokasi | Siapa yang bisa akses |
|---|---|---|
| Sesi login | Cookie httpOnly | Browser pemilik |
| Draft form sebelum disimpan | localStorage | Browser pemilik |
| Produk, model, project, scene | Postgres | Pemilik saja (RLS) |
| Foto produk/model, gambar scene | Storage privat | Pemilik saja; ditampilkan lewat signed URL (1 jam) |
| Teks ke/dari ChatGPT, Gemini, Flow | Tidak lewat server | Dipindahkan pengguna lewat clipboard |

### 6.3 Batas free tier & penghematan

- Gambar dikompres di browser ke **WebP ≤ 1080×1920 (±200–400 KB)** sebelum diunggah. Foto asli resolusi penuh tidak disimpan.
- Storage gratis Supabase cukup untuk ribuan gambar dalam ukuran itu. Cek angka terbaru di halaman pricing Supabase sebelum rilis.
- Versi gambar lama yang tidak aktif bisa dibersihkan otomatis setelah 30 hari (cron Supabase).
- Vercel Functions dipakai hanya untuk JSON kecil. File diunggah **langsung** dari browser ke Storage, sehingga tidak melewati batas ukuran body serverless.

---

## 7. Keamanan & Kualitas

| Area | Penerapan |
|---|---|
| Isolasi data | RLS di semua tabel + kebijakan Storage per folder user |
| Validasi | Zod di client (UX) **dan** di server (otoritatif); aturan Flow dan produk terlarang dijalankan ulang di server |
| Upload | Hanya `image/*`, maks. 10 MB, path dibuat server, status `pending` → `ready` |
| XSS | Teks dari ChatGPT dirender sebagai teks (React escape), tidak pernah lewat `dangerouslySetInnerHTML` |
| Rate limit | `PUT /script` dan `POST /images`: ±30/menit per user (cukup tabel counter sederhana di Postgres) |
| Test | Port skenario tes headless yang sekarang ke Vitest; contoh "Konten 81" menjadi fixture parser |

---

## 8. Rencana Migrasi dari Versi Sekarang

*Progres (25 Okt 2026): langkah 1–2 sudah ada di folder [affiliate-prompt-studio/](affiliate-prompt-studio/README.md).*

1. **Fondasi:** setup Next.js + Supabase, migrasi `0001_init.sql`, login Google.
2. **Port logika:** pindahkan fungsi dari `app.js` ke `src/lib/*` (TypeScript) + unit test.
3. **Project & scene:** wizard, `POST /projects`, `PUT /script`, kartu scene (tanpa upload dulu).
4. **Gambar:** upload ke Storage, versi regenerate, ekspor.
5. **Library & impor:** produk, Model Profile, impor riwayat localStorage.
6. **Rilis:** deploy ke Vercel, isi URL callback OAuth di Google Cloud Console dan Supabase.
