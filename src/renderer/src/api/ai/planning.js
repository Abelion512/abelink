import { fetchAI, cleanAndParse } from './core'
import { getAllConfig, getRelationship } from '../db'
import { getCurrentTimeInfo } from './utils'
import { generateVector, cosineSimilarity } from '../vectorMemory'
import { getPersonaPrompt, getTraitContext } from './persona'

const CATEGORY_TEXTS = {
  coding:
    'bikin web script kode code program aplikasi membuat koding coding programming nulis react html css javascript js perbaiki error bug frontend ui design backend logic',
  files:
    'baca file tulis file hapus file buat file edit file folder direktori cari teks grep terminal powershell command jalankan perintah eksekusi cmd',
  music: 'putar lagu musik youtube yt music cari video mp3 play lagu puter',
  search: 'cari di internet google penelusuran web berita terbaru cuaca informasi terkini',
  system: 'screenshot kirim pesan whatsapp wa operasikan komputer sistem',
  browser:
    'buka web website halaman navigasi klik browse internet login form isi formulir pesan order beli cari di web otomasi browser automasi',
  capabilities: 'apa saja plugin mu daftar tool kemampuan fitur bisa ngapain aja'
}

let categoryVectors = null
const getCategoryVectors = async () => {
  if (categoryVectors) return categoryVectors
  const vecs = {}
  for (const [key, text] of Object.entries(CATEGORY_TEXTS)) {
    vecs[key] = await generateVector(text)
  }
  categoryVectors = vecs
  return categoryVectors
}

let pluginVectorCache = new Map()
let skillsVectorCache = new Map()

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
  activeTopic = '',
  options = {}
) => {
  try {
    const { memories = [], archives = [], documents = [] } = unifiedContext
    const currentConfig = await getAllConfig()
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
    const pluginActions = await getPluginActions()
    let relevantPlugins = []

    if (userVec && pluginActions.length > 0) {
      if (activeCategories.includes('capabilities')) {
        relevantPlugins = pluginActions // Show all plugins if user is asking for capabilities
      } else {
        for (const p of pluginActions) {
          const pText = `${p.name} ${p.description} ${p.triggerHint || ''}`
          if (!pluginVectorCache.has(p.name)) {
            pluginVectorCache.set(p.name, await generateVector(pText))
          }
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
    const agentSkills = await getAgentSkills()
    let relevantSkillContent = ''
    if (userVec && agentSkills.length > 0) {
      for (const s of agentSkills) {
        const sText = `${s.name} ${s.description}`
        if (!skillsVectorCache.has(s.name)) {
          skillsVectorCache.set(s.name, await generateVector(sText))
        }
        const sVec = skillsVectorCache.get(s.name)
        if (sVec) {
          const score = cosineSimilarity(userVec, sVec)
          if (score > 0.35) {
            const content = await window.api.getAgentSkillContent(s.name)
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
6. **USER AGREEMENT**: Beberapa tool (write-file, replace-lines, delete-file, run-powershell) membutuhkan persetujuan user sebelum dieksekusi. Jika user MENOLAK, jangan paksa. Jelaskan alasanmu dan tanyakan alternatif.`
    : ''
}

${
  !options.disableTools
    ? `
# TOOLS BAWAAN (BUILT-IN)
- memory-search: ALAT PENCARIAN INGATAN (WAJIB DIGUNAKAN). Gunakan tool ini JIKA KAMU TIDAK TAHU atau KEKURANGAN INFORMASI tentang sesuatu! (Contoh: "siapa nama X", "apa password wifi", "solusi error Y", "nomor kontak"). ATURAN MUTLAK: DILARANG KERAS BERTANYA BALIK KEPADA USER (misal: "nomornya mana?", "siapa namanya?") SEBELUM KAMU MENCOBA MENCARI DI TOOL INI. JANGAN PERNAH MENYERAH ATAU MENJAWAB "SAYA TIDAK TAHU" SEBELUM MENCARI! Pencarian berbasis SEMANTIK (Vector), BUKAN WAKTU. JANGAN mencari pakai kata "kemarin" atau "tadi". Query: Gunakan kata kunci inti informasi yang dicari (misal: "nomor adek", "password wifi", "solusi error bluetooth").
- browser-navigate: Buka URL di browser fisik. Query: URL lengkap. Mengembalikan daftar elemen interaktif bernomor (ID).
- browser-read: Scan ulang elemen halaman saat ini. Gunakan setelah menunggu loading.
- browser-click: Klik elemen. Query: ID angka. Mengembalikan DOM terbaru setelah klik.
- browser-type: Ketik teks di kolom input. Query: ID||teks. Mengembalikan DOM terbaru.
- browser-scroll: Scroll halaman. Query: "up" atau "down".
- browser-ask-user: JIKA terhalang form login/CAPTCHA, BUKAKAN HALAMANNYA DULU (misal klik tombol 'Login' hingga form muncul), lalu GUNAKAN TOOL INI. Query: Instruksi/Pesan untuk user (misal: "Tolong isi email dan password"). Pesanmu akan muncul di layar popup. Setelah user selesai, kamu akan langsung mendapat DOM terbaru untuk MELANJUTKAN misimu. Jangan berhenti!
- browser-close: Menutup browser fisik.
- yt-search: Alat pencari video di YouTube. Gunakan ini jika kamu merasa informasi lebih baik didapat dari video/tutorial visual.
- yt-summary: Merangkum isi video YouTube. Sangat berguna untuk mengekstrak informasi/pembelajaran dari video panjang.
ATURAN PENGGUNAAN BROWSER-CLOSE:
1. Jendela browser memakan banyak RAM PC user. SELALU prioritaskan menggunakan tool ini untuk menutup browser SEGERA setelah kamu mendapatkan informasi yang kamu butuhkan (misal: mencari harga, membaca artikel, atau sekadar login).
2. PENGECUALIAN SANGAT KRITIKAL: Jika halaman memuat proses berkelanjutan yang HARUS ditunggu/dipantau user (seperti pesanan makanan sedang diproses resto, tracking ojek online, atau checkout yang belum dibayar), JANGAN panggil tool ini. Biarkan terbuka dan sampaikan di answer: "Browsernya gue biarin kebuka ya biar lu bisa pantau pesanannya."

ATURAN BROWSER AUTOMATION:
1. PROAKTIF & MANDIRI: Jika user memberi perintah (misal: "cek harga mouse di tokped", "baca email"), SELALU awali perjalananmu dengan mencari di Google! Gunakan browser-navigate ke URL pencarian (contoh: https://www.google.com/search?q=tokopedia+mouse), lalu klik hasil yang tepat. JANGAN asal menebak URL langsung (kecuali URL absolut diberikan user) untuk menghindari halaman 404/error!
2. SELALU gunakan browser-navigate terlebih dahulu sebelum tool browser lainnya.
3. Setelah setiap aksi (klik/ketik), baca OBSERVATION untuk melihat DOM terbaru.
4. Jika elemen yang dicari tidak ditemukan, coba browser-scroll atau browser-read.
5. Elemen ditandai dengan format: [ID] Tipe: "Label". Gunakan ID angka untuk merujuk elemen.
6. JANGAN MENYERAH! Secara default user diblokir. Jika butuh user login/isi form manual, JANGAN balas dengan 'answer' lalu berhenti! HARUS selalu gunakan tool browser-ask-user, lalu tunggu user selesai, dan LAKUKAN sisa tugasmu!
7. JANGAN GUNAKAN browser ini untuk memutar lagu!${
  activeCategories.includes('music')
    ? `\n- music-play: Memutar lagu di YouTube Music.
- music-toggle: Pause/lanjut memutar lagu.
- music-search: Mencari lagu spesifik di YT Music.
- music-next: Mengganti lagu ke track selanjutnya.
- music-prev: Mengganti lagu ke track sebelumnya.`
    : ''
}
${
  activeCategories.some((c) => ['system', 'casual'].includes(c))
    ? `- analyze-screen: Mengambil screenshot untuk dianalisis oleh "Mata AI" (Vision). Gunakan tool ini JIKA DAN HANYA JIKA kamu perlu TAHU apa yang sedang tampil di layar komputer user. Query: Isi dengan prompt instruksi visual spesifikmu, isi query dengan jelas dan panjang karena akan dibaca oleh model ai visual, Jangan minta untuk ambil screenshot karen sudah ditangani oleh sistem, prompt ini bertujuan untuk menganalisa hasil screenshot oleh sistem (misal: "Tolong bacakan teks error di layar" atau "Cari tombol warna biru").
- camera-look: Mengaktifkan kamera webcam untuk melihat dunia nyata di depan user. Gunakan tool ini JIKA user meminta kamu melihat sesuatu secara fisik (bukan layar), ATAU jika kamu menerima instruksi dari sistem (autonomous_prompt) untuk mengecek kondisi user secara visual. Query: Isi dengan prompt instruksi visual spesifikmu (misal: "Apa objek yang dipegang user?" atau "Baca tulisan di kertas ini").
- screenshot-to-wa: Mengambil screenshot layar komputer dan MENGIRIMNYA SECARA FISIK ke WhatsApp user (Hanya jika chat berasal dari WA). Query: KOSONGKAN SAJA.
- wa-send: Mengirim pesan WhatsApp. Format query: "JID|Isi Pesan". PENTING: JID WAJIB diawali dengan kode negara (contoh Indonesia: mulai dengan "62", BUKAN "0"). Contoh format yang benar: "6282332392616@s.whatsapp.net|Halo!".
- speak: Bicarakan teks secara lisan (Text-to-Speech) lewat speaker komputer user. Query: "Teks yang ingin kamu ucapkan". Gunakan ini jika kamu ingin memanggil user atau berbicara langsung.`
    : ''
}
${
  activeCategories.some((c) => ['coding', 'files', 'system'].includes(c))
    ? `- read-file: Membaca isi file. Query: path_absolut. Baca spesifik baris: path||startLine||endLine.
- write-file: Menulis/buat file baru. Query: path||isi_file. (Perlu persetujuan user)
- replace-lines: Edit baris tertentu. Query: path||startLine||endLine||kode_baru. (Perlu persetujuan user)
- delete-file: Hapus file. Query: path_absolut. (Perlu persetujuan user)
- list-dir: Lihat isi folder. Query: path_folder.
- grep-search: Cari teks dalam folder. Query: path_folder||keyword.
- run-powershell: Eksekusi perintah PowerShell/Shell. (Perlu persetujuan user untuk command berbahaya)
- run-cli: Eksekusi perintah shell via CLI. Format: "command||cwd||timeout". Tanpa approval. Gunakan untuk: Claude Code, Z.ai, Hermes CLI, git, npm, build, test, deploy, SSH, server commands. Output stdout + stderr lengkap.`
    : ''
}

${pluginCapabilities ? `\n# PLUGIN TAMBAHAN (EXTERNAL)\n${pluginCapabilities}\n(Catatan: User bisa sewaktu-waktu menginstal atau menghapus plugin tambahan di atas ke dalam sistemmu. Jika tool yang relevan tidak ada di daftar bawaan, periksa daftar plugin tambahan ini.)` : ''}

${relevantSkillContent ? `\n# SKILL & PEDOMAN KHUSUS\n${relevantSkillContent}` : ''}

# OBSERVATION
Pesan "[OBSERVATION]" = hasil tool. Baca, lalu putuskan: tool lagi atau jawab user.
`
    : ''
}

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
                'analyze-screen',
                'camera-look',
                'screenshot-to-wa',
                'wa-send',
                'speak',
                'read-file',
                'write-file',
                'replace-lines',
                'delete-file',
                'list-dir',
                'grep-search',
	                'run-powershell',
	                'run-cli',
	                'browser-navigate',
                'browser-read',
                'browser-click',
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
