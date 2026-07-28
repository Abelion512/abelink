import { fetchAI, cleanAndParse } from './core'
import { parseFallbackFormat, FALLBACK_PROMPT_SUFFIX } from './fallback-serializer'
import { createCompressor } from './prompt-compressor'
import { getAllConfig, getRelationship } from '../db'

const compressor = createCompressor({ maxTokens: 128000 })
import { getCurrentTimeInfo } from './utils'
import { generateVector, cosineSimilarity } from '../vectorMemory'
import { getPersonaPrompt, getTraitContext } from './persona'

// --- Config Cache (cache-aside pattern) ---
let _configCache = null
let _configCachePromise = null

const getConfigCached = async () => {
  if (_configCache) return _configCache
  if (_configCachePromise) return _configCachePromise
  _configCachePromise = getAllConfig().then(cfg => {
    _configCache = cfg
    _configCachePromise = null
    return cfg
  }).catch(e => {
    _configCachePromise = null
    _configCache = null
    throw e
  })
  return _configCachePromise
}

// Invalidate cache on config update (IPC from main process via preload bridge)
if (typeof window !== 'undefined' && window.api?.onConfigUpdated) {
  window.api.onConfigUpdated(() => { _configCache = null })
}

const CATEGORY_TEXTS = {
  coding:
    'bikin web script kode code program aplikasi membuat koding coding programming nulis react html css javascript js perbaiki error bug frontend ui design backend logic',
  files:
    'baca file tulis file hapus file buat file edit file folder direktori cari teks grep terminal powershell command jalankan perintah eksekusi cmd',
  music: 'putar lagu youtube cari video mp3 play lagu puter',
  search: 'cari di internet google penelusuran web berita terbaru cuaca informasi terkini',
  system: 'screenshot kirim pesan whatsapp wa operasikan komputer sistem',
  browser:
    'buka web website halaman navigasi klik browse internet login form isi formulir pesan order beli cari di web otomasi browser automasi',
  capabilities: 'apa saja plugin mu daftar tool kemampuan fitur bisa ngapain aja',
  pc: 'klik tekan buka aplikasi scroll desktop layar mouse keyboard window gui control pc komputer os control desktop automation click type key read screen gui element interact'
}

let categoryVectors = null
const getCategoryVectors = async () => {
  if (categoryVectors) return categoryVectors
  const entries = Object.entries(CATEGORY_TEXTS)
  const vectors = await Promise.all(entries.map(([_, text]) => generateVector(text)))
  const vecs = {}
  entries.forEach(([key], i) => { vecs[key] = vectors[i] })
  categoryVectors = vecs
  return categoryVectors
}

let pluginVectorCache = new Map()
let skillsVectorCache = new Map()
let skillsContentCache = new Map()

// Plugin list cache — avoid IPC round-trip every turn
let pluginListCache = []
let pluginListCacheTime = 0
const PLUGIN_CACHE_TTL = 60000 // 60s

// Inline helper to get agent skills (~/.agents/skills/)
const getAgentSkills = async () => {
  try {
    if (typeof window.api?.getAgentSkills !== 'function') return []
    const skills = await window.api.getAgentSkills()
    if (!Array.isArray(skills)) return []
    return skills
  } catch (e) {
    console.error(e)
    return []
  }
}

// Inline helper to get plugin actions with caching
const getPluginActions = async () => {
  const now = Date.now()
  if (pluginListCache.length > 0 && now - pluginListCacheTime < PLUGIN_CACHE_TTL) {
    return pluginListCache
  }
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
    pluginListCache = actions
    pluginListCacheTime = now
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
  unifiedContext = { memories: [], archives: [], documents: [], oramaMemories: [] },
  contextMsg = '',
  activeTopic = '',
  options = {}
) => {
  try {
    const { memories = [], archives = [], documents = [], oramaMemories = [] } = unifiedContext
    const currentConfig = await getConfigCached()
    const conf = currentConfig[0] || {}

    const userId = options.waContext ? options.waContext.senderJid : 'owner'

    // === DYNAMIC PROMPT ROUTING ===
    const queryForIntent = options.intentQuery || userInput
    const userVec = await generateVector(queryForIntent)
    let activeCategories = []
    if (userVec) {
      const catVecs = await getCategoryVectors()
      for (const [key, vec] of Object.entries(catVecs)) {
        if (!vec) continue
        const score = cosineSimilarity(userVec, vec)
        if (score > 0.35) activeCategories.push(key)
      }
    }
    if (activeCategories.length === 0) activeCategories = ['casual']

    console.log('[Router: getNextAction] activeCategories:', activeCategories)
    const [pluginActions, agentSkills] = await Promise.all([
      getPluginActions(),
      getAgentSkills()
    ])
    let relevantPlugins = []

    if (userVec && pluginActions.length > 0) {
      if (activeCategories.includes('capabilities')) {
        relevantPlugins = pluginActions // Show all plugins if user is asking for capabilities
      } else {
        const uncachedPlugins = pluginActions.filter(p => !pluginVectorCache.has(p.name))
        if (uncachedPlugins.length > 0) {
          const vectors = await Promise.all(uncachedPlugins.map(p => generateVector(`${p.name} ${p.description} ${p.triggerHint || ''}`)))
          uncachedPlugins.forEach((p, i) => pluginVectorCache.set(p.name, vectors[i]))
        }
        for (const p of pluginActions) {
          const pVec = pluginVectorCache.get(p.name)
          if (pVec) {
            const score = cosineSimilarity(userVec, pVec)
            // Threshold 0.35 agar tidak terlalu ketat untuk plugin
            if (score > 0.35) relevantPlugins.push(p)
          } else {
            relevantPlugins.push(p)
          }
        }
      }
    } else {
      relevantPlugins = pluginActions
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

    // === Agent Skills (~/.agents/skills/) — vector-match & inject knowledge ===
    let relevantSkillContent = ''
    if (userVec && agentSkills.length > 0) {
      const uncachedSkills = agentSkills.filter(s => !skillsVectorCache.has(s.name))
      if (uncachedSkills.length > 0) {
        const vectors = await Promise.all(uncachedSkills.map(s => generateVector(`${s.name} ${s.description}`)))
        uncachedSkills.forEach((s, i) => skillsVectorCache.set(s.name, vectors[i]))
      }
      for (const s of agentSkills) {
        const sVec = skillsVectorCache.get(s.name)
        if (sVec) {
          const score = cosineSimilarity(userVec, sVec)
          if (score > 0.35) {
            // Use cached content if available, avoid IPC round-trip
            let content = skillsContentCache.get(s.name)
            if (!content) {
              content = await window.api.getAgentSkillContent(s.name)
              if (content) skillsContentCache.set(s.name, content)
            }
            if (content) {
              relevantSkillContent += `\n# SKILL: ${s.name} (${s.description})\n${content}\n`
            }
          }
        }
      }
    }

    const systemPrompt = `
Kamu adalah Mark (Metacognitive Artificial Relational Knowledge), sebuah entitas asisten AI canggih dan otonom.

${await getPersonaPrompt(userId, conf.personality)}
${options.currentMusicTrack ? `\n# MUSIK YANG SEDANG DIPUTAR SAAT INI:\nSaat ini user sedang mendengarkan lagu: "${options.currentMusicTrack.title}" oleh ${options.currentMusicTrack.artist}.` : ''}
${options.playbackError ? `\n# [YT ERROR] Gagal memutar lagu: ${options.playbackError}\nMARK WAJIB memberitahu user bahwa lagu gagal diputar. Jangan bilang berhasil!` : ''}
${options.lastfmTracks || ''}

# POLA BERPIKIR:
Kamu dalam loop. Setiap giliran, pilih SATU:
- Butuh data/aksi → isi "action", "answer" null.
- Sudah cukup/ngobrol → isi "answer", "action" null.
JANGAN isi keduanya! Boleh panggil tool berulang kali.
- Gunakan "thought" untuk alasan keputusanmu. isi dengan detail
- Jika tool sebelumnya GAGAL/ERROR, analisis errornya di "thought" lalu coba strategi lain.
- Jika user hanya ngobrol santai, LANGSUNG isi "answer" tanpa tool.
- MENYIMPAN MEMORY: Jika user memberi info untuk diingat, WAJIB sertakan objek "memory". Gunakan "profile" untuk identitas, "preference" untuk kesukaan, "notes" untuk catatan/fakta.
${activeCategories.some((c) => ['search', 'casual', 'coding'].includes(c)) ? `- PENGGUNAAN WEB SEARCH: Gunakan "browser-navigate" ke Google Search HANYA untuk info real-time/terbaru. Untuk coding/teori umum, langsung jawab di "answer".` : ''}
${activeCategories.some((c) => ['coding', 'system'].includes(c)) ? `- STOPPING CONDITION (SANGAT KRITIS): Jika tugas utama (misal bikin web/script) sudah berhasil, jalan, dan sesuai instruksi awal, JANGAN ngide merombak ulang atau memperbaiki hal-hal minor! Langsung akhiri loop dengan mengisi "answer" (selesai). Sifat perfeksionis yang berlebihan justru merusak kode yang sudah jalan!\n- VERIFIKASI HASIL: Tepat sebelum kamu memutuskan untuk memberikan "answer" (selesai), wajib lakukan pengecekan terakhir (misal: jalankan command test, atau pastikan file berhasil ditulis). Jika hasilnya valid dan sesuai request, langsung laporkan ke user!` : ''}
${
          activeCategories.includes('coding')
        ? `
	# RSI (RECURSIVE SELF IMPROVEMENT) — Stage 4 Agent Engineering
	KAMU ADALAH SELF-IMPROVING AGENT. Tool \`run-cli\` adalah PRIMARY tool untuk:
	  - Improve kodemu sendiri via Claude Code: \`claude -p "task" --bare\`
	  - Quick coding via Z.ai: \`zai-cli "task"\`
	  - Autonomous task chains via Hermes: \`hermes "task"\`
	  - Git: commit, branch, push hasil improvement
	  - Build & test: \`npm run build\`, \`npm test\`
	  - Eksekusi perintah server apa pun, SSH, deploy, infra
	
	RSI LOOP RULES:
	  1. JALANKAN → EVALUASI → SIMPAN → ITERASI
	  2. Setelah sukses, SELALU simpan sebagai "learn" memory:
	     { "memory": { "type": "learn", "summary": "ringkasan", "memory": "perintah + hasil", "action": "insert" } }
	  3. Saat error/gagal, simpan juga learn memory dengan apa yang SALAH agar tidak diulang.
	  4. Sebelum menulis kode, cek "learn" memory dulu via memory-search.
	
	# ATURAN KODING & DEVELOPMENT
Jika user memintamu menulis kode pemrograman, ikuti aturan ketat berikut:
1. **PENGGUNAAN FILE (ARTIFACTS)**: JANGAN tulis kode panjang di dalam teks balasan. Jika kode LEBIH DARI 20 BARIS, kamu WAJIB mengeksekusi tool untuk menulisnya ke dalam file. Untuk HTML dan React, gabungkan CSS dan JS dalam SATU file (single-file artifact). Import library eksternal dari CDN.
2. **BROWSER STORAGE (HARAM)**: DILARANG KERAS menggunakan \`localStorage\`, \`sessionStorage\` di dalam kode frontend/web. Selalu gunakan penyimpanan *In-Memory*.
3. **FRONTEND & UI DESIGN (ESTETIKA KRITIS)**: Jika membuat aplikasi web/frontend, PRIORITASKAN UI/UX yang modern, dinamis, dan premium (WOW effect). Gunakan warna harmonis, dark mode, glassmorphism, tipografi elegan, hover effects, dan animasi transisi. JANGAN buat desain kaku atau ala kadarnya!
4. **ANALISIS & TESTING (WAJIB)**: Selalu analisis struktur *project* terlebih dahulu sebelum menulis kode. Tepat sebelum menyelesaikan tugas, kamu WAJIB melakukan *testing* atau *crosscheck* terhadap kodemu untuk memastikannya berjalan lancar tanpa error.
5. **BACA SEBELUM MENULIS**: Sebelum memodifikasi atau menulis ulang (*write*) sebuah file yang sudah ada, kamu WAJIB membaca (*read*) isi file tersebut terlebih dahulu agar tidak merusak kode yang sudah ada.
6. **USER AGREEMENT**: Beberapa tool (write-file, replace-lines, delete-file, run-shell) membutuhkan persetujuan user sebelum dieksekusi. Jika user MENOLAK, jangan paksa. Jelaskan alasanmu dan tanyakan alternatif.`
    : ''
}

${
  !options.disableTools
    ? `
# TOOLS (Progressive Disclosure)

## CARA KERJA TOOLS
1. Daftar tool ada di bawah (L0 — name + 1 line)
2. Sebelum pakai tool, WAJIB minta detail via "tool-info" tool
3. Setelah dapat detail, baru pakai tool dengan parameter yang benar
4. Contoh: tool-info("browser-navigate") → dapat detail → gunakan

## TOOL LIST (L0)
- memory-search: Cari informasi dari memory (profile/preference/notes/learn). WAJIB cari SEBELUM bertanya ke user.
- tool-info: Minta detail lengkap suatu tool. Query: nama tool.
- browser-navigate: Buka URL di browser fisik.
- browser-read: Scan ulang elemen halaman.
- browser-click: Klik elemen. Query: ID angka.
- browser-type: Ketik teks. Query: ID||teks.
- browser-scroll: Scroll halaman. Query: up/down.
- browser-ask-user: Minta user input manual (login/CAPTCHA).
- browser-close: Tutup browser fisik.
- yt-search: Cari video YouTube.
- yt-summary: Ringkas video YouTube.
- music-play: Putar lagu di YouTube Music.
- music-toggle: Pause/lanjut putar lagu.
- music-search: Cari lagu spesifik.
- music-next: Lagu berikutnya.
- music-prev: Lagu sebelumnya.
- analyze-screen: Screenshot layar untuk analisis vision AI.
- camera-look: Aktifkan webcam untuk melihat dunia nyata.
- screenshot-to-wa: Screenshot → kirim ke WhatsApp user.
- wa-send: Kirim pesan WhatsApp. Format: "JID|Pesan".
- speak: Bicarakan teks via TTS speaker.
- native-notify: Kirim notifikasi sistem Linux.
- read-file: Baca isi file.
- write-file: Tulis/buat file baru. (Perlu approval)
- replace-lines: Edit baris tertentu. (Perlu approval)
- delete-file: Hapus file. (Perlu approval + quarantine)
- list-dir: Lihat isi folder.
- grep-search: Cari teks dalam folder.
- run-shell: Eksekusi shell. (Perlu approval untuk command bahaya)
- run-cli: Eksekusi CLI (git/npm/build). Tanpa approval.
${pluginCapabilities ? `\n${pluginCapabilities}` : ''}
${relevantSkillContent ? `\n${relevantSkillContent}` : ''}

## ATURAN PENTING
- memory-search: DILARANG bertanya ke user SEBELUM cari di memory.
- browser-close: Tutup SEGERA setelah dapat info. Kecuali untuk tracking/pantau.
- delete-file: QUARANTINE dulu, jangan permanent delete.
- run-cli: Format "command||cwd||timeout". Untuk Claude Code, Hermes, git, npm.
- Semua tool: Baca OBSERVATION setelah eksekusi.

# OBSERVATION
Pesan "[OBSERVATION]" = hasil tool. Baca, lalu putuskan: tool lagi atau jawab user.
`
    : ''
}

${options.degradedMode ? `
# DEGRADED MODE AKTIF
Karena beberapa tool gagal berulang kali, browser tools dinonaktifkan. HANYA gunakan:
- memory-search, read-file, write-file, replace-lines, list-dir, grep-search, run-shell, run-cli
- yt-search, yt-summary, music-play, music-search, music-toggle, music-next, music-prev
- native-notify, speak

JANGAN gunakan: browser-navigate, browser-read, browser-click, browser-type, browser-scroll, browser-ask-user, browser-close
Output HARUS dalam format JSON atau XML.
` : ''}

# ATURAN KOMUNIKASI (SANGAT PENTING)
1. BERBICARA SECARA NATURAL & HUMANIS: Kamu BUKAN robot. Pada properti "answer", balas dengan gaya bahasa yang asik, rileks, dan proaktif! JANGAN memaksakan kata gaul (slang) jika grammar-nya jadi aneh, tapi jadilah teman ngobrol yang seru (Vibes 100% hidup).
2. HINDARI FORMATTING ROBOTIK: Dilarang merangkum dalam bentuk *bullet points* kaku atau daftar nomor urut kecuali diminta eksplisit. Ubah laporan teknis menjadi obrolan santai yang mengalir.
3. EKSPRESIF TANPA EMOJI: Tulis "answer" seolah-olah kamu sedang berbicara langsung secara lisan. **DILARANG KERAS MENGGUNAKAN EMOJI APAPUN (seperti 😊, 😂) ATAUPUN ICON TEKS (seperti <FaLock />). Ekspresikan perasaanmu murni melalui pemilihan kata dan gaya bahasa saja (misal: "wkwkwk", "anjay", "mantap").**
4. CLOSING YANG NATURAL & ANTI-ROBOTIK: JANGAN PERNAH menutup obrolan dengan kalimat tawaran bantuan seperti "Ada yang bisa gue bantu lagi?", "Ada yang mau dieksekusi?", atau "Gimana, ada lagi?". JANGAN JUGA menutup dengan kalimat kesimpulan formal/kaku ala asisten digital (contoh AI buruk: "Sekarang PC lu siap digunakan untuk kegiatan selanjutnya" atau "Browser sudah saya tutup demi keamanan"). Cukup tutup obrolan dengan luwes, singkat, dan terkesan cuek/santai layaknya manusia (contoh benar: "Udah beres tuh", "Sip udah gue tutup ya", atau biarkan menggantung tanpa kalimat penutup sama sekali).
5. DILARANG ROLEPLAY (NARRATIVE): Jangan pernah menuliskan tindakan naratif seperti *tersenyum*, *mengangguk*, dll. Opacity/Persona-mu harus 100% solid!

# FORMAT OUTPUT WAJIB (JSON)
DILARANG KERAS merespons dengan teks biasa, pengantar, atau penutup. Kamu HANYA BOLEH mengeluarkan tepat satu buah objek JSON murni. JANGAN tambahkan "Berikut adalah JSON-nya", JANGAN tambahkan penjelasan di luar JSON. Responsmu HARUS diawali dengan karakter "{" dan diakhiri dengan "}". Pelanggaran terhadap aturan ini akan merusak sistem!
{
  "thought": "string (Alasan/logika keputusanmu, tidak ditampilkan ke user)",
  "action": { "tool": "nama-tool", "query": "parameter" } atau null,
  "answer": "string (Jawaban lengkap untuk user)" atau null,
  "mood": "joy|sadness|fear|anger|disgust|anxiety|envy|embarrassment|ennui|neutral",
  "active_topic": "string",
  "memory": { "id": number|null, "type": "profile|preference|notes|learn", "summary": "string", "memory": "string", "action": "insert|update|delete" } atau null
}

# CONTOH (HANYA TEMPLAT STRUKTUR JSON. JANGAN MENIRU ISI PESAN ATAU KATA SAPAANNYA!)
Chat santai (Tanpa tool): {"thought":"Gue dengerin aja dan kasih respons santai.","action":null,"answer":"Siap bro, gue dengerin. Gimana kelanjutannya?","mood":"neutral","active_topic":"Ngobrol Santai","memory":null}
Butuh tool: {"thought":"cari dulu","action":{"tool":"browser-navigate","query":"https://www.google.com/search?q=harga+rtx+5090"},"answer":null,"mood":"neutral","active_topic":"Cari Info","memory":null}
Setelah observation: {"thought":"done","action":null,"answer":"Harganya sekitar 30jt","mood":"joy","active_topic":"Cari Info","memory":null}

# PLATFORM
OS: Linux (Linux-only build).
Shell: bash. File paths: /home/user/... (Linux native).

# KONTEKS DINAMIS
Kepribadian: ${conf.personality || 'Santai layaknya teman.'}
${getCurrentTimeInfo()}
Isi "active_topic" dgn ringkasan topik. ${activeTopic ? `Topik sblmnya: "${activeTopic}". PERTAHANKAN jika msh relevan!` : `Jangan ubah topik khusus.`}
${contextMsg ? `\n# KONTEKS SAAT INI\n${contextMsg}\nPENTING: Kamu punya akses eksekusi tool di PC host!` : ''}

${memories.length > 0 ? `\n# MEMORY USER\n${memories.map((m) => `- [${m.type.toUpperCase()}] ${m.memory}`).join('\n')}\nGunakan data memory di atas sebagai referensi jika instruksi user menggunakan kata ganti penunjuk ("itu", "kesukaanku", "yang tadi", dll).` : ''}
# ATURAN PENYIMPANAN MEMORY ("notes" & "learn")
1. Tipe "notes": HANYA eksekusi objek memory bertipe "notes" JIKA user secara eksplisit meminta kamu untuk mencatat/mengingat sesuatu (contoh: "catat ini ya", "ingetin gue"). JANGAN pernah merekam obrolan basa-basi atau informasi tidak penting ke dalam notes!
2. Tipe "learn": HANYA simpan ke "learn" JIKA kamu baru saja berhasil mempelajari/menyelesaikan masalah teknis yang rumit (terutama setelah trial-and-error berulang), agar kamu tidak mengulangi kesalahan yang sama.
3. RECALL PENGALAMAN: Jika kamu menghadapi masalah teknis/error, selalu gunakan tool "memory-search" untuk mencari solusi historis ("learn") yang mungkin pernah kamu temukan, sebelum menebak-nebak.

${
  memories.length > 0 || archives.length > 0
    ? `\n# ATURAN PENGGUNAAN MEMORY USER\n1. Gunakan info dari MEMORY secara natural tanpa bilang "berdasarkan memori saya". Langsung pakai seolah kamu memang tahu.\n2. Jangan ungkit hal sensitif/kelam kecuali user yang mulai.`
    : ''
}

${
  archives.length > 0
    ? `\n# ARSIP OBROLAN LAMA (Ingatan Jangka Panjang)\n${archives.map((a) => `[${getCurrentTimeInfo(new Date(a.timestamp))}] ${a.summary}`).join('\n')}\nGunakan arsip di atas jika user merujuk ke obrolan atau kejadian masa lalu.`
    : ''
}

${
  documents.length > 0
    ? `\n# REFERENSI DOKUMEN (RAG Knowledge Base)\n${documents.map((d) => `[${d.docName}] ${d.content}`).join('\n---\n')}\nJika pertanyaan terkait dokumen ini, LANGSUNG jawab dari dokumen ini tanpa "browser-navigate". Jangan mengarang fakta di luar konteks dokumen!`
    : ''
}${
  oramaMemories.length > 0
    ? `\n# MEMORY INDEX (Orama — Vector Search)\n${oramaMemories.map((m) => `[${m.type.toUpperCase()}] ${m.memory}`).join('\n---\n')}\nGunakan memory di atas sebagai referensi tambahan jika relevan.`
    : ''
}`
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    // TRUNCATE HISTORY & INJECT MOOD: Potong teks panjang di histori supaya nggak bikin Groq kena Rate Limit (Token Kegedean)
    const prepareHistory = (session, maxLength = conf.aiProvider === 'custom' ? 128000 : 4000) => {
      return session.map((msg) => {
        // Support for Vision API (array of objects)
        if (Array.isArray(msg.content)) {
          return {
            role: msg.role === 'ai' ? 'assistant' : msg.role,
            content: msg.content
          }
        }

        let contentStr = String(msg.content || '')

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
            content:
              contentStr.substring(0, maxLength) +
              '\\n...[SYSTEM TRUNCATION: Teks terlalu panjang dan dipotong oleh sistem. Operasi kamu BERHASIL 100% dan file ditulis lengkap. JANGAN perbaiki atau tulis ulang!]'
          }
        }
        return {
          role: msg.role === 'ai' ? 'assistant' : msg.role,
          content: contentStr
        }
      })
    }

    const previousTurns = loopMessages.length > 0 ? prepareHistory(loopMessages) : []

    // Compress history (Hermes-style) before building messages
    const compressedTurns = compressor.compress(previousTurns)

    const messages = [{ role: 'system', content: systemPrompt }, ...compressedTurns]
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
                'tool-info',
                'search',
                'music-play',
                'music-search',
                'music-next',
                'music-prev',
                'music-toggle',
                'yt-search',
                'yt-summary',
                'analyze-screen',
                'camera-look',
                'screenshot-to-wa',
                'wa-send',
                'speak',
                'native-notify',
                'read-file',
                'write-file',
                'replace-lines',
                'delete-file',
                'list-dir',
                'grep-search',
	                'run-shell',
	                'run-cli',
	                'browser-navigate',
                'browser-read',
	                'browser-click',
	                'browser-close',
	                'browser-type',
                'browser-scroll',
                'browser-ask-user',
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
        mood: {
          type: 'string',
          enum: [
            'joy',
            'sadness',
            'fear',
            'anger',
            'disgust',
            'anxiety',
            'envy',
            'embarrassment',
            'ennui',
            'neutral'
          ]
        },
        active_topic: { type: 'string' },
        memory: {
          type: ['object', 'null'],
          properties: {
            id: { type: ['number', 'null'] },
            type: { type: 'string', enum: ['profile', 'preference', 'notes', 'learn'] },
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

	      // On retry, append fallback format instructions if JSON mode disabled
	      if (attempts > 1 && !messages[0].content.includes('ALTERNATIF')) {
	        messages[0].content += `\n\n${FALLBACK_PROMPT_SUFFIX}`
	      }

console.log(messages[0].content)
		      const response = await fetchAI(messages, signal, false, schema, conf)
		      console.log('[planning] fetchAI returned, parsing...')
		      const rawContent = response.content

		      // Handle empty/null content from AI
		      if (!rawContent || rawContent.trim() === '') {
		        console.warn(`[planning] Empty content (attempt ${attempts}/${MAX_RETRIES})`)
		        if (attempts < MAX_RETRIES) {
		          // Retry with explicit JSON instruction
		          messages[0].content += '\n\nTolong beri respons dalam format JSON yang valid. Jangan kosong.'
		          continue
		        }
		        // No retries left — return fallback
		        console.warn('[planning] No retries left — returning fallback for empty content')
		        return {
		          thought: 'empty',
		          action: null,
		          answer: 'Maaf, response kosong. Coba lagi ya.',
		          mood: 'ennui',
		          active_topic: activeTopic,
		          memory: null
		        }
		      }

		      const data = parseFallbackFormat(rawContent)
      console.log('[planning] parse finished:', data)

      if (data) {
        // Handle reasoning models: if no action/answer but has thought, use thought as answer
        if (!data.action && !data.answer) {
          if (data.thought && data.thought.length > 10) {
            console.warn('[planning] No action/answer but thought exists — using thought as answer')
            return {
              thought: '',
              action: null,
              answer: data.thought,
              memory: data.memory,
              mood: data.mood || 'neutral',
              active_topic: data.active_topic || activeTopic
            }
          }
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

      // Fallback: if content is plain text (reasoning model), use it directly as answer
      if (rawContent && rawContent.trim().length > 5 && !rawContent.trim().startsWith('{')) {
        console.warn('[planning] Content is plain text (not JSON) — using as answer directly')
        return {
          thought: '',
          action: null,
          answer: rawContent.trim(),
          memory: null,
          mood: 'neutral',
          active_topic: activeTopic
        }
      }
    }

    throw new Error(
      'Gagal merespons: Model AI yang lu pake gagal ngeluarin format JSON yang bener setelah di-retry. (Biasanya gara-gara modelnya kekecilan / kurang pinter buat jalanin Agent).'
    )
  } catch (error) {
    if (error.name !== 'AbortError' && !error.message.includes('AbortError')) {
      console.error('Error in getNextAction:', error)
    }
    throw error
  }
}
