# PRD: Affiliate Prompt Studio, v0.5
*24 Oktober 2026*

## Keputusan
| Topik | Keputusan |
|---|---|
| AI | ChatGPT/Gemini **versi web gratis milik pengguna**, tanpa API (copy-paste) |
| Output akhir | Per scene: **gambar start frame + prompt JSON** untuk diunggah ke Google Flow |
| Gambar scene | Dibuat di Flow (tab Images, Nano Banana), ChatGPT, atau Gemini; bisa di-regenerate |
| Platform | Web saja, responsif untuk HP |
| Biaya | Gratis: web statis, tanpa backend, tanpa API key |

## Masalah
Affiliate perlu banyak video promosi, tapi menulis naskah dan prompt video (Google Flow/Veo) yang konsisten dan menjual itu lama dan butuh keahlian. Hasil video sering tidak konsisten: wajah model berubah, detail produk hilang, dan pengaturan di Flow sering salah pilih.

## Target Pengguna
- Affiliate pemula (TikTok Shop/Shopee) yang belum paham AI
- Affiliate aktif yang membuat banyak video per hari
- Tim konten kecil / agensi
- Seller UMKM (sekunder)

## Alur
1. Isi form: produk, model (atau produk saja), konten (nomor konten, jumlah scene 1–5, alur cerita, tone, CTA), dan Pengaturan Flow. Atau pakai template.
2. Aplikasi menyusun **prompt naskah**. Di ChatGPT: unggah foto produk + model, lalu tempel prompt.
3. ChatGPT membalas JSON naskah: `project_title`, `style`, `scenes[]` (`scene_number`, `start_time`, `end_time`, `duration_seconds`, `visual_description`, `camera_style`, `lighting`, `emotion_or_tone`, `key_focus`, `interaction_cue`, `visual_quality`, `audio_instruction`, `audio_transcript`).
4. Tempel JSON ke aplikasi. Format salinan spreadsheet juga diterima.
5. Untuk setiap scene, aplikasi menyediakan:
   - Panduan **pengaturan Flow** (menu, model, aspect ratio, generation length, number of outputs, start frame/ingredients)
   - **Prompt gambar** (start frame) untuk Flow Images / ChatGPT / Gemini
   - **Prompt regenerate** dengan pilihan perbaikan cepat + catatan
   - Slot gambar (seret / Ctrl+V / pilih file), download sebagai `Konten {n} - Scene {i}.png`
   - **JSON scene** siap copy ke Flow
6. Hasil akhir: gambar + JSON per scene diunggah ke Flow.

## Pengaturan Flow
Label sama seperti di Google Flow:

| Pengaturan | Pilihan |
|---|---|
| Mode video | Frames (start frame), Ingredients (referensi), Text to Video |
| Model | Veo 3.1 - Lite / Fast / Quality, Gemini Omni Flash 1.1 |
| Aspect ratio | Portrait 9:16, Landscape 16:9 |
| Generation length | 4 / 6 / 8 detik (10 detik khusus Omni) |
| Number of outputs | 1–4 |
| Gambar scene dibuat di | Flow (tab Images: Nano Banana 2 Lite / 2.1 / Pro), ChatGPT, Gemini |
| Voice | @Voice, khusus Omni Flash + Ingredients |

Kombinasi yang tidak didukung diblokir, berdasarkan [tabel model Flow](https://support.google.com/labs/answer/16352836): Ingredients + Quality, Ingredients di Lite/Fast selain 8 detik, 10 detik selain Omni, dan Voice di luar Omni + Ingredients. Batas dialog menyesuaikan durasi (±2,5 kata per detik).

## Fitur MVP
1. Form produk, model (atau mode tanpa model + voiceover), konten, dan Pengaturan Flow
2. 5 template cepat: Skincare, Fashion, Gadget, Makanan, Rumah tangga
3. Generator prompt naskah multi-scene dengan format JSON yang baku
4. Penempel JSON: ekstrak dari balasan, perbaikan otomatis (format spreadsheet, smart quotes, trailing comma, kurung terpotong), merapikan nomor/waktu scene, dan lokasi error
5. Peringatan per scene: dialog terlalu panjang untuk durasinya, klaim berisiko, durasi berbeda dengan pengaturan Flow
6. Kartu scene: panduan pengaturan Flow, prompt gambar, prompt regenerate, slot gambar, download dengan nama file baku
7. Copy JSON per scene, Copy semua JSON, Copy untuk spreadsheet (1 baris per scene + nama file), Download semua gambar
8. Riwayat di localStorage (maks. 30 konten, thumbnail gambar) + draft form tersimpan otomatis + nomor konten otomatis naik
9. Filter produk terlarang + persetujuan hak foto / model 18+

## Edge Case yang Ditangani
| Kasus | Penanganan |
|---|---|
| Balasan ChatGPT berisi teks selain JSON | Ambil blok ```json atau `{ … }` / `[ … ]` pertama sampai terakhir |
| JSON disalin dari spreadsheet (`""` + nama file per baris) | Dibersihkan dan digabung otomatis |
| JSON rusak (smart quotes, trailing comma, kurung terpotong) | Perbaikan otomatis, lalu beri tahu pengguna |
| JSON tetap tidak valid | Tampilkan baris/kolom error + saran kalimat untuk ChatGPT |
| Yang ditempel hanya array scene atau satu scene | Tetap diterima |
| Nomor scene / waktu tidak urut | Dirapikan otomatis |
| Dialog terlalu panjang untuk durasi scene | Peringatan |
| Klaim berlebihan ("100%", "dijamin", "menyembuhkan") | Peringatan |
| Kombinasi pengaturan Flow tidak didukung | Peringatan langsung + prompt tidak dibuat |
| Produk terlarang (rokok, vape, alkohol, senjata, dll.) | Prompt tidak dibuat |
| Tanpa foto model | Mode "Produk saja" dengan voiceover |
| Gambar dari clipboard bukan gambar / format tidak terbaca | Pesan + saran simpan sebagai PNG/JPG |
| Mode Text to Video | Bagian gambar disembunyikan |
| localStorage penuh atau diblokir | Aplikasi tetap jalan; riwayat disimpan tanpa thumbnail atau diberi pesan |
| Limit gambar ChatGPT/Gemini gratis | Di luar kendali aplikasi; bisa pindah ke Flow Images |

## Di Luar MVP
Login dan sinkronisasi cloud, library produk & Model Profile, batch/multi-variasi, import link marketplace, mode otomatis via API (calon fitur berbayar). Rancangan teknisnya ada di [ARCHITECTURE.md](ARCHITECTURE.md).

## Metrik
- Median waktu dari isi form sampai semua JSON scene tersalin < 10 menit (3 scene)
- ≥ 60% konten yang dibuat sampai tahap tempel JSON
- ≥ 30% pengguna kembali dalam 7 hari
