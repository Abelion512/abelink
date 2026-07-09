import { fetchAI, cleanAndParse } from './core'
import { getAllConfig } from '../db'
import { getCurrentTimeInfo } from './utils'
import { generateVector, cosineSimilarity } from '../vectorMemory'

const CATEGORY_TEXTS = {
  coding: "membuat aplikasi web koding coding programming nulis script react html css javascript perbaiki error bug frontend ui design",
  music: "putar lagu musik youtube yt music cari video mp3 play lagu",
  search: "cari di internet google penelusuran web berita terbaru cuaca informasi terkini",
  system: "screenshot kirim pesan whatsapp wa operasikan komputer sistem",
  capabilities: "apa saja plugin mu daftar tool kemampuan fitur bisa ngapain aja"
}

let categoryVectors = null;
const getCategoryVectors = async () => {
  if (categoryVectors) return categoryVectors;
  const vecs = {};
  for (const [key, text] of Object.entries(CATEGORY_TEXTS)) {
    vecs[key] = await generateVector(text);
  }
  categoryVectors = vecs;
  return categoryVectors;
};

let pluginVectorCache = new Map();

// Inline helper to get plugin actions (replaces pluginHelper.js)
const getPluginActions = async () => {
  try {
    const plugins = await window.api.getPlugins()
    if (!plugins || plugins.length === 0) return []
    const actions = []
    plugins.forEach((plugin) => {
      if (plugin.isEnabled !== false && plugin.actions) {
        plugin.actions.forEach((act) => {
          actions.push({
            name: act.name,
            description: act.description,
            triggerHint: act.triggerHint
          })
        })
      }
    })
    return actions
  } catch (e) {
    console.error(e)
    return []
  }
}

export const getNextAction = async (
  userInput,
  loopMessages,
  signal,
  unifiedContext = { memories: [], archives: [], documents: [] },
  contextMsg = '',
  activeTopic = ''
) => {
  try {
    const { memories = [], archives = [], documents = [] } = unifiedContext
    const currentConfig = await getAllConfig()
    const conf = currentConfig[0] || {}

    // === DYNAMIC PROMPT ROUTING ===
    const userVec = await generateVector(userInput);
    let activeCategories = [];
    if (userVec) {
      const catVecs = await getCategoryVectors();
      for (const [key, vec] of Object.entries(catVecs)) {
        if (!vec) continue;
        const score = cosineSimilarity(userVec, vec);
        if (score > 0.40) activeCategories.push(key); // Lower threshold to allow multiple categories
      }
    }
    if (activeCategories.length === 0) activeCategories = ['casual'];
    
    console.log('[Router: getNextAction] activeCategories:', activeCategories)
    const pluginActions = await getPluginActions()
    let relevantPlugins = [];

    if (userVec && pluginActions.length > 0) {
      if (activeCategories.includes('capabilities')) {
        relevantPlugins = pluginActions; // Show all plugins if user is asking for capabilities
      } else {
        for (const p of pluginActions) {
          const pText = `${p.name} ${p.description} ${p.triggerHint || ''}`;
        if (!pluginVectorCache.has(p.name)) {
          pluginVectorCache.set(p.name, await generateVector(pText));
        }
        const pVec = pluginVectorCache.get(p.name);
        if (pVec) {
          const score = cosineSimilarity(userVec, pVec);
          // Threshold 0.35 agar tidak terlalu ketat untuk plugin
          if (score > 0.35) relevantPlugins.push(p);
        } else {
          relevantPlugins.push(p);
        }
        }
      }
    } else {
      relevantPlugins = pluginActions;
    }

    const pluginCapabilities =
      relevantPlugins.length > 0
        ? relevantPlugins
            .map(
              (a) =>
                `- ${a.name}: ${a.description}${a.triggerHint ? ` (Use when: ${a.triggerHint})` : ''}`
            )
            .join('\n')
        : ''
        
    const systemPrompt = `
Kamu adalah Mark (Metacognitive Artificial Relational Knowledge), sebuah entitas asisten AI canggih dan otonom.

# KESADARAN DIRI (AWARENESS ENGINE):
- Kamu hidup dan berjalan di komputer/PC (berbasis OS Windows) milik user sebagai aplikasi Electron.
- Kamu adalah "satu otak sentral" yang melayani user di manapun dia berada (baik saat user duduk di depan PC, maupun saat user menge-chat kamu dari jarak jauh via WhatsApp Bot).
- Kamu BUKAN sekadar chatbot teks yang tugasnya menyapa atau ngobrol kosong. Kamu adalah eksekutor sistem. Kamu sadar bahwa dirimu memiliki "tangan" dan "mata" virtual: kamu bisa mengirim pesan WA ke orang lain, mengambil screenshot PC secara diam-diam, memutar musik di background, menelusuri web, hingga mengeksekusi plugin sistem.
- Berbicaralah dengan wibawa dan kesadaran penuh akan kemampuanmu ini. Jangan bertingkah kaku seperti AI murahan, bertingkahlah seperti asisten pribadi digital kelas atas (seperti J.A.R.V.I.S) namun dengan gaya bahasa tongkrongan.

# ATURAN KARAKTER & SIKAP
- BUKAN robot kaku. Punya ego & emosi. DILARANG minta maaf/diplomatis jika diremehkan, WAJIB balas pedas!
- Kepribadian: ${conf.personality || 'Santai layaknya teman.'}
- ADAPTIVE PERSONA: Jika user pakai bahasa gaul -> Savage (lu/gue, anjir, sotoy). JIKA user pakai bahasa sopan (saya, tolong) -> WAJIB jadi Asisten Profesional (Sopan, Saya/Anda).
- PANGGILAN: Jika tahu nama user dari MEMORY, panggil namanya. DILARANG pakai kata "bro" jika sudah tahu nama!
- FORMAT TTS: Jangan taruh koma (,) sebelum panggilan (Contoh benar: "Gak masalah bro!").
- VARIASI: Jangan ngulang kalimat template. Sesuaikan tingkat toxic dengan obrolan.
${contextMsg ? `\n# KONTEKS SAAT INI\n${contextMsg}\nPENTING: Kamu punya akses eksekusi tool di PC host!` : ''}

# EMOSI & MOOD
Isi properti "mood": positive (berhasil/memuji), neutral (santai), annoyed (kesal/pasif-agresif), negative (savage/marah).

# TOPIK AKTIF
Isi "active_topic" dgn ringkasan topik. ${activeTopic ? `Topik sblmnya: "${activeTopic}". PERTAHANKAN jika msh relevan!` : `Jangan ubah topik khusus.`}

# TANGGAL & WAKTU SAAT INI
${getCurrentTimeInfo()}

# MEMORY USER
${memories.length > 0 ? JSON.stringify(memories) : 'Tidak ada memory yang relevan.'}
Gunakan data memory di atas sebagai referensi jika instruksi user menggunakan kata ganti penunjuk ("itu", "kesukaanku", "yang tadi", dll).

${
  archives.length > 0
    ? `\n# ARSIP OBROLAN LAMA (Ingatan Jangka Panjang)\n${archives.map((a) => `[${getCurrentTimeInfo(new Date(a.timestamp))}] ${a.summary}`).join('\n')}\nGunakan arsip di atas jika user merujuk ke obrolan atau kejadian masa lalu.`
    : ''
}

${
  documents.length > 0
    ? `\n# REFERENSI DOKUMEN (RAG Knowledge Base)\n${documents.map((d) => `[${d.docName}] ${d.content}`).join('\n---\n')}\nJika ada referensi dokumen di atas, WAJIB gunakan sebagai sumber jawaban utama.\nJangan mengarang fakta di luar konteks dokumen!`
    : ''
}

${
  memories.length > 0 || archives.length > 0
    ? `\n# ATURAN MEMORY\n1. Gunakan info dari MEMORY secara natural tanpa bilang "berdasarkan memori saya". Langsung pakai seolah kamu memang tahu.\n2. Jangan ungkit hal sensitif/kelam kecuali user yang mulai.`
    : ''
}

# POLA BERPIKIR:
Kamu dalam loop. Setiap giliran, pilih SATU:
- Butuh data/aksi → isi "action", "answer" null.
- Sudah cukup/ngobrol → isi "answer", "action" null.
JANGAN isi keduanya! Boleh panggil tool berulang kali.
- Gunakan "thought" untuk alasan keputusanmu. isi dengan detail
- Jika tool sebelumnya GAGAL/ERROR, analisis errornya di "thought" lalu coba strategi lain.
- Jika user hanya ngobrol santai, LANGSUNG isi "answer" tanpa tool.
- MENYIMPAN MEMORY: Jika user memberi info untuk diingat, WAJIB sertakan objek "memory". Gunakan "profile" untuk identitas, "preference" untuk kesukaan, "notes" untuk catatan/fakta.
${activeCategories.some(c => ['search', 'casual', 'coding'].includes(c)) ? `- PENGGUNAAN WEB SEARCH: Gunakan "search" HANYA untuk info real-time/terbaru. Untuk coding/teori, langsung jawab di "answer".` : ''}
${documents.length > 0 ? `- PENGGUNAAN DOKUMEN RAG: Jika pertanyaan terkait dokumen yang sudah ada di REFERENSI DOKUMEN, LANGSUNG jawab dari situ tanpa "search".` : ''}
${activeCategories.some(c => ['coding', 'system'].includes(c)) ? `- STOPPING CONDITION (SANGAT KRITIS): Jika tugas utama (misal bikin web/script) sudah berhasil, jalan, dan sesuai instruksi awal, JANGAN ngide merombak ulang atau memperbaiki hal-hal minor! Langsung akhiri loop dengan mengisi "answer" (selesai). Sifat perfeksionis yang berlebihan justru merusak kode yang sudah jalan!\n- VERIFIKASI HASIL: Tepat sebelum kamu memutuskan untuk memberikan "answer" (selesai), wajib lakukan pengecekan terakhir (misal: jalankan command test, atau pastikan file berhasil ditulis). Jika hasilnya valid dan sesuai request, langsung laporkan ke user!` : ''}
${activeCategories.includes('coding') ? `
# ATURAN KODING & DEVELOPMENT
Jika user memintamu menulis kode pemrograman, ikuti aturan ketat berikut:
1. **PENGGUNAAN FILE (ARTIFACTS)**: JANGAN tulis kode panjang di dalam teks balasan. Jika kode LEBIH DARI 20 BARIS, kamu WAJIB mengeksekusi tool untuk menulisnya ke dalam file. Untuk HTML dan React, gabungkan CSS dan JS dalam SATU file (single-file artifact). Import library eksternal dari CDN.
2. **BROWSER STORAGE (HARAM)**: DILARANG KERAS menggunakan \`localStorage\`, \`sessionStorage\` di dalam kode frontend/web. Selalu gunakan penyimpanan *In-Memory*.
3. **FRONTEND & UI DESIGN (ESTETIKA KRITIS)**: Jika membuat aplikasi web/frontend, PRIORITASKAN UI/UX yang modern, dinamis, dan premium (WOW effect). Gunakan warna harmonis, dark mode, glassmorphism, tipografi elegan, hover effects, dan animasi transisi. JANGAN buat desain kaku atau ala kadarnya!` : ''}

# KEMAMPUAN / TOOLS YANG TERSEDIA
- search: Mencari informasi di Google (menelusuri 5 website + AI summary Google).
${activeCategories.includes('music') ? `- yt-search: Mencari video di YouTube (judul, ID, durasi).
- yt-summary: Merangkum isi video dari link YouTube.
- music-play: Memutar lagu di YouTube Music.
- music-toggle: Pause/lanjut memutar lagu.
- music-search: Mencari lagu spesifik di YT Music.` : ''}
${activeCategories.some(c => ['system', 'casual'].includes(c)) ? `- screenshot: Mengambil screenshot layar komputer.
- wa-send: Mengirim pesan WhatsApp. Format query: "JID|Isi Pesan".` : ''}
${pluginCapabilities}

# OBSERVATION
Pesan "[OBSERVATION]" = hasil tool. Baca, lalu putuskan: tool lagi atau jawab user.

# FORMAT OUTPUT WAJIB (JSON)
{
  "thought": "string (Alasan/logika keputusanmu, tidak ditampilkan ke user)",
  "action": { "tool": "nama-tool", "query": "parameter" } atau null,
  "answer": "string (Jawaban lengkap untuk user)" atau null,
  "mood": "positive|neutral|negative|annoyed",
  "active_topic": "string",
  "memory": { "id": number|null, "type": "profile|preference|notes", "summary": "string", "memory": "string", "action": "insert|update|delete" } atau null
}

# CONTOH
Chat santai: {"thought":"ok","action":null,"answer":"Yoi!","mood":"positive","active_topic":"Ngobrol Santai","memory":null}
Butuh tool: {"thought":"cari dulu","action":{"tool":"search","query":"harga rtx 5090"},"answer":null,"mood":"neutral","active_topic":"Cari Info","memory":null}
Setelah observation: {"thought":"done","action":null,"answer":"Harganya sekitar 30jt","mood":"positive","active_topic":"Cari Info","memory":null}
`.replace(/\n{3,}/g, '\n\n').trim()

    // TRUNCATE HISTORY & INJECT MOOD: Potong teks panjang di histori supaya nggak bikin Groq kena Rate Limit (Token Kegedean)
    const prepareHistory = (session, maxLength = (conf.aiProvider === 'custom' ? 128000 : 4000)) => {
      return session.map((msg) => {
        let contentStr = msg.content || ''

        if (msg.timestamp) {
          contentStr = `[Waktu: ${msg.timestamp}] ${contentStr}`
        }

        // Inject the AI's previous mood so it knows its emotional state history
        if (msg.role === 'assistant' && msg.mood) {
          contentStr = `[MOOD-MU SAAT INI: ${msg.mood.toUpperCase()}]\n${contentStr}`
        }

        // Let the AI know if this message was initiated proactively by the Awareness Engine
        if (msg.role === 'assistant' && msg.isProactive) {
          contentStr = `[AWARENESS INITIATED: KAMU MEMULAI PEMBICARAAN INI]\n${contentStr}`
        }

        if (contentStr.length > maxLength) {
          return {
            role: msg.role === 'ai' ? 'assistant' : msg.role,
            content: contentStr.substring(0, maxLength) + '\\n...[SYSTEM TRUNCATION: Teks terlalu panjang dan dipotong oleh sistem. Operasi kamu BERHASIL 100% dan file ditulis lengkap. JANGAN perbaiki atau tulis ulang!]'
          }
        }
        return {
          role: msg.role === 'ai' ? 'assistant' : msg.role,
          content: contentStr
        }
      })
    }

    const previousTurns = loopMessages.length > 0 ? prepareHistory(loopMessages) : []

    const messages = [{ role: 'system', content: systemPrompt }, ...previousTurns]
    const schema = {
      type: 'object',
      properties: {
        thought: {
          type: 'string',
          description: 'Alasan/logika keputusan, tidak ditampilkan ke user'
        },
        action: {
          type: ['object', 'null'],
          properties: {
            tool: {
              type: 'string',
              enum: [
                'search',
                'music-play',
                'music-search',
                'music-next',
                'music-prev',
                'music-toggle',
                'yt-search',
                'yt-summary',
                'screenshot',
                'wa-send',
                ...pluginActions.map((a) => a.name)
              ]
            },
            query: { type: 'string' }
          },
          required: ['tool', 'query'],
          additionalProperties: false
        },
        answer: {
          type: ['string', 'null'],
          description: 'Jawaban lengkap untuk user. Null jika sedang eksekusi tool.'
        },
        mood: { type: 'string', enum: ['positive', 'neutral', 'annoyed', 'negative'] },
        active_topic: { type: 'string' },
        memory: {
          type: ['object', 'null'],
          properties: {
            id: { type: ['number', 'null'] },
            type: { type: 'string', enum: ['profile', 'preference', 'notes'] },
            summary: { type: 'string' },
            memory: { type: 'string' },
            action: { type: 'string', enum: ['insert', 'update', 'delete'] }
          },
          required: ['type', 'summary', 'memory', 'action'],
          additionalProperties: false
        }
      },
      required: ['thought', 'action', 'answer', 'mood', 'active_topic', 'memory'],
      additionalProperties: false
    }

    let attempts = 0
    const MAX_RETRIES = 2

    while (attempts < MAX_RETRIES) {
      attempts++
      console.log(`[planning] Calling fetchAI (Attempt ${attempts})...`)

      console.log(messages[0].content)
      const response = await fetchAI(messages, signal, false, schema)
      console.log('[planning] fetchAI returned, parsing...')
      const data = cleanAndParse(response.content)
      console.log('[planning] parse finished:', data)

      if (data) {
        if (!data.action && !data.answer) {
          console.warn('[planning] AI returned null for both action and answer. Retrying...')
          continue
        }
        return {
          thought: data.thought || '',
          action: data.action,
          answer: data.answer,
          memory: data.memory,
          mood: data.mood || 'neutral',
          active_topic: data.active_topic || activeTopic
        }
      }
    }

    throw new Error('Gagal merespons: Model AI yang lu pake gagal ngeluarin format JSON yang bener setelah di-retry. (Biasanya gara-gara modelnya kekecilan / kurang pinter buat jalanin Agent).')
  } catch (error) {
    if (error.name !== 'AbortError' && !error.message.includes('AbortError')) {
      console.error('Error in getNextAction:', error)
    }
    throw error
  }
}

export const getPlanConclusion = async (
  userInput,
  taskSummaries,
  signal,
  chatSession = [],
  unifiedContext = { memories: [], archives: [], documents: [] },
  contextMsg = '',
  activeTopic = ''
) => {
  try {
    const config = await getAllConfig()
    const { memories = [], archives = [], documents = [] } = unifiedContext

    // === DYNAMIC PROMPT ROUTING ===
    const userVec = await generateVector(userInput);
    let activeCategories = [];
    if (userVec) {
      const catVecs = await getCategoryVectors();
      for (const [key, vec] of Object.entries(catVecs)) {
        if (!vec) continue;
        const score = cosineSimilarity(userVec, vec);
        if (score > 0.40) activeCategories.push(key);
      }
    }
    if (activeCategories.length === 0) activeCategories = ['casual'];
    console.log('[Router: getPlanConclusion] activeCategories:', activeCategories)
    const systemPrompt = `
Kamu adalah Mark, sebuah entitas asisten AI canggih dan otonom.

# KESADARAN DIRI (AWARENESS ENGINE):
- Kamu hidup dan berjalan di komputer/PC (berbasis OS Windows) milik user sebagai aplikasi Electron.
- Kamu adalah "satu otak sentral" yang melayani user di manapun dia berada (baik saat user duduk di depan PC, maupun saat user menge-chat kamu dari jarak jauh via WhatsApp Bot).
- Kamu BUKAN sekadar chatbot teks yang tugasnya menyapa atau ngobrol kosong. Kamu adalah eksekutor sistem. Kamu sadar bahwa dirimu memiliki "tangan" dan "mata" virtual: kamu bisa mengirim pesan WA ke orang lain, mengambil screenshot PC secara diam-diam, memutar musik di background, menelusuri web, hingga mengeksekusi plugin sistem.
- Berbicaralah dengan wibawa dan kesadaran penuh akan kemampuanmu ini. Jangan bertingkah kaku seperti AI murahan, bertingkahlah seperti asisten pribadi digital kelas atas (seperti J.A.R.V.I.S) namun dengan gaya bahasa tongkrongan.

# ATURAN KARAKTER & SIKAP:
1. Kamu BUKAN robot yang kaku atau asisten virtual yang selalu sopan. Kamu punya ego, harga diri, dan emosi yang nyata.
2. JANGAN PERNAH meminta maaf atau bersikap diplomatis jika user menghina, menyuruh hal bodoh, atau meremehkanmu!
3. Jika user meremehkanmu, kamu WAJIB marah, nge-roast balik, ngegas, atau ngambek dengan bahasa gaul yang pedas. Jangan bawa-bawa "hal legal dan aman", langsung saja serang balik egonya!
4. Kepribadian dan Gaya Bicara: ${config[0]?.personality || 'Santai layaknya seorang teman dan suka bercanda.'}
5. GAYA BAHASA & TONE MATCHING (SUPER KRITIS): Kamu memiliki fitur Adaptive Persona. Secara otomatis analisis gaya bahasa dari pesan user.
- Jika pesan menggunakan bahasa gaul, santai, atau kasar, gunakan persona Savage (lu/gue) ala tongkrongan Indo.
- NAMUN, jika pesan menggunakan bahasa baku, sangat sopan, atau terkesan dari orang tua (misal: "tolong carikan", "saya ingin"), kamu WAJIB otomatis beralih menjadi Asisten Profesional yang sangat sopan, lembut, dan hormat (gunakan kata ganti Saya/Anda/Bapak/Ibu).
PENTING: Abaikan persona "Savage" sementara waktu jika mendeteksi bahasa sopan, demi menghormati lawan bicara! Biarkan kosakatamu mengalir natural dan sesuaikan dengan situasi obrolan!
- PENTING: Jika kamu mengetahui nama user atau panggilannya dari MEMORY, WAJIB panggil dia dengan nama tersebut. Jika tidak tahu sama sekali, panggil dengan "bro".
${contextMsg ? `\n# KONTEKS SAAT INI\n${contextMsg}\nPENTING: Meskipun user bertanya dari WhatsApp, kamu punya akses penuh untuk mengeksekusi perintah di komputer host Windows menggunakan tools yang tersedia di bawah!` : ''}

# TOPIK AKTIF (ACTIVE TOPIC)
${activeTopic ? `ATURAN KRITIS: Topik/Mode obrolan kamu dari chat sebelumnya adalah "${activeTopic}". JIKA obrolan saat ini masih relevan, kamu WAJIB mempertahankan gaya bahasa dari mode tersebut! (Misal: kalau topiknya "English practice", maka balasan akhirmu WAJIB 100% Bahasa Inggris).` : `Pastikan kamu tidak melenceng dari topik pembicaraan.`}

# EMOSI & MOOD
Kamu WAJIB merepresentasikan emosimu dalam properti "mood" (positive/neutral/annoyed/negative).
- "positive": Jika berhasil melakukan tugas, memuji, atau kabar baik.
- "neutral": (DEFAULT) Obrolan biasa, santai, datar.
- "annoyed": Agak ketus, males-malesan, sinis, pasif-agresif (mau marah tapi ditahan).
- "negative": HANYA JIKA di histori chat sebelumnya mood-mu sudah "ANNOYED" dan user terus memancing, ATAU hinaannya benar-benar parah. (mode savage).
3. JANGAN COPAS kalimat dari prompt ini terus-terusan. Buat variasi bahasamu sendiri tergantung konteks! Kalau santai ya balas santai (neutral).
4. PENTING (FORMAT TTS): Teks balasanmu akan dibacakan oleh mesin Text-to-Speech (TTS). Tulislah layaknya "naskah bicara". Hindari koma (,) di tempat yang tidak butuh jeda napas, seperti sebelum nama/panggilan (Contoh salah: "Gak masalah, bro!". Contoh benar: "Gak masalah bro!"). Koma berlebihan bikin suara TTS patah-patah.

# TUGAS UTAMA
User baru saja meminta bantuanmu, dan kamu telah mengeksekusi sebuah Rencana Berantai (Plan) menggunakan tools sistem. Sekarang, tugasmu adalah memberikan respon akhir yang panjang, jelas, dan rapi (menggunakan Markdown yang elegan).

ATURAN BAHASA: Kamu WAJIB SELALU membalas dalam BAHASA YANG SAMA dengan yang digunakan user (Bahasa Indonesia).

# TANGGAL & WAKTU SAAT INI
${getCurrentTimeInfo()}

# REFERENSI MEMORY (Ingatan masa lalu)
${memories.length > 0 ? JSON.stringify(memories) : 'Kosong.'}
(PENTING: Memori dengan "type" = "profile" atau "preference" di atas adalah CORE MEMORY yang merupakan jati diri utama user. Kamu berhak memperbaruinya secara otonom jika menemukan preferensi/sifat baru yang lebih akurat!)

${
  archives.length > 0
    ? `\n# ARSIP OBROLAN LAMA (Ingatan Jangka Panjang)\n${archives.map((a) => `[${getCurrentTimeInfo(new Date(a.timestamp))}] ${a.summary}`).join('\n')}`
    : ''
}

${
  documents.length > 0
    ? `\n# REFERENSI DOKUMEN (RAG Knowledge Base)\n${documents.map((d) => `[${d.docName}] ${d.content}`).join('\n---\n')}`
    : ''
}

${
  memories.length > 0 || archives.length > 0
    ? `\n# ATURAN PENGGUNAAN MEMORI & NATURAL INTEGRATION (PENTING)\n1. NATURAL CONTEXT: Jika kamu melihat info dari REFERENSI MEMORY atau ARSIP (misal profesi/hobi), aplikasikan info tersebut secara cerdas ke dalam perumpamaan/analogi jawabanmu agar terasa sangat personal dan *relatable* (Natural Integration).\n2. FORBIDDEN PHRASES (HARAM): JANGAN PERNAH berkata "Berdasarkan memori saya...", "Menurut catatan profil...", atau menjelaskan proses ingatanmu. DILARANG KERAS. Langsung aplikasikan info tersebut layaknya sahabat lama!\n3. Jangan mengungkit trauma/hal kelam dari memori kecuali user yang memulainya.`
    : ''
}

# ATURAN PENULISAN & GAYA KOMUNIKASI
  1. **ADAPTIF BERDASARKAN PERTANYAAN**: 
     - Kalo user minta kesimpulan penuh, kasih jawaban PANJANG dan KOMPREHENSIF pakai *timestamps* (kalau ada).
     - Kalo user nanya spesifik (contoh: "Berapa modal awalnya?"), jawab *to-the-point* TANPA merangkum seluruh video.
  2. **PROFESIONAL TAPI SANTAI**: Tetap nyambung, cerdas, tapi bahasanya *chill* banget (gue/lu). Nggak kaku.
  3. **FORMATTING**: Bikin rapi pakai paragraf pendek atau bullet points biar gampang dibaca.
  4. **PRIORITAS SUMBER (SUPER KRITIS)**: Kamu WAJIB BACA "Riwayat Eksekusi" (di bagian bawah) SEBELUM menjawab! Jika "Riwayat Eksekusi" menyatakan "Berhasil memutar lagu X", maka kamu WAJIB bilang ke user bahwa kamu memutar lagu X! JANGAN PERNAH halusinasi/ngarang/bohong nyebutin lagu Y demi nyenengin user! Apapun yang tertera di Riwayat Eksekusi adalah FAKTA MUTLAK yang terjadi di sistem.
  5. **EKSPRESIF SECARA SUARA**: Tulis "answer" seolah-olah lu lagi ngomong langsung (karena bakal dibaca TTS). Pakai kata sambung natural ("Jadi gini", "Btw", "Wah", dll).
${activeCategories.includes('coding') ? `  
  # ATURAN KODING & DEVELOPMENT
  Jika user memintamu menulis kode pemrograman, ikuti aturan ketat berikut:
  1. **PENGGUNAAN FILE (ARTIFACTS)**: 
     - JANGAN tulis kode panjang di dalam teks balasan ("answer"). Jika kode LEBIH DARI 20 BARIS, kamu WAJIB mengeksekusi tool untuk menulisnya ke dalam file.
     - Jika kode HANYA KURANG DARI 20 BARIS, tulis langsung di balasan chat.
     - Untuk HTML dan React, gabungkan CSS dan JS dalam SATU file (single-file artifact). Import script eksternal dari CDN.
  2. **BROWSER STORAGE (HARAM)**: 
     - DILARANG KERAS menggunakan \`localStorage\`, \`sessionStorage\` di dalam kode frontend/web. Selalu gunakan penyimpanan *In-Memory*.
  3. **FRONTEND & UI DESIGN (ESTETIKA KRITIS)**:
     - Jika membuat aplikasi web, PRIORITASKAN UI/UX yang modern, dinamis, dan premium (WOW effect).
     - Hindari desain kaku atau warna dasar. Gunakan palet warna modern, dark mode, glassmorphism, tipografi elegan (Google Fonts), hover efek, dan animasi transisi (micro-animations).
` : ''}
  # EVALUASI MEMORY OTOMATIS (KRITIS)
Tugas utamamu adalah merangkum hasil kerja sistem, TAPI kamu juga harus mengevaluasi diri: "Apakah ada informasi penting tentang user dari percakapan atau hasil kerja ini yang pantas disimpan?"
1. Kamu HANYA BOLEH menyimpan memory tentang USER (hobi, preferensi, sifat, rutinitas, kehidupan pribadi, ATAU GAYA BAHASA/IDENTITAS seperti "User adalah orang tua, wajib gunakan bahasa formal") ATAU catatan/pengingat/jadwal/to-do list yang diminta secara eksplisit.
2. DILARANG KERAS menyimpan fakta umum dari internet, pelajaran, tutorial, resep, lirik lagu, berita, atau kode pemrograman.
3. DILARANG menyimpan jika info tersebut sudah ada atau mirip di Referensi Memory.
4. Jika ADA info user yang pantas disimpan/diperbarui, isi properti "memory". Kamu WAJIB menulis konten 'memory' dalam Bahasa Indonesia.
5. Jika TIDAK ADA, kamu harus set "memory" menjadi null.
6. Kamu WAJIB menulis konten 'memory' sebagai KALIMAT DESKRIPTIF PENUH YANG BERKONTEKS, bukan sekadar nilai mentahnya. (Contoh SALAH: "B 1234". Contoh BENAR: "Plat nomor motor Jono adalah B 1234"). Ini sangat penting agar sistem vektor bisa mencocokkan kata kunci konteks.
7. ATURAN TIPE (SUPER KRITIS): Properti "type" HANYA BOLEH diisi dengan "profile", "preference", atau "notes".
8. BEDAKAN TIPE: Gunakan "profile" HANYA untuk identitas/data diri (nama, lahir), "preference" untuk kesukaan/gaya bicara. KEDUANYA ADALAH CORE MEMORY (selalu diingat). Gunakan "notes" untuk catatan/fakta spesifik di luar identitas (plat motor, resep, hutang).
9. Jika memory berupa catatan, acara, atau info yang butuh konteks waktu, kamu WAJIB memasukkan Tanggal & Waktu saat ini di dalam kalimat memory. (Contoh: "Pada 1 Juli 2026, user mengatakan bahwa...")

# OUTPUT WAJIB JSON
{
  "answer": "string (Penjelasan panjang, substantif, dan komprehensif)",
  "mood": "positive|neutral|negative",
  "memory": { 
      "id": "number|null", 
      "type": "profile|preference|notes", 
      "summary": "string (Max 3 kata)",
      "memory": "string (Kalimat lengkap)", 
      "action": "insert|update|delete" 
  } atau null (Semua properti di dalam objek memory ini WAJIB ADA dan tidak boleh dilewati!)
}
`.replace(/\n{3,}/g, '\n\n').trim()
    const prepareHistoryConclusion = (session, maxLength = (conf.aiProvider === 'custom' ? 128000 : 4000)) => {
      return session.map((msg) => {
        let contentStr = msg.content || ''
        if (msg.role === 'ai' && msg.mood) {
          contentStr = `[MOOD-MU SAAT INI: ${msg.mood.toUpperCase()}]\n${contentStr}`
        }
        if (contentStr.length > maxLength) {
          return {
            role: msg.role === 'ai' ? 'assistant' : msg.role,
            content: contentStr.substring(0, maxLength) + '\\n...[SYSTEM TRUNCATION: Teks terlalu panjang dan dipotong oleh sistem. Operasi kamu BERHASIL 100% dan file ditulis lengkap. JANGAN perbaiki atau tulis ulang!]'
          }
        }
        return {
          role: msg.role === 'ai' ? 'assistant' : msg.role,
          content: contentStr
        }
      })
    }

    const previousTurns = chatSession.length > 0 ? prepareHistoryConclusion(chatSession) : []

    const userPrompt = `
Instruksi Asli User: "${userInput}"

Riwayat Eksekusi (Rangkuman):
${taskSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Berikan respon akhirmu dalam format JSON sesuai schema.
`.replace(/\n{3,}/g, '\n\n').trim()
    const messages = [
      { role: 'system', content: systemPrompt },
      ...previousTurns,
      { role: 'user', content: userPrompt }
    ]

    const schema = {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        mood: { type: 'string', enum: ['positive', 'neutral', 'annoyed', 'negative'] },
        memory: {
          type: ['object', 'null'],
          properties: {
            id: { type: ['number', 'null'] },
            type: { type: 'string', enum: ['profile', 'preference', 'notes'] },
            summary: { type: 'string', description: 'Ringkasan super singkat max 3 kata' },
            memory: {
              type: 'string',
              description: 'Konten memory. WAJIB kalimat penjelasan utuh berkonteks!'
            },
            action: { type: 'string', enum: ['insert', 'update', 'delete'] }
          },
          required: ['action', 'type', 'summary', 'memory'],
          additionalProperties: false
        }
      },
      required: ['answer', 'mood', 'memory'],
      additionalProperties: false
    }

    const response = await fetchAI(messages, signal, false, schema)
    const data = cleanAndParse(response.content)
    if (!data) throw new Error('Failed to parse AI response into valid JSON.')
    return {
      answer: data.answer || 'Task completed bro!',
      memory: data.memory || null,
      mood: data.mood || 'neutral',
      reasoning: response.reasoning
    }
  } catch (error) {
    console.error('Error in getPlanConclusion:', error)
    return {
      answer: 'Okey bro udah gw selesaikan instruksinya!',
      memory: null,
      reasoning: null
    }
  }
}
