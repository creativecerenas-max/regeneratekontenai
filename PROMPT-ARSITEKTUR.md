Berdasarkan PRD ini:

===== AWAL PRD =====
# PRD: Affiliate Prompt Studio, v0.5

## Keputusan
| Topik | Keputusan |
|---|---|
| AI | ChatGPT/Gemini versi web gratis milik pengguna, tanpa API (copy-paste) |
| Output akhir | Per scene: gambar start frame + prompt JSON untuk diunggah ke Google Flow |
| Gambar scene | Dibuat di Flow (tab Images, Nano Banana), ChatGPT, atau Gemini; bisa di-regenerate |
| Platform | Web saja, responsif untuk HP |
| Biaya | Gratis (free tier), tanpa API key AI |

## Masalah
Affiliate perlu banyak video promosi, tapi menulis naskah dan prompt video (Google Flow/Veo) yang konsisten dan menjual itu lama dan butuh keahlian. Hasil video sering tidak konsisten: wajah model berubah, detail produk hilang, dan pengaturan di Flow sering salah pilih.

## Target Pengguna
- Affiliate pemula (TikTok Shop/Shopee) yang belum paham AI
- Affiliate aktif yang membuat banyak video per hari
- Tim konten kecil / agensi
- Seller UMKM (sekunder)

## Alur
1. Isi form: produk, model (atau produk saja), konten (nomor konten, jumlah scene 1–5, alur cerita, tone, CTA), dan Pengaturan Flow. Atau pakai template.
2. Aplikasi menyusun prompt naskah. Di ChatGPT: unggah foto produk + model, lalu tempel prompt.
3. ChatGPT membalas JSON naskah: project_title, style, scenes[] (scene_number, start_time, end_time, duration_seconds, visual_description, camera_style, lighting, emotion_or_tone, key_focus, interaction_cue, visual_quality, audio_instruction, audio_transcript).
4. Tempel JSON ke aplikasi. Format salinan spreadsheet juga diterima.
5. Untuk setiap scene, aplikasi menyediakan:
   - Panduan pengaturan Flow (menu, model, aspect ratio, generation length, number of outputs, start frame/ingredients)
   - Prompt gambar (start frame) untuk Flow Images / ChatGPT / Gemini
   - Prompt regenerate dengan pilihan perbaikan cepat + catatan
   - Slot gambar (seret / Ctrl+V / pilih file), download sebagai "Konten {n} - Scene {i}.png"
   - JSON scene siap copy ke Flow
6. Hasil akhir: gambar + JSON per scene diunggah ke Flow.

## Pengaturan Flow
| Pengaturan | Pilihan |
|---|---|
| Mode video | Frames (start frame), Ingredients (referensi), Text to Video |
| Model | Veo 3.1 - Lite / Fast / Quality, Gemini Omni Flash 1.1 |
| Aspect ratio | Portrait 9:16, Landscape 16:9 |
| Generation length | 4 / 6 / 8 detik (10 detik khusus Omni) |
| Number of outputs | 1–4 |
| Gambar scene dibuat di | Flow (tab Images: Nano Banana 2 Lite / 2.1 / Pro), ChatGPT, Gemini |
| Voice | @Voice, khusus Omni Flash + Ingredients |

Kombinasi yang tidak didukung diblokir: Ingredients + Quality, Ingredients di Lite/Fast selain 8 detik, 10 detik selain Omni, Voice di luar Omni + Ingredients. Batas dialog menyesuaikan durasi (±2,5 kata per detik).

## Fitur
1. Login (Google) dan sinkronisasi cloud
2. Library produk dan Model Profile (foto + data tersimpan)
3. Form produk, model (atau mode tanpa model + voiceover), konten, dan Pengaturan Flow
4. 5 template cepat: Skincare, Fashion, Gadget, Makanan, Rumah tangga
5. Generator prompt naskah multi-scene dengan format JSON yang baku
6. Penempel JSON: ekstrak dari balasan, perbaikan otomatis (format spreadsheet, smart quotes, trailing comma, kurung terpotong), merapikan nomor/waktu scene, dan lokasi error
7. Peringatan per scene: dialog terlalu panjang, klaim berisiko, durasi berbeda dengan pengaturan Flow
8. Kartu scene: panduan pengaturan Flow, prompt gambar, prompt regenerate, slot gambar (semua versi regenerate tersimpan), download dengan nama file baku
9. Copy JSON per scene, Copy semua JSON, Copy untuk spreadsheet, Download semua gambar
10. Dashboard riwayat konten + nomor konten otomatis naik
11. Impor riwayat lama dari localStorage (versi web statis sebelumnya)
12. Filter produk terlarang + persetujuan hak foto / model 18+

## Edge Case
- Balasan ChatGPT berisi teks selain JSON → ambil blok JSON-nya
- JSON disalin dari spreadsheet, smart quotes, trailing comma, kurung terpotong → perbaikan otomatis
- JSON tetap tidak valid → tampilkan baris/kolom error
- Yang ditempel hanya array scene atau satu scene → tetap diterima
- Nomor scene/waktu tidak urut → dirapikan otomatis
- Kombinasi pengaturan Flow tidak didukung → diblokir
- Produk terlarang → prompt tidak dibuat
- Tanpa foto model → mode "Produk saja" dengan voiceover
- File bukan gambar / format tidak terbaca → pesan error
- Kuota penyimpanan gratis terbatas → gambar dikompres sebelum disimpan

## Metrik
- Median waktu dari isi form sampai semua JSON scene tersalin < 10 menit (3 scene)
- ≥ 60% konten yang dibuat sampai tahap tempel JSON
- ≥ 30% pengguna kembali dalam 7 hari
===== AKHIR PRD =====

dan tech stack ini:

===== AWAL TECH STACK =====
- Frontend: Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- State & form: TanStack Query, React Hook Form + Zod
- Backend: Next.js Route Handlers (/api/*) di Vercel Functions
- Database: Supabase Postgres + Row Level Security
- Auth: Supabase Auth (Google OAuth), cadangan magic link email
- File storage: Supabase Storage (bucket privat + signed URL)
- Hosting: Vercel (free tier) + Supabase (free tier)
- Test: Vitest (unit), Playwright (e2e)
- Catatan: server tidak memanggil API AI apa pun; ChatGPT, Gemini, dan Flow dipakai pengguna lewat copy-paste
===== AKHIR TECH STACK =====

Buatkan desain arsitektur aplikasi, meliputi:
- Struktur project
- Alur frontend dan backend
- Struktur database
- Struktur API
- Alur autentikasi
- Alur data

Tampilkan dalam bentuk diagram atau penjelasan terstruktur.
