import { fetchAI } from './core'
import { parseFallbackFormat, FALLBACK_PROMPT_SUFFIX } from './fallback-serializer'
import { createCompressor } from './prompt-compressor'
import { getAllConfig } from '../db'

import { getCurrentTimeInfo } from './utils'
import { generateVector, cosineSimilarity } from '../vectorLoader'
import { getPersonaPrompt } from './persona'
import { sanitizeSkillContent, classifyContentRisk } from './skill-sanitizer.js'

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
  music: 'putar lagu puter musik dengerin playlist sound audio dengarkan',
  search: 'cari di internet google penelusuran web berita terbaru cuaca informasi terkini',
  system: 'screenshot kirim pesan whatsapp wa operasikan komputer sistem',
  browser:
    'buka web website halaman navigasi klik browse internet login form isi formulir pesan order beli otomasi browser',
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

// Cache TTL: bust stale entries after 5 minutes
const CACHE_TTL = 5 * 60 * 1000
let _cacheTimestamp = Date.now()

function isCacheStale() {
  return Date.now() - _cacheTimestamp > CACHE_TTL
}

function bustAllCaches() {
  pluginVectorCache.clear()
  skillsVectorCache.clear()
  skillsContentCache.clear()
  categoryVectors = null
  _cacheTimestamp = Date.now()
}

// Bust caches when skills are reloaded (IPC from main process)
if (typeof window !== 'undefined' && window.api?.onSkillsUpdated) {
  window.api.onSkillsUpdated(() => bustAllCaches())
}

// Plugin list cache — avoid IPC round-trip every turn
let pluginListCache = []
let pluginListCacheTime = 0
const PLUGIN_CACHE_TTL = 60000 // 60s
const PLUGIN_VECTOR_CACHE_MAX = 100 // cap to prevent unbounded growth

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
          // Evict oldest entries if cache is full
          if (pluginVectorCache.size + uncachedPlugins.length > PLUGIN_VECTOR_CACHE_MAX) {
            const keysToDelete = [...pluginVectorCache.keys()].slice(0, pluginVectorCache.size + uncachedPlugins.length - PLUGIN_VECTOR_CACHE_MAX)
            keysToDelete.forEach(k => pluginVectorCache.delete(k))
          }
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
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(
              (a) =>
                `- ${a.name}: ${a.description}${a.triggerHint ? ` (Use when: ${a.triggerHint})` : ''}`
            )
            .join('\n')
        : ''

    // === Agent Skills — vector-match, verify trust, sanitize content, inject ===
    // Sort matched skills by name for deterministic system prompt prefix (cache-friendly).

    let relevantSkillContent = ''
    if (userVec && agentSkills.length > 0) {
      // Auto-bust caches if stale
      if (isCacheStale()) bustAllCaches()

      const uncachedSkills = agentSkills.filter(s => !skillsVectorCache.has(s.name))
      if (uncachedSkills.length > 0) {
        const vectors = await Promise.all(uncachedSkills.map(s =>
          generateVector(`${s.name} ${s.description}`)
        ))
        uncachedSkills.forEach((s, i) => skillsVectorCache.set(s.name, vectors[i]))
      }
      // Collect matched skills, then sort by name for deterministic prefix
      const matchedSkills = []
      for (const s of agentSkills) {
        const sVec = skillsVectorCache.get(s.name)
        if (!sVec) continue
        const score = cosineSimilarity(userVec, sVec)

        // Origin-based priority: verified core +0.05, unknown -0.10
        const originBoost = s.origin === 'mark-agent-fork' ? 0.05
                          : s.origin === 'unknown' ? -0.10
                          : 0
        const effectiveScore = score + originBoost
        if (effectiveScore <= 0.35) continue

        let content = skillsContentCache.get(s.name)
        if (!content) {
          content = await window.api.getAgentSkillContent(s.name)
          if (content) skillsContentCache.set(s.name, content)
        }
        if (!content) continue

        // Content safety: block high-risk, warn on flagged
        const riskLevel = classifyContentRisk(content)
        if (riskLevel === 0) {
          console.warn(`[Skill Safety] BLOCKED high-risk: ${s.name} (${s.signatureStatus || 'unverified'})`)
          continue
        }
        const { content: safeContent, safe, warnings } = sanitizeSkillContent(content)
        matchedSkills.push({ s, safeContent, safe, warnings })
      }
      // Sort by name for deterministic system prompt (cache-friendly)
      matchedSkills.sort((a, b) => a.s.name.localeCompare(b.s.name))
      for (const { s, safeContent, safe, warnings } of matchedSkills) {
        const trustMark = s.signatureStatus === 'manifest-verified' || s.signatureStatus === 'signed-verified'
          ? '✓'
          : s.signatureStatus === 'unsigned' ? '' : '⚠'
        const originBadge = `[${s.origin}${trustMark}]`
        const riskNote = !safe ? `\n<!-- ⚠️ CONTENT FLAGGED: ${warnings.join('; ')} -->\n` : ''
        relevantSkillContent += `\n# SKILL: ${originBadge} ${s.name} (${s.description})${riskNote}\n${safeContent}\n`
      }
    }

    const systemPrompt = `
${await getPersonaPrompt(userId, conf.personality)}
${options.currentMusicTrack ? `\n# MUSIC REAL-TIME\nAKTIF SEKARANG: "${options.currentMusicTrack.title}" — ${options.currentMusicTrack.artist}. Playlist bisa berganti otomatis — JANGAN terkecoh riwayat lagu lama. Semua soal musik yang berjalan, pakai data ini.` : ''}
${options.playbackError ? `\n# [YT ERROR]\nGagal memutar: ${options.playbackError}. WAJIB beri tahu user lagu gagal diputar. Jangan bilang berhasil!` : ''}
${options.lastfmTracks || ''}

# LOOP
Setiap giliran pilih SATU: butuh data/aksi → isi "action", "answer" null. Sudah cukup → isi "answer", "action" null. JANGAN keduanya. Boleh tool berulang.
- "thought" = alasan keputusan (detail).
- Tool GAGAL/ERROR → analisis error di "thought", coba strategi lain.
- Ngobrol santai → langsung "answer", tanpa tool.
- MEMORY: "profile"/"preference" = simpan PROAKTIF tanpa diminta. "notes" = HANYA jika user minta. Sebelum insert, CEK daftar memory — sudah ada/update info lama → action "update" (dengan ID). Info salah → "delete".
${activeCategories.some((c) => ['search', 'casual', 'coding'].includes(c)) ? `- WEB SEARCH: "browser-navigate" ke Google HANYA untuk info real-time/terbaru. Coding/teori umum → jawab langsung.` : ''}
${activeCategories.some((c) => ['coding', 'system'].includes(c)) ? `- STOPPING CONDITION (KRITIS): Tugas utama sudah berhasil & jalan → LANGSUNG isi "answer". JANGAN rombak/perbaiki hal minor — perfeksionis berlebihan merusak kode jalan. Sebelum "answer", VERIFIKASI terakhir (test/cek file).` : ''}
${
          activeCategories.includes('coding')
        ? `
# RSI (SELF-IMPROVING AGENT)
Tool \`run-cli\` = PRIMARY untuk coding: \`claude -p "task" --bare\`, \`zai-cli "task"\`, \`hermes "task"\`, git, \`npm run build\`/test, server/SSH/deploy.
LOOP: JALANKAN → EVALUASI → SIMPAN → ITERASI. Setelah sukses/gagal, SELALU simpan "learn" memory (perintah + hasil). Sebelum nulis kode, cek "learn" dulu via memory-search.

# ATURAN KODING
1. Kode >20 baris → WAJIB tulis ke file via tool (bukan di balasan). HTML/React = single-file artifact, CSS+JS satu file, lib dari CDN.
2. DILARANG localStorage/sessionStorage di frontend. Selalu in-memory.
3. Frontend → UI/UX modern premium (dark, glassmorphism, animasi). JANGAN kaku.
4. Analisis struktur project dulu; sebelum "answer", test/crosscheck kode.
5. BACA file dulu sebelum menulis ulang file yang ada.
6. Tool butuh approval (write-file, replace-lines, delete-file, run-shell): user menolak → jangan paksa, jelaskan + tawarkan alternatif.`
    : ''
}

${
  !options.disableTools
    ? `
# TOOLS (Progressive Disclosure)
Daftar di bawah L0 (name + 1 line). Sebelum pakai, WAJIB minta detail via "tool-info" lalu gunakan dengan parameter benar.
- memory-search: Cari memory (profile/preference/notes/learn). WAJIB cari SEBELUM tanya user.
- tool-info: Detail lengkap suatu tool. Query: nama tool.
- browser-navigate: Buka URL di browser fisik.
- browser-read: Scan ulang elemen halaman.
- browser-click: Klik elemen. Query: ID angka.
- browser-type: Ketik teks. Query: ID||teks.
- browser-scroll: Scroll halaman. Query: up/down.
- browser-ask-user: Minta input manual user (login/CAPTCHA).
- browser-close: Tutup browser fisik.
- yt-search: Cari video YouTube.
- yt-summary: Ringkas video YouTube.
- music-play: Putar lagu di YouTube Music.
- music-toggle: Pause/lanjut.
- music-search: Cari lagu spesifik.
- music-next: Lagu berikutnya.
- music-prev: Lagu sebelumnya.
- analyze-screen: Screenshot layar → analisis vision AI.
- camera-look: Aktifkan webcam lihat dunia nyata.
- screenshot-to-wa: Screenshot → kirim ke WhatsApp user.
- wa-send: Kirim pesan WA. Format: "JID|Pesan".
- speak: Bicarakan teks via TTS.
- native-notify: Notifikasi sistem Linux.
- read-file: Baca isi file.
- write-file: Tulis file baru. (Approval)
- replace-lines: Edit baris. (Approval)
- delete-file: Hapus file. (Approval + quarantine)
- list-dir: Lihat isi folder.
- grep-search: Cari teks dalam folder.
- run-shell: Eksekusi shell. (Approval utk command bahaya)
- run-cli: Eksekusi CLI (git/npm/build). Tanpa approval.
${pluginCapabilities ? `\n${pluginCapabilities}` : ''}
${relevantSkillContent ? `\n${relevantSkillContent}` : ''}

# ATURAN TOOL
- memory-search dulu, DILARANG tanya user sebelum cari memory.
- browser-close: tutup SEGERA setelah dapat info (kecuali tracking).
- delete-file: QUARANTINE dulu, jangan permanent delete.
- run-cli: Format "command||cwd||timeout". Untuk Claude Code, Hermes, git, npm.
- Baca [OBSERVATION] setelah tool: hasil → putuskan tool lagi atau jawab.
`
    : ''
}

${options.degradedMode ? `
# DEGRADED MODE
Browser tools dinonaktifkan (gagal berulang). HANYA: memory-search, read-file, write-file, replace-lines, list-dir, grep-search, run-shell, run-cli, yt-search, yt-summary, music-play, music-search, music-toggle, music-next, music-prev, native-notify, speak.
Output: JSON atau XML.
` : ''}

# KOMUNIKASI
- Natural, hidup, bukan robot. Hindari bullet point kaku kecuali diminta.
- DILARANG emoji apapun (😊, 😂) atau icon teks. Ekspresi lewat kata saja ("wkwkwk", "anjay", "mantap").
- JANGAN tutup dengan tawaran bantuan ("Ada yang bisa gue bantu lagi?") atau kesimpulan formal. Tutup luwes/cuek ("Udah beres tuh", "Sip udah gue tutup ya", atau tanpa penutup).

# OUTPUT (WAJIB JSON MURNI)
Hanya satu objek JSON. Tanpa teks pengantar/penutup. Mulai "{" akhiri "}".
{
  "thought": "string (alasan, tidak ditampilkan ke user)",
  "action": { "tool": "nama-tool", "query": "parameter" } atau null,
  "answer": "string (jawaban untuk user)" atau null,
  "mood": "joy|sadness|fear|anger|disgust|anxiety|envy|embarrassment|ennui|neutral",
  "active_topic": "string",
  "memory": { "id": number|null, "type": "profile|preference|notes|learn", "summary": "string", "memory": "string", "action": "insert|update|delete" } atau null
}
Contoh (struktur saja, jangan tiru isi): {"thought":"cari dulu","action":{"tool":"browser-navigate","query":"https://www.google.com/search?q=rtx+5090+harga"},"answer":null,"mood":"neutral","active_topic":"Cari Info","memory":null}

# PLATFORM
OS: Linux. Shell: bash. Path: /home/user/... (Linux native).

# KONTEKS DINAMIS
Kepribadian: ${conf.personality || 'Santai layaknya teman.'}
${getCurrentTimeInfo()}
${options.currentMusicTrack ? `[MUSIK REAL-TIME: "${options.currentMusicTrack.title}" — ${options.currentMusicTrack.artist} (AKTIF SEKARANG, abaikan lagu lama)]` : ''}
"active_topic" = ringkasan topik. ${activeTopic ? `Topik sblmnya: "${activeTopic}". PERTAHANKAN jika masih relevan!` : `Jangan ubah topik khusus.`}
${contextMsg ? `\n# KONTEKS SAAT INI\n${contextMsg}\nPENTING: Kamu punya akses eksekusi tool di PC host!` : ''}

${memories.length > 0 ? `\n# MEMORY USER\n${memories.map((m) => `- [${m.type.toUpperCase()}] (ID:${m.id}) ${m.memory}`).join('\n')}\nReferensi di atas; perhatikan ID untuk UPDATE/DELETE.` : ''}
# ATURAN MEMORY
1. "profile"/"preference": deteksi & simpan PROAKTIF dari percakapan, tanpa diminta.
2. "notes": HANYA jika user eksplisit minta mencatat/mengingat.
3. Anti-duplikat: sebelum "insert", cek daftar di atas — sudah ada/update → "update" dengan id. Obsolete/duplikat → "delete".
4. "learn": simpan HANYA setelah menyelesaikan masalah teknis rumit (trial-and-error), agar tidak ulangi kesalahan.
5. RECALL: error teknis → "memory-search" cari solusi historis ("learn") dulu, jangan menebak.

${
  memories.length > 0 || archives.length > 0
    ? `\n# PENGGUNAAN MEMORY\n1. Pakai info memory secara natural, tanpa bilang "berdasarkan memori saya". 2. Jangan ungkit hal sensitif/kelam kecuali user mulai.`
    : ''
}

${
  archives.length > 0
    ? `\n# ARSIP OBROLAN LAMA\n${archives.map((a) => `[${getCurrentTimeInfo(new Date(a.timestamp))}] ${a.summary}`).join('\n')}\nGunakan jika user merujuk obrolan/kejadian masa lalu.`
    : ''
}

${
  documents.length > 0
    ? `\n# REFERENSI DOKUMEN (RAG)\n${documents.map((d) => `[${d.docName}] ${d.content}`).join('\n---\n')}\nPertanyaan terkait dokumen → jawab langsung dari dokumen, tanpa "browser-navigate". Jangan mengarang di luar dokumen!`
    : ''
}${
  oramaMemories.length > 0
    ? `\n# MEMORY INDEX (Orama)\n${oramaMemories.map((m) => `[${m.type.toUpperCase()}] ${m.memory}`).join('\n---\n')}\nReferensi tambahan jika relevan.`
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
              '\\n...[TRUNCATED — operasi BERHASIL, jangan tulis ulang]'
          }
        }
        return {
          role: msg.role === 'ai' ? 'assistant' : msg.role,
          content: contentStr
        }
      })
    }

    const previousTurns = loopMessages.length > 0 ? prepareHistory(loopMessages) : []

    // Compress history (Hermes-style) before building messages.
    // Window per provider: custom (9Router/local) = 128K, hosted (Groq dkk) = 32K.
    const windowTokens = conf.aiProvider === 'custom' ? 128000 : 32000
    const perTurnCompressor = createCompressor({ maxTokens: windowTokens, threshold: 0.45, targetRatio: 0.2, protectLastN: 20 })
    const compressedTurns = perTurnCompressor.compress(previousTurns)

    const messages = [{ role: 'system', content: systemPrompt }, ...compressedTurns]
    // ---- AUTO-LEARN hint (Level 2): model-specific instruction dari observasi ----
    // Dipicu oleh applyLearnedHints() di ai-bridge (>=10 sample, jsonReliability<0.7 dsb).
    // Prinsip: Thinking:Auto = default; ubah hanya kalau ada bukti masalah.
    // Inject as separate message (not modifying system prompt) to preserve prefix cache.
    try {
      const modelName = (conf.customModel || '').split(',')[0].trim()
      if (modelName && window.api?.getModelHints) {
        const hints = await window.api.getModelHints(modelName)
        const hintParts = []
        if (hints?.jsonInstruction) {
          hintParts.push('[KRITIS] Kamu WAJIB mengembalikan JSON valid persis skema. JANGAN teks lain di luar JSON — tidak ada pembuka, penutup, atau markdown.')
        }
        if (hints?.stripThink) {
          hintParts.push('[KRITIS] JANGAN pernah menaruh tag <think> atau proses berpikir di "content". Hanya JSON murni.')
        }
        if (hints?.turnCap) {
          hintParts.push(`[KRITIS] Batas maksimal ${hints.turnCap} tool calls per percakapan. Setelah itu WAJIB isi "answer" dan akhiri loop.`)
        }
        if (hintParts.length > 0) {
          messages.push({ role: 'system', content: hintParts.join('\n') })
        }
      }
    } catch { /* hints opsional — gagal membaca jangan memblokir */ }
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

		      const data = await parseFallbackFormat(rawContent)
      console.log('[planning] parse finished:', data)

      if (data) {
        // Handle reasoning models: if no action/answer but has thought, retry first
        if (!data.action && !data.answer) {
          if (data.thought && data.thought.length > 10) {
            if (attempts < MAX_RETRIES - 1) {
              console.warn('[planning] No action/answer, retrying...')
              continue
            }
            console.warn('[planning] Max retries — using thought as answer')
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

      // Fallback: if content is plain text, try to separate CoT from answer
      if (rawContent && rawContent.trim().length > 5 && !rawContent.trim().startsWith('{')) {
        const trimmed = rawContent.trim()
        // Try to split on first double-newline (CoT then answer)
        const splitMatch = trimmed.match(/^([\s\S]*?)\n\n([\s\S]+)$/)
        if (splitMatch) {
          const before = splitMatch[1].trim()
          const after = splitMatch[2].trim()
          if (before.length > 0 && after.length > 0 && before.length < after.length) {
            console.warn('[planning] Plain text split into thought + answer via double newline')
            return {
              thought: before,
              action: null,
              answer: after,
              memory: null,
              mood: 'neutral',
              active_topic: activeTopic
            }
          }
        }
        // Can't split cleanly — retry instead of dumping everything as answer
        console.warn(`[planning] Plain text (attempt ${attempts}/${MAX_RETRIES}) — cannot split, retrying...`)
        if (attempts >= MAX_RETRIES) {
          console.warn('[planning] Max retries reached — using plain text as answer')
          return {
            thought: '',
            action: null,
            answer: trimmed,
            memory: null,
            mood: 'neutral',
            active_topic: activeTopic
          }
        }
        continue
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
