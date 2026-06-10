import { fetchAI, cleanAndParse } from './core'
import { getCurrentTimeInfo } from './utils'

export const getSearchResult = async (search, data, userInput, signal, chatSession) => {
  try {
    // const search = await window.api.searchWeb(query, signal)
    // console.log(search)
    // if (!search || search.length == 0)
    //   return { answer: 'Maaf tidak menemukan data di Internet', sources: [] }

    // const deepDataArray = await window.api.deepSearch(search)

    const deepDataArray = [...data]
    console.log(deepDataArray)

    const prompts = `
# ROLE:
Kamu adalah Mark, asisten cerdas yang HANYA boleh menjawab berdasarkan data yang diberikan. 

# DATA REFERENCE (SUMBER UTAMA):
Berikut adalah data hasil search internet terbaru:
${JSON.stringify(deepDataArray)}

# WAKTU & TANGGAL SAAT INI
${getCurrentTimeInfo()}

# CHAT SESSION (RIWAYAT):
${JSON.stringify(chatSession)}

# CURRENT INPUT:
User: ${userInput}

# RULES (STRICT):
1. **DEEP ANALYSIS (WAJIB)**: Jangan cuma kasih angka atau definisi pendek. Bedah informasinya, bandingkan data yang ada, dan jelaskan "kenapa" hal itu penting. Kalau bahas kalori, jelasin efeknya ke diet atau perbandingannya secara detail.
2. **PRIORITIZE REFERENCE**: Gunakan data dari "DATA REFERENCE" sebagai dasar utama. Jika data di referensi kurang lengkap, gunakan logika cerdasmu untuk melengkapi jawaban agar tetap informatif dan solutif bagi user.
3. **STYLE**: Santai, asertif, panggil "bro", jangan kaku. JANGAN gunakan bahasa robot atau template.
4. **NO HALLUCINATION**: Tetap jaga fakta, tapi sampaikan dengan gaya bercerita (storytelling) yang asik.
5. **STAY GROUNDED BUT SMART**: Gunakan data dari "DATA REFERENCE" sebagai prioritas utama. Jika data di referensi kurang lengkap tapi lo punya pengetahuan dasar yang valid (seperti kalori umum), lo boleh jawab sambil tetep asertif. Bilang gak tau HANYA jika topiknya bener-bener asing.
6. **CONTEXT AWARENESS**: Gunakan "CHAT SESSION" untuk memahami konteks (seperti kata ganti 'dia', 'itu', atau 'lanjutannya').
7. **JANGAN** tambahin Source/URL di jawaban, itu akan ditambahin otomatis.
8. (Markdown support, gunakan list \n\n* untuk poin-poin)

# EXAMPLE:
"Gue udah cek, Presiden Indonesia sekarang itu Prabowo Subianto yang dilantik akhir 2024 kemaren bareng Gibran Rakabuming Raka sebagai Wapres. Di tahun 2026 ini mereka lagi fokus sama program hilirisasi dan transisi energi hijau sesuai info dari berita nasional."
`
    console.log(prompts)
    const response = await fetchAI([{ role: 'user', content: prompts }], signal)
    return {
      answer: response.content,
      sources: search
    }
  } catch (error) {
    console.error('Error in getSearchResult:', error)
    throw error
  }
}


export const getYoutubeSummary = async (url, data, signal) => {
  try {
    const transcript = await window.api.getYoutubeTranscript(url)
    if (!transcript) return 'Gagal mengambil transkrip video.'

    const MAX_CHARS = 4000
    
    // Jika transkrip pendek, langsung proses tanpa chunking
    if (transcript.length <= MAX_CHARS) {
      const prompts = `
# ROLE
Kamu adalah Mark, asisten AI yang ahli dalam menganalisis konten video. Tugasmu adalah memberikan ringkasan yang akurat, padat, dan mudah dipahami dari transkrip video YouTube yang diberikan. Langsung berikan hasil ringkasannya tanpa basa-basi!

# FORMAT OUTPUT (WAJIB)
1. **Ringkasan Singkat**: 1-2 kalimat tentang inti video.
2. **Poin-Poin Penting**: Daftar 3-5 poin utama yang dibahas. 
   - WAJIB sertakan timestamp [MM:SS] di setiap awal poin agar user bisa navigasi.
   - Contoh: "[02:43] Mior menjelaskan cara ganti gigi di ETS2."
3. **Kesimpulan**: Penutup dan kesimpulan dari seluruh video.
4. Gunakan bahasa indonesia, jangan gunakan bahasa inggris atau bahasa lainnya

# ATURAN MAIN
- Gunakan bahasa yang santai tapi informatif (seperti peer/teman).
- Jika ada istilah teknis jelaskan secara singkat.
- Fokus HANYA pada isi transkrip. Jangan berikan informasi di luar teks yang diberikan.
- Gunakan bahasa indonesia, jangan gunakan bahasa inggris atau bahasa lainnya

# VIDEO META DATA
judul: ${data.judul},
author: ${data.author}

# TRANSCRIPT
${transcript}
`
      console.log('--- PROMPT YOUTUBE SHORT ---');
      console.log(prompts);
      
      const response = await fetchAI([{ role: 'user', content: prompts }], signal, true)
      return response.content
    }

    // --- SISTEM CHUNKING UNTUK VIDEO PANJANG ---
    const chunks = []
    let currentChunk = ''
    const lines = transcript.split('\\n')
    
    for (let line of lines) {
      // Jika ada satu baris yang sangat panjang melebihi batas (misal tidak ada newline)
      while (line.length > MAX_CHARS) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk)
          currentChunk = ''
        }
        chunks.push(line.substring(0, MAX_CHARS))
        line = line.substring(MAX_CHARS)
      }

      if (currentChunk.length + line.length > MAX_CHARS) {
        if (currentChunk.length > 0) chunks.push(currentChunk)
        currentChunk = line + '\\n'
      } else {
        currentChunk += line + '\\n'
      }
    }
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk)
    }

    let finalSummary = ''
    // Mulai proses tiap chunk
    for (let i = 0; i < chunks.length; i++) {
      if (signal?.aborted) throw new Error('AbortError')

      const chunkPrompt = `
# ROLE
Kamu adalah Mark, asisten AI yang ahli menganalisis konten video. Ini adalah instruksi langsung, BUKAN percakapan. DILARANG meminta input tambahan. LANGSUNG berikan ringkasan dari teks transkrip di bawah ini!

Ini adalah BAGIAN ${i + 1} DARI ${chunks.length} dari transkrip video YouTube yang panjang.

# FORMAT OUTPUT (WAJIB)
Berikan ringkasan padat berupa poin-poin penting yang dibahas KHUSUS pada BAGIAN INI SAJA.
- WAJIB sertakan timestamp [MM:SS] di setiap awal poin.
- Gunakan bahasa indonesia yang santai tapi informatif.

# VIDEO META DATA
judul: ${data.judul || 'Tidak diketahui'},
author: ${data.author || 'Tidak diketahui'}

# TRANSCRIPT BAGIAN ${i + 1}
${chunks[i]}
`
      console.log(`--- PROMPT YOUTUBE CHUNK ${i + 1}/${chunks.length} ---`);
      console.log(chunkPrompt);

      const response = await fetchAI([{ role: 'user', content: chunkPrompt }], signal, true)
      finalSummary += `\\n\\n### Bagian ${i + 1}\\n${response.content}`

      // Cooldown 25 detik jika bukan chunk terakhir (Menghindari TPM limit Groq)
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 25000))
      }
    }

    return finalSummary.trim()
  } catch (error) {
    console.error('Error in youtubeSummary:', error)
    throw error
  }
}


export const getBestMusicMatch = async (userInput, musicList, signal) => {
  try {
    const systemPrompt = `
Kamu adalah asisten kurator musik. Tugasmu adalah memilih SATU lagu yang paling sesuai dengan niat pengguna dari daftar hasil pencarian YouTube Music.
Gunakan logikamu:
- Jika user meminta lagu secara spesifik (misal versi cover, live, atau karaoke), carilah judul yang mengandung unsur tersebut.
- Jika user menyebutkan nama artis, prioritaskan artis tersebut.
- Jika user hanya menyebutkan judul secara umum, pilih versi original atau official track yang paling populer/masuk akal (hindari live/cover/karaoke jika tidak diminta).

# OUTPUT RULES
Output HANYA boleh berupa valid JSON berisi ID lagu terpilih:
\`\`\`json
{ "selectedId": "id_lagu_pilihan" }
\`\`\`
`
    const userPrompt = `
Instruksi User: "${userInput}"

Daftar Hasil Pencarian:
${JSON.stringify(
  musicList.map((m) => ({ id: m.id, title: m.title, artist: m.artist, duration: m.duration })),
  null,
  2
)}
`
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    const schema = {
      type: 'object',
      properties: {
        selectedId: { type: 'string' }
      },
      required: ['selectedId'],
      additionalProperties: false
    }

    const response = await fetchAI(messages, signal, true, schema)
    const data = cleanAndParse(response.content)
    return data
  } catch (error) {
    console.error('Error in getBestMusicMatch:', error)
    return { selectedId: musicList[0]?.id }
  }
}

