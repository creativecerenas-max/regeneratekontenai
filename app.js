'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const KEY_DRAFT = 'aps.draft.v2';
const KEY_HISTORY = 'aps.history.v2';
const HISTORY_MAX = 30;
const WORDS_PER_SEC = 2.5;

const FIELDS = [
    'p_name', 'p_category', 'p_size', 'p_details', 'p_points', 'p_promo',
    'm_gender', 'm_desc',
    'k_number', 's_scenes', 's_story', 's_tone', 's_setting', 's_cta', 's_extra',
    'f_mode', 'f_model', 's_ratio', 'f_duration', 'f_outputs', 'f_image_tool', 'f_image_model', 'f_voice',
];

// Nilai bawaan untuk riwayat lama yang belum punya pengaturan Flow
const FLOW_DEFAULTS = {
    f_mode: 'frames', f_model: 'Veo 3.1 - Fast', s_ratio: '9:16', f_duration: '8',
    f_outputs: '1', f_image_tool: 'flow', f_image_model: 'Nano Banana 2 Lite', f_voice: '',
};

const MODE_LABEL = { frames: 'Frames', ingredients: 'Ingredients', text: 'Text to Video' };
const RATIO_LABEL = { '9:16': 'Portrait 9:16', '16:9': 'Landscape 16:9' };
const IMAGE_TOOL_LABEL = { flow: 'Flow', chatgpt: 'ChatGPT', gemini: 'Gemini' };
const OMNI = 'Gemini Omni Flash 1.1';

// Kategori yang umumnya dilarang/dibatasi di program affiliate TikTok Shop & Shopee
const BLOCKED_PRODUCTS = /\b(rokok|vape|vapor|senjata|pistol|airsoft gun|narkoba|ganja|alkohol|miras|bir|wine|vodka|whisky|judi|obat kuat|obat keras|tramadol)\b/i;
const RISKY_CLAIMS = /(100\s?%|dijamin|menyembuhkan|sembuh total|permanen|hasil instan|paling murah|termurah|nomor 1 di indonesia|no\.? ?1 di indonesia|tanpa efek samping)/i;

const QUICK_FIXES = [
    'Wajah model tidak mirip dengan foto asli',
    'Produk berubah (warna/logo/bentuk)',
    'Pose atau aksi tidak sesuai deskripsi',
    'Ukuran produk tidak realistis',
    'Ada teks atau tulisan yang tidak diminta',
    'Terlalu gelap atau kurang tajam',
];

const TEMPLATES = {
    skincare: {
        p_category: 'Skincare & kecantikan', p_size: 'Kecil (muat di genggaman)',
        s_story: 'Problem → solusi → CTA', s_setting: 'Kamar tidur yang rapi dan terang', s_tone: 'Antusias & heboh',
    },
    fashion: {
        p_category: 'Fashion & aksesoris', p_size: 'Dipakai di badan (pakaian/aksesoris)',
        s_story: 'Try-on / OOTD', s_setting: 'Kamar dengan cermin besar', s_tone: 'Santai seperti ngobrol',
    },
    gadget: {
        p_category: 'Gadget & elektronik', p_size: 'Kecil (muat di genggaman)',
        s_story: 'Unboxing → detail → CTA', s_setting: 'Meja kerja minimalis', s_tone: 'Antusias & heboh',
    },
    makanan: {
        p_category: 'Makanan & minuman', p_size: 'Kecil (muat di genggaman)',
        s_story: 'Review jujur', s_setting: 'Dapur rumah yang hangat', s_tone: 'Santai seperti ngobrol',
    },
    rumah: {
        p_category: 'Peralatan rumah tangga', p_size: 'Sedang (dipegang dua tangan)',
        s_story: 'Before → after → CTA', s_setting: 'Ruang tamu rumah', s_tone: 'Hard-selling',
    },
};

const state = {
    project: null,   // JSON naskah yang sudah dirapikan
    ctx: null,       // info form saat naskah diproses (nama produk, rasio, mode, nomor konten)
    images: {},      // { [scene_number]: { file?, url?, thumb } }
    savedId: null,   // id riwayat jika hasil saat ini sudah disimpan
};

/* ---------- Penyimpanan (localStorage bisa diblokir/penuh) ---------- */

const store = {
    get(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    },
};

/* ---------- Utilitas UI ---------- */

let toastTimer;
function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

async function copyText(text, msg = 'Tersalin') {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }
    toast(msg);
}

function showAlert(id, messages) {
    const el = $('#' + id);
    const list = [].concat(messages || []).filter(Boolean);
    if (!list.length) {
        el.hidden = true;
        return;
    }
    el.innerHTML = '';
    if (list.length === 1) {
        el.textContent = list[0];
    } else {
        const ul = document.createElement('ul');
        list.forEach(m => {
            const li = document.createElement('li');
            li.textContent = m;
            ul.appendChild(li);
        });
        el.appendChild(ul);
    }
    el.hidden = false;
}

function button(label, onClick, extra = '') {
    const btn = document.createElement('button');
    btn.className = `btn small ${extra}`.trim();
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
}

function line(label, value) {
    return value ? `- ${label}: ${value}\n` : '';
}

function mmss(sec) {
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

function maxWords(sec) {
    return Math.round(sec * WORDS_PER_SEC);
}

// Kombinasi yang didukung Flow (support.google.com/labs/answer/16352836)
function flowIssues(d) {
    const issues = [];
    const dur = Number(d.f_duration);
    const isOmni = d.f_model === OMNI;
    if (d.f_mode === 'ingredients' && d.f_model === 'Veo 3.1 - Quality') {
        issues.push('Veo 3.1 - Quality belum mendukung Ingredients. Pilih Veo 3.1 - Lite, Veo 3.1 - Fast, atau Gemini Omni Flash 1.1.');
    }
    if (d.f_mode === 'ingredients' && !isOmni && dur !== 8) {
        issues.push('Ingredients di Veo 3.1 - Lite/Fast hanya bisa 8 detik.');
    }
    if (dur === 10 && !isOmni) {
        issues.push('Durasi 10 detik hanya tersedia di Gemini Omni Flash 1.1.');
    }
    if (d.f_voice && !(isOmni && d.f_mode === 'ingredients')) {
        issues.push('Voice Flow hanya bisa dipakai dengan Gemini Omni Flash 1.1 dan mode Ingredients.');
    }
    return issues;
}

function updateFlowNotice() {
    const d = collect();
    $('#imageModelField').hidden = d.f_image_tool !== 'flow';
    showAlert('flowNotice', flowIssues(d));
}

/* ---------- Form ---------- */

function collect() {
    const d = {};
    FIELDS.forEach(id => { d[id] = $('#' + id).value.trim(); });
    d.m_mode = $('input[name="m_mode"]:checked').value;
    return d;
}

function fill(values) {
    FIELDS.forEach(id => {
        if (values[id] !== undefined) $('#' + id).value = values[id];
    });
    if (values.m_mode) {
        const radio = $(`input[name="m_mode"][value="${values.m_mode}"]`);
        if (radio) radio.checked = true;
    }
    updateMode();
}

function saveDraft() {
    store.set(KEY_DRAFT, collect());
}

function updateMode() {
    const withModel = $('input[name="m_mode"]:checked').value === 'model';
    $('#modelFields').hidden = !withModel;
    $('#m_gender_label').textContent = withModel ? 'Gender model' : 'Suara voiceover';
    updateFlowNotice();
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            reject(new Error('unreadable image'));
        };
        img.src = URL.createObjectURL(file);
    });
}

function makeThumb(img, max = 240) {
    const ratio = Math.min(max / img.naturalWidth, max / img.naturalHeight, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    try {
        return canvas.toDataURL('image/jpeg', 0.7);
    } catch {
        return null;
    }
}

function setupPreview(inputId, previewId) {
    const input = $('#' + inputId);
    const box = $('#' + previewId);
    input.addEventListener('change', async () => {
        box.innerHTML = '';
        const file = input.files[0];
        if (!file) return;
        try {
            const img = await loadImage(file);
            img.alt = 'Preview';
            box.appendChild(img);
        } catch {
            box.innerHTML = '<p class="note">Preview tidak tersedia untuk format ini (mis. HEIC). Tidak masalah, tetap unggah file aslinya ke ChatGPT.</p>';
        }
    });
}

/* ---------- Penyusun prompt ---------- */

function voiceInstruction(d) {
    const gender = d.m_gender === 'Laki-laki' ? 'LAKI-LAKI' : 'PEREMPUAN';
    const base = d.m_mode === 'model' ? `MODEL ${gender} BERBICARA LANGSUNG` : `VOICEOVER ${gender}`;
    return d.f_voice ? `${base}, @Voice: ${d.f_voice}` : base;
}

function modeRule(d) {
    if (d.f_mode === 'frames') {
        return 'Setiap scene memakai gambar start frame sendiri, jadi "visual_description" harus menggambarkan kondisi awal adegan dengan jelas lalu gerakannya.';
    }
    if (d.f_mode === 'ingredients') {
        return 'Video memakai foto produk dan foto model sebagai Ingredients (referensi), jadi sebut model dan produk secara eksplisit di setiap scene.';
    }
    return 'Video dibuat tanpa gambar (Text to Video), jadi "visual_description" harus menjelaskan penampilan model dan produk selengkap mungkin di setiap scene.';
}

function buildScriptPrompt(d) {
    const total = Number(d.s_scenes) || 3;
    const sceneSec = Number(d.f_duration) || 8;
    const wordLimit = maxWords(sceneSec);
    const withModel = d.m_mode === 'model';
    const promo = d.p_promo || 'tidak ada, jangan sebut harga atau diskon';
    const cta = d.s_cta === 'Tanpa CTA' ? 'tidak perlu CTA' : d.s_cta;
    const voice = voiceInstruction(d);

    const example = {
        project_title: '...',
        total_scenes: total,
        style: '...',
        scenes: [{
            scene_number: 1,
            start_time: '00:00',
            end_time: mmss(sceneSec),
            duration_seconds: sceneSec,
            visual_description: 'Ultra-realistic 4K video. ... Tidak ada teks di layar.',
            camera_style: '...',
            lighting: '...',
            emotion_or_tone: '...',
            key_focus: '...',
            interaction_cue: '...',
            visual_quality: '...',
            audio_instruction: voice,
            audio_transcript: '...',
        }],
    };

    return `Kamu adalah copywriter konten affiliate TikTok Shop & Shopee sekaligus penulis prompt video untuk Google Flow (Veo).
Saya lampirkan ${withModel ? 'foto produk dan foto model' : 'foto produk'}. Pelajari detailnya: ${withModel ? 'penampilan model, serta ' : ''}bentuk, warna, logo, dan tulisan pada produk.

Buat naskah video ${total} scene, masing-masing ${sceneSec} detik (total ${total * sceneSec} detik).
Video akan dibuat di Google Flow: mode ${MODE_LABEL[d.f_mode]}, model ${d.f_model}, ${RATIO_LABEL[d.s_ratio]}.

INFO PRODUK
${line('Nama', d.p_name)}${line('Kategori', d.p_category)}${line('Ukuran', d.p_size)}${line('Detail visual', d.p_details)}${line('Poin jualan', d.p_points)}- Harga/promo: ${promo}

INFO KONTEN
- Alur cerita: ${d.s_story}
${withModel
        ? `- Model: ${d.m_gender.toLowerCase()} seperti di foto, berbicara langsung ke kamera\n${line('Catatan model', d.m_desc)}`
        : `- Tanpa model: tampilkan produk (boleh dengan tangan), suara berupa voiceover ${d.m_gender.toLowerCase()}\n`}${line('Lokasi utama', d.s_setting)}- Tone: ${d.s_tone}
- CTA di scene terakhir: ${cta}
${line('Catatan', d.s_extra)}
ATURAN
- "visual_description" dalam bahasa Indonesia, diawali "Ultra-realistic 4K video." dan diakhiri "Tidak ada teks di layar."
- ${modeRule(d)}
- Deskripsikan penampilan ${withModel ? 'model (pakaian, rambut) dan ' : ''}produk (warna, bentuk) secara konsisten di setiap scene supaya tidak berubah di Flow.
- Sebut "${d.p_name}" di "visual_description" setiap kali produk muncul.
- "audio_transcript": bahasa Indonesia sehari-hari gaya kreator, maksimal ${wordLimit} kata per scene agar muat dalam ${sceneSec} detik.
- Scene 1 harus punya hook kuat, dan cerita antar-scene harus nyambung.
- Dilarang klaim berlebihan atau medis: "100%", "dijamin", "menyembuhkan", "permanen", "hasil instan", "paling murah".
- "audio_instruction" isi persis: "${voice}".

FORMAT JAWABAN
Balas HANYA dengan satu blok kode JSON valid tanpa penjelasan. Ikuti struktur contoh di bawah dan isi "scenes" dengan ${total} scene (scene_number 1 sampai ${total}, waktu bertambah ${sceneSec} detik per scene):
${JSON.stringify(example, null, 2)}`;
}

function buildImagePrompt(scene, ctx, total) {
    const n = scene.scene_number;
    const refs = [];
    if (ctx.m_mode === 'model') {
        refs.push(`- Model: wajah, rambut, warna kulit, dan proporsi tubuh harus sama persis dengan foto model yang saya lampirkan sebagai referensi${n > 1 ? ', dan konsisten dengan gambar scene sebelumnya' : ''}.`);
    }
    refs.push(`- Produk (${ctx.p_name}): jika muncul di adegan ini, harus identik dengan foto produk (bentuk, warna, logo, tulisan label). Jika adegan ini tidak menampilkan produk, jangan tampilkan.`);
    const purpose = ctx.f_mode === 'ingredients'
        ? 'Gambar ini akan dipakai sebagai referensi (Ingredients) video di Google Flow.'
        : 'Gambar ini akan dipakai sebagai start frame (Frames) video di Google Flow.';

    return `Buat gambar untuk Scene ${n} dari ${total}. ${purpose}

Referensi:
${refs.join('\n')}

Adegan:
${scene.visual_description || ''}
${line('Pose/aksi', scene.interaction_cue)}${line('Kamera', scene.camera_style)}${line('Pencahayaan', scene.lighting)}${line('Ekspresi/mood', scene.emotion_or_tone)}
Aturan: foto realistis, rasio ${ctx.s_ratio}, tanpa teks, watermark, atau logo tambahan. Kirim gambarnya saja.`;
}

function buildRegenPrompt(scene, ctx, fixes, notes) {
    const items = [...fixes, notes].filter(Boolean).map(x => `- ${x}`);
    if (!items.length) items.push('- Buat variasi lain dengan pose atau ekspresi sedikit berbeda, dan kualitas lebih tajam.');
    const keep = [
        ctx.m_mode === 'model' ? 'wajah model sama persis dengan foto model' : null,
        'produk identik dengan foto produk',
        `rasio ${ctx.s_ratio}`,
        'tanpa teks atau watermark',
    ].filter(Boolean).join(', ');

    return `Buat ulang gambar Scene ${scene.scene_number} dengan adegan yang sama:
${scene.visual_description || ''}

Yang perlu diperbaiki:
${items.join('\n')}

Tetap pertahankan: ${keep}. Kirim gambarnya saja.`;
}

/* ---------- Pengolah JSON ---------- */

// Sel yang disalin dari Google Sheets/Excel berbentuk "...""key""..." <TAB> nama file
function unCsv(text) {
    if (!/^"\s*[[{]/.test(text) || !text.includes('""')) return text;
    return [...text.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replace(/""/g, '"')).join('\n');
}

function extractJson(text) {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const src = fence ? fence[1] : text;
    const starts = [src.indexOf('{'), src.indexOf('[')].filter(i => i !== -1);
    const start = starts.length ? Math.min(...starts) : -1;
    const end = Math.max(src.lastIndexOf('}'), src.lastIndexOf(']'));
    return start === -1 || end <= start ? null : src.slice(start, end + 1);
}

function repairJson(raw) {
    return raw
        .replace(/[“”„]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,\s*([}\]])/g, '$1');
}

// Tutup kurung yang belum tertutup (mis. JSON terpotong atau disalin per baris)
function closeBrackets(raw) {
    const stack = [];
    let inString = false;
    let escaped = false;
    for (const ch of raw) {
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
        } else if (ch === '"') {
            inString = true;
        } else if (ch === '{') {
            stack.push('}');
        } else if (ch === '[') {
            stack.push(']');
        } else if (ch === '}' || ch === ']') {
            stack.pop();
        }
    }
    let out = raw.replace(/,\s*$/, '');
    while (stack.length) out += stack.pop();
    return out;
}

function describeJsonError(err, raw) {
    const msg = err.message;
    let where = '';
    const lc = msg.match(/line (\d+) column (\d+)/);
    const pos = msg.match(/position (\d+)/);
    if (lc) {
        where = ` di baris ${lc[1]}, kolom ${lc[2]} blok JSON`;
    } else if (pos) {
        const before = raw.slice(0, Number(pos[1])).split('\n');
        where = ` di baris ${before.length}, kolom ${before[before.length - 1].length + 1} blok JSON`;
    }
    return `JSON tidak valid${where}. Coba minta ChatGPT: "Kirim ulang hanya JSON yang valid." (${msg})`;
}

function parseReply(text) {
    const unquoted = unCsv(text);
    const raw = extractJson(unquoted);
    if (!raw) {
        return { error: 'JSON tidak ditemukan. Pastikan kamu menyalin seluruh balasan ChatGPT, termasuk tanda { dan }.' };
    }
    const fixed = closeBrackets(repairJson(raw));
    const candidates = [raw, repairJson(raw), fixed, `[${fixed}]`];
    let firstErr;
    for (let i = 0; i < candidates.length; i++) {
        try {
            return { data: JSON.parse(candidates[i]), repaired: i > 0 || unquoted !== text };
        } catch (err) {
            if (!firstErr) firstErr = err;
        }
    }
    return { error: describeJsonError(firstErr, raw) };
}

// Terima naskah lengkap { scenes: [...] }, array scene, atau satu scene saja
function normalize(data, sceneSec = 8) {
    let project;
    if (Array.isArray(data)) project = { scenes: data };
    else if (data && Array.isArray(data.scenes)) project = data;
    else if (data && typeof data === 'object' && data.visual_description) project = { scenes: [data] };
    else return null;

    const raw = project.scenes.filter(s => s && typeof s === 'object');
    if (!raw.length) return null;

    let start = 0;
    let retimed = false;
    const scenes = raw.map((s, i) => {
        const dur = Number(s.duration_seconds) > 0 ? Number(s.duration_seconds) : sceneSec;
        const timing = { scene_number: i + 1, start_time: mmss(start), end_time: mmss(start + dur), duration_seconds: dur };
        if (Object.keys(timing).some(k => s[k] !== timing[k])) retimed = true;
        start += dur;
        return Object.assign({}, timing, s, timing);
    });

    const result = Object.assign({ project_title: '', total_scenes: 0, style: '' }, project, { total_scenes: scenes.length, scenes });
    return { project: result, retimed };
}

function validate(project) {
    const warnings = [];
    project.scenes.forEach(s => {
        const tag = `Scene ${s.scene_number}`;
        if (!s.visual_description) warnings.push(`${tag}: "visual_description" kosong.`);
        const transcript = s.audio_transcript ? String(s.audio_transcript) : '';
        if (!transcript) {
            warnings.push(`${tag}: "audio_transcript" kosong.`);
            return;
        }
        const words = transcript.trim().split(/\s+/).length;
        const wordLimit = maxWords(s.duration_seconds);
        if (words > wordLimit + 2) {
            warnings.push(`${tag}: dialog ${words} kata, kemungkinan terlalu panjang untuk ${s.duration_seconds} detik (idealnya ≤ ${wordLimit} kata).`);
        }
        const claim = transcript.match(RISKY_CLAIMS);
        if (claim) warnings.push(`${tag}: ada klaim berisiko "${claim[0]}" yang bisa melanggar aturan TikTok Shop/Shopee.`);
    });
    return warnings;
}

/* ---------- Ekspor ---------- */

function fileBase(n) {
    const k = state.ctx && state.ctx.k_number;
    const base = k ? `Konten ${k}` : (state.project.project_title || 'Konten');
    return `${base} - Scene ${n}`.replace(/[\\/:*?"<>|]+/g, '').trim();
}

function imageExt(file) {
    const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
    return map[file.type] || 'png';
}

function downloadImage(n) {
    const data = state.images[n];
    if (!data || !data.file) return false;
    const a = document.createElement('a');
    a.href = data.url;
    a.download = `${fileBase(n)}.${imageExt(data.file)}`;
    a.click();
    return true;
}

function sceneJson(scene) {
    return JSON.stringify(scene, null, 2);
}

// Satu baris per scene: sel JSON + nama file gambar. Jika semua sel digabung, hasilnya JSON utuh.
function sheetRows() {
    const { scenes, ...meta } = state.project;
    const head = JSON.stringify(meta, null, 2).replace(/\n}$/, ',\n  "scenes": [\n');
    return scenes.map((scene, i) => {
        const body = sceneJson(scene).replace(/^/gm, '    ');
        const isLast = i === scenes.length - 1;
        const text = (i === 0 ? head : '') + body + (isLast ? '\n  ]\n}' : ',');
        const data = state.images[scene.scene_number];
        const ext = data && data.file ? imageExt(data.file) : 'png';
        return `"${text.replace(/"/g, '""')}"\t${fileBase(scene.scene_number)}.${ext}`;
    }).join('\n');
}

/* ---------- Hasil per scene ---------- */

function setSaved(id) {
    state.savedId = id;
    $('#btnSave').textContent = id ? 'Tersimpan' : 'Simpan ke riwayat';
    $('#btnSave').disabled = Boolean(id);
}

function clearImages() {
    Object.values(state.images).forEach(img => { if (img.url) URL.revokeObjectURL(img.url); });
    state.images = {};
}

function renderResult(savedId = null) {
    const { project } = state;
    const seconds = project.scenes.reduce((sum, s) => sum + s.duration_seconds, 0);
    $('#projectTitle').textContent = project.project_title;
    $('#projectMeta').textContent = [`${project.total_scenes} scene`, `${seconds} detik`, project.style].filter(Boolean).join(' · ');

    renderGuide();
    $('[data-act="download-all"]').hidden = state.ctx.f_mode === 'text';

    const list = $('#sceneList');
    list.innerHTML = '';
    project.scenes.forEach(scene => list.appendChild(sceneCard(scene)));

    setSaved(savedId);
    $('#resultCard').hidden = false;
}

function renderGuide() {
    const ctx = state.ctx;
    const refs = ctx.m_mode === 'model' ? 'foto produk dan foto model' : 'foto produk';
    const steps = [];
    if (ctx.f_mode !== 'text') {
        steps.push(ctx.f_image_tool === 'flow'
            ? `Di Flow buka tab <b>Images</b>, pilih model <b>${ctx.f_image_model}</b>, tambahkan ${refs} sebagai referensi, lalu tempel <b>Prompt gambar</b>.`
            : `Kirim <b>Prompt gambar</b> ke ${IMAGE_TOOL_LABEL[ctx.f_image_tool]} sambil melampirkan ${refs}.`);
        steps.push('Masukkan hasilnya ke kotak scene: seret, klik kotaknya lalu Ctrl+V, atau Pilih file. Kalau kurang pas, buka <b>Regenerate gambar</b>.');
    }
    const media = {
        frames: 'klik <b>+ Add start frame</b> dan pilih gambar scene',
        ingredients: `tambahkan ${refs} sebagai <b>Ingredients</b> (klik Add atau ketik @)`,
        text: 'tanpa gambar',
    }[ctx.f_mode];
    steps.push(`Di Flow pilih <b>Video → ${MODE_LABEL[ctx.f_mode]}</b>, samakan pengaturan seperti di kartu scene, ${media}, lalu tempel <b>JSON scene</b> dan klik Generate.`);
    $('#resultGuide').innerHTML = steps.map(s => `<li>${s}</li>`).join('');
}

function flowSetupRows(scene) {
    const ctx = state.ctx;
    const rows = [
        ['Menu', `Video → ${MODE_LABEL[ctx.f_mode]}`],
        ['Model', ctx.f_model],
        ['Aspect ratio', RATIO_LABEL[ctx.s_ratio]],
        ['Generation length', `${scene.duration_seconds} detik`],
        ['Number of outputs', ctx.f_outputs],
    ];
    if (ctx.f_mode === 'frames') {
        const data = state.images[scene.scene_number];
        rows.push(['Start frame', `${fileBase(scene.scene_number)}.${data && data.file ? imageExt(data.file) : 'png'}`]);
    }
    if (ctx.f_mode === 'ingredients') {
        const items = [ctx.m_mode === 'model' ? 'foto produk, foto model' : 'foto produk', 'gambar scene (opsional)'];
        if (ctx.f_voice) items.push(`@Voice: ${ctx.f_voice}`);
        rows.push(['Ingredients', items.join(', ')]);
    }
    return rows;
}

function sceneCard(scene) {
    const n = scene.scene_number;
    const total = state.project.total_scenes;
    const el = document.createElement('article');
    el.className = 'scene';
    el.innerHTML = `
        <div class="scene-head">
            <b>Scene ${n}</b>
            <span class="muted">${scene.start_time}–${scene.end_time}</span>
        </div>
        <p class="scene-focus"></p>
        <div class="scene-body">
            <div class="scene-media">
                <div class="drop" tabindex="0" aria-label="Gambar scene ${n}"></div>
                <input type="file" accept="image/*" hidden>
                <p class="note" data-role="thumb-note" hidden>Thumbnail dari riwayat. Unggah lagi gambar aslinya untuk download.</p>
                <div class="row">
                    <button class="btn small" data-act="pick">Pilih file</button>
                    <button class="btn small" data-act="download">Download</button>
                </div>
            </div>
            <div class="scene-side">
                <dl class="flow-setup"></dl>
                <button class="btn small primary" data-act="copy-image">Copy prompt gambar</button>
                <details class="regen">
                    <summary>Regenerate gambar</summary>
                    <div class="chips small"></div>
                    <textarea rows="2" placeholder="Catatan perbaikan lain (opsional)"></textarea>
                    <button class="btn small" data-act="copy-regen">Copy prompt regenerate</button>
                </details>
                <div class="prompt-box">
                    <div class="prompt-head">
                        <h3>JSON Scene ${n}</h3>
                        <button class="btn small" data-act="copy-json">Copy JSON</button>
                    </div>
                    <pre></pre>
                </div>
            </div>
        </div>`;

    $('.scene-focus', el).textContent = scene.key_focus || '';
    $('pre', el).textContent = sceneJson(scene);
    $('.drop', el).style.aspectRatio = state.ctx.s_ratio === '16:9' ? '16 / 9' : '9 / 16';
    renderFlowSetup(el, scene);

    // Text to Video tidak memakai gambar
    if (state.ctx.f_mode === 'text') {
        el.classList.add('no-media');
        ['.scene-media', '[data-act="copy-image"]', '.regen'].forEach(sel => { $(sel, el).hidden = true; });
    }

    const chips = $('.chips', el);
    QUICK_FIXES.forEach(fix => {
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.textContent = fix;
        chip.addEventListener('click', () => chip.classList.toggle('active'));
        chips.appendChild(chip);
    });

    const input = $('input[type="file"]', el);
    const drop = $('.drop', el);
    input.addEventListener('change', () => {
        setImage(n, input.files[0], el);
        input.value = '';
    });
    drop.addEventListener('dragover', e => {
        e.preventDefault();
        drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('over');
        setImage(n, e.dataTransfer.files[0], el);
    });
    drop.addEventListener('paste', e => {
        const file = [...e.clipboardData.files].find(f => f.type.startsWith('image/'));
        if (file) {
            e.preventDefault();
            setImage(n, file, el);
        } else {
            toast('Clipboard tidak berisi gambar. Di ChatGPT, klik kanan gambar → Copy image.');
        }
    });

    el.addEventListener('click', e => {
        const act = e.target.dataset.act;
        if (act === 'pick') input.click();
        if (act === 'download' && !downloadImage(n)) toast('Belum ada gambar asli untuk scene ini');
        if (act === 'copy-image') copyText(buildImagePrompt(scene, state.ctx, total), `Prompt gambar Scene ${n} tersalin`);
        if (act === 'copy-json') copyText(sceneJson(scene), `JSON Scene ${n} tersalin`);
        if (act === 'copy-regen') {
            const fixes = $$('.chip.active', chips).map(c => c.textContent);
            copyText(buildRegenPrompt(scene, state.ctx, fixes, $('textarea', el).value.trim()), 'Prompt regenerate tersalin');
        }
    });

    renderImage(el, n);
    return el;
}

async function setImage(n, file, el) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        toast('File bukan gambar');
        return;
    }
    try {
        const img = await loadImage(file);
        const prev = state.images[n];
        if (prev && prev.url) URL.revokeObjectURL(prev.url);
        state.images[n] = { file, url: img.src, thumb: makeThumb(img) };
        renderImage(el, n);
        renderFlowSetup(el, state.project.scenes.find(s => s.scene_number === n));
        setSaved(null);
        toast(`Gambar Scene ${n} dipasang`);
    } catch {
        toast('Gambar tidak bisa dibuka. Coba simpan sebagai PNG/JPG dulu.');
    }
}

function renderFlowSetup(el, scene) {
    const dl = $('.flow-setup', el);
    dl.innerHTML = '';
    flowSetupRows(scene).forEach(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        dl.append(dt, dd);
    });
}

function renderImage(el, n) {
    const drop = $('.drop', el);
    const data = state.images[n];
    const src = data && (data.url || data.thumb);
    drop.innerHTML = '';
    drop.classList.toggle('has-image', Boolean(src));
    if (src) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = `Gambar scene ${n}`;
        drop.appendChild(img);
    } else {
        drop.innerHTML = '<span>Seret gambar ke sini, atau klik kotak ini lalu tekan Ctrl+V</span>';
    }
    $('[data-role="thumb-note"]', el).hidden = !(data && !data.file && data.thumb);
    $('[data-act="download"]', el).disabled = !(data && data.file);
}

function downloadAll() {
    const ready = state.project.scenes.map(s => s.scene_number).filter(n => state.images[n] && state.images[n].file);
    if (!ready.length) {
        toast('Belum ada gambar yang dipasang');
        return;
    }
    ready.forEach((n, i) => setTimeout(() => downloadImage(n), i * 400));
}

/* ---------- Riwayat ---------- */

function getHistory() {
    const list = store.get(KEY_HISTORY, []);
    return Array.isArray(list) ? list : [];
}

function saveToHistory() {
    if (!state.project || state.savedId) return;
    const thumbs = {};
    Object.entries(state.images).forEach(([n, img]) => { if (img.thumb) thumbs[n] = img.thumb; });
    const item = {
        id: Date.now().toString(36),
        at: new Date().toISOString(),
        title: state.project.project_title,
        ctx: state.ctx,
        project: state.project,
        thumbs,
    };
    const list = [item, ...getHistory()].slice(0, HISTORY_MAX);
    // Kalau penyimpanan penuh, simpan tanpa thumbnail
    if (!store.set(KEY_HISTORY, list)) {
        item.thumbs = {};
        if (!store.set(KEY_HISTORY, list)) {
            toast('Gagal menyimpan: penyimpanan browser penuh atau diblokir');
            return;
        }
    }
    setSaved(item.id);
    renderHistory();

    // Siapkan nomor konten berikutnya
    const k = Number(state.ctx.k_number);
    if (k && $('#k_number').value.trim() === state.ctx.k_number) {
        $('#k_number').value = String(k + 1);
        saveDraft();
        toast(`Disimpan. Nomor konten berikutnya: ${k + 1}`);
    } else {
        toast('Disimpan ke riwayat');
    }
}

function renderHistory() {
    const list = getHistory();
    $('#historyCount').textContent = list.length;
    const ul = $('#historyList');
    ul.innerHTML = '';
    if (!list.length) {
        ul.innerHTML = '<li class="empty">Belum ada riwayat. Konten yang kamu simpan akan muncul di sini.</li>';
        return;
    }
    list.forEach(item => {
        const li = document.createElement('li');

        const firstThumb = Object.values(item.thumbs || {})[0];
        const thumb = document.createElement(firstThumb ? 'img' : 'div');
        thumb.className = 'thumb';
        if (firstThumb) {
            thumb.src = firstThumb;
            thumb.alt = '';
        }

        const meta = document.createElement('div');
        meta.className = 'meta';
        const title = document.createElement('b');
        title.textContent = (item.ctx && item.ctx.k_number ? `Konten ${item.ctx.k_number} · ` : '') + item.title;
        const sub = document.createElement('small');
        const when = new Date(item.at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
        sub.textContent = `${item.project.total_scenes} scene · ${when}`;
        meta.append(title, sub);

        const actions = document.createElement('div');
        actions.className = 'row-actions';
        actions.append(
            button('Buka', () => {
                clearImages();
                state.project = item.project;
                state.ctx = Object.assign({}, FLOW_DEFAULTS, item.ctx);
                Object.entries(item.thumbs || {}).forEach(([n, t]) => { state.images[n] = { thumb: t }; });
                switchView('create');
                renderResult(item.id);
                $('#resultCard').scrollIntoView({ behavior: 'smooth' });
            }),
            button('Copy JSON', () => copyText(JSON.stringify(item.project, null, 2))),
            button('Hapus', () => {
                if (!confirm(`Hapus "${item.title}" dari riwayat?`)) return;
                store.set(KEY_HISTORY, getHistory().filter(x => x.id !== item.id));
                if (state.savedId === item.id) setSaved(null);
                renderHistory();
            }, 'danger'),
        );

        li.append(thumb, meta, actions);
        ul.appendChild(li);
    });
}

function switchView(view) {
    $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === view)));
    $('#view-create').hidden = view !== 'create';
    $('#view-history').hidden = view !== 'history';
    window.scrollTo(0, 0);
}

/* ---------- Event ---------- */

function init() {
    fill(store.get(KEY_DRAFT, {}));
    renderHistory();

    setupPreview('p_photo', 'p_preview');
    setupPreview('m_photo', 'm_preview');

    $$('.tab').forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));

    $('#view-create').addEventListener('input', e => {
        if (!FIELDS.includes(e.target.id)) return;
        saveDraft();
        if (e.target.id.startsWith('f_')) updateFlowNotice();
    });
    $$('input[name="m_mode"]').forEach(r => r.addEventListener('change', () => {
        updateMode();
        saveDraft();
    }));

    $$('#templates .chip').forEach(chip => chip.addEventListener('click', () => {
        fill(TEMPLATES[chip.dataset.template]);
        $$('#templates .chip').forEach(c => c.classList.toggle('active', c === chip));
        saveDraft();
        toast(`Template ${chip.textContent} dipakai`);
    }));

    $('#btnGenerate').addEventListener('click', () => {
        const d = collect();
        const errors = [];
        if (!d.p_name) errors.push('Nama produk wajib diisi.');
        const blocked = [d.p_name, d.p_category, d.p_details, d.p_points].join(' ').match(BLOCKED_PRODUCTS);
        if (blocked) {
            errors.push(`Produk mengandung kata "${blocked[0]}", yang termasuk kategori terlarang/terbatas di program affiliate. Prompt tidak dibuat.`);
        }
        if (!$('#consent').checked) errors.push('Centang persetujuan izin foto terlebih dahulu.');
        errors.push(...flowIssues(d));
        showAlert('formErrors', errors);
        if (errors.length) return;

        $('#promptScript').textContent = buildScriptPrompt(d);
        $('#guideUpload').innerHTML = d.m_mode === 'product'
            ? 'Unggah <b>foto produk</b>, lalu tempel prompt di bawah dan kirim.'
            : 'Unggah <b>foto produk</b> dan <b>foto model</b>, lalu tempel prompt di bawah dan kirim.';
        $('#promptsCard').hidden = false;
        $('#promptsCard').scrollIntoView({ behavior: 'smooth' });
    });

    $('#btnReset').addEventListener('click', () => {
        if (!confirm('Kosongkan semua isian dan hasil?')) return;
        FIELDS.forEach(id => {
            const el = $('#' + id);
            el.value = el.tagName === 'SELECT'
                ? ([...el.options].find(o => o.defaultSelected) || el.options[0]).value
                : '';
        });
        $('input[name="m_mode"][value="model"]').checked = true;
        ['p_photo', 'm_photo'].forEach(id => { $('#' + id).value = ''; });
        $('#p_preview').innerHTML = '';
        $('#m_preview').innerHTML = '';
        $('#consent').checked = false;
        $('#pasteArea').value = '';
        $$('#templates .chip').forEach(c => c.classList.remove('active'));
        ['formErrors', 'parseError', 'parseInfo', 'parseWarn'].forEach(id => showAlert(id, []));
        ['promptsCard', 'resultCard'].forEach(id => { $('#' + id).hidden = true; });
        clearImages();
        state.project = null;
        state.ctx = null;
        state.savedId = null;
        updateMode();
        saveDraft();
        window.scrollTo(0, 0);
    });

    $('#btnProcess').addEventListener('click', () => {
        ['parseError', 'parseInfo', 'parseWarn'].forEach(id => showAlert(id, []));

        const text = $('#pasteArea').value.trim();
        if (!text) {
            showAlert('parseError', 'Tempel balasan ChatGPT terlebih dahulu.');
            return;
        }
        const parsed = parseReply(text);
        if (parsed.error) {
            showAlert('parseError', parsed.error);
            return;
        }
        const d = collect();
        const result = normalize(parsed.data, Number(d.f_duration) || 8);
        if (!result) {
            showAlert('parseError', 'Format JSON tidak dikenali. Pastikan memakai prompt naskah agar ChatGPT membalas dengan "scenes".');
            return;
        }

        const { project } = result;
        if (!project.project_title) project.project_title = d.p_name || 'Konten affiliate';
        clearImages();
        state.project = project;
        state.ctx = { p_name: d.p_name || project.project_title, m_mode: d.m_mode, k_number: d.k_number };
        Object.keys(FLOW_DEFAULTS).forEach(k => { state.ctx[k] = d[k]; });

        const offLength = project.scenes.filter(s => s.duration_seconds !== Number(d.f_duration)).map(s => s.scene_number);
        $('#pasteArea').value = JSON.stringify(project, null, 2);
        showAlert('parseInfo', [
            parsed.repaired ? 'JSON diperbaiki otomatis (format spreadsheet, tanda kutip miring, koma berlebih, atau kurung yang belum ditutup).' : '',
            result.retimed ? 'Nomor scene dan waktu (start/end/durasi) dirapikan otomatis.' : '',
        ]);
        showAlert('parseWarn', [
            ...validate(project),
            offLength.length ? `Durasi scene ${offLength.join(', ')} berbeda dengan Generation length di Pengaturan Flow (${d.f_duration} detik). Kartu scene memakai durasi dari JSON.` : '',
            ...flowIssues(d),
        ]);
        renderResult();
        $('#resultCard').scrollIntoView({ behavior: 'smooth' });
    });

    $('#resultCard').addEventListener('click', e => {
        const act = e.target.dataset.act;
        if (act === 'copy-all') copyText(JSON.stringify(state.project, null, 2), 'Semua JSON tersalin');
        if (act === 'copy-sheet') copyText(sheetRows(), 'Tersalin. Tempel di sel A1 spreadsheet');
        if (act === 'download-all') downloadAll();
    });

    document.addEventListener('click', e => {
        const target = e.target.closest('[data-copy]');
        if (target) copyText($(target.dataset.copy).textContent);
    });

    $('#btnSave').addEventListener('click', saveToHistory);
}

init();
