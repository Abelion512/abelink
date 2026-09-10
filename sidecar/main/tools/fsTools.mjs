// Tool file/workspace (dipindah murni dari main/node-tools.js).
import fs from 'fs'
import path from 'path'
import os from 'os'
import { validateFileSyntax } from '../syntax-validator.js'
import { assertContained } from '../utils/fsGuard.js'
import { getWorkspaceDir, parsePagination, rtkFilter } from './_shared.mjs'

export const fsTools = {
  'read-skill': {
    needsApproval: false,
    handler: async (query) => {
      const skillName = (query || '').trim()
      if (!skillName) return { success: false, error: 'Nama skill kosong' }
      const skillDir = getSkillsDir()

      // 1. Cek jika folder skill berisi SKILL.md
      const folderSkillPath = path.join(skillDir, skillName, 'SKILL.md')
      if (fs.existsSync(folderSkillPath)) {
        const content = await fs.promises.readFile(folderSkillPath, 'utf8')
        return { success: true, content, data: content }
      }

      // 2. Cek jika file standalone .md
      const fileSkillPath = path.join(skillDir, `${skillName}.md`)
      if (fs.existsSync(fileSkillPath)) {
        const content = await fs.promises.readFile(fileSkillPath, 'utf8')
        return { success: true, content, data: content }
      }

      // 3. Cek direct file path jika query mengandung sub-path
      const directPath = path.join(skillDir, skillName)
      if (fs.existsSync(directPath) && !fs.statSync(directPath).isDirectory()) {
        const content = await fs.promises.readFile(directPath, 'utf8')
        return { success: true, content, data: content }
      }

      return {
        success: false,
        error: `Skill '${skillName}' tidak ditemukan di folder 'Documents/Mark Skills'.`
      }
    }
  },
  'read-file': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        const filePath = parts[0].trim()
        if (!fs.existsSync(filePath))
          return { success: false, message: 'File tidak ditemukan di path tersebut.' }

        const ext = path.extname(filePath).toLowerCase()
        const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']
        if (IMAGE_EXTENSIONS.includes(ext)) {
          const fileBuffer = fs.readFileSync(filePath)
          const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
          const b64 = fileBuffer.toString('base64')
          return {
            success: true,
            isImage: true,
            message: `File '${path.basename(filePath)}' adalah gambar visual (${ext}). Konten visual telah dikonversi dan dikirim ke mesin AI Vision.`,
            dataUrl: `data:${mimeType};base64,${b64}`
          }
        }

        const content = fs.readFileSync(filePath, 'utf8')
        const lines = content.split('\n')
        const totalLines = lines.length

        if (parts.length >= 3) {
          const startLine = parseInt(parts[1].trim(), 10)
          const endLine = parseInt(parts[2].trim(), 10)

          if (!isNaN(startLine) && !isNaN(endLine)) {
            const sliceLines = lines.slice(
              Math.max(0, startLine - 1),
              Math.min(totalLines, endLine)
            )
            const sliceContent = sliceLines.map((l, i) => `[${startLine + i}] ${l}`).join('\n')
            return {
              success: true,
              totalLines,
              showing: `Baris ${startLine} - ${endLine}`,
              content: sliceContent
            }
          }
        }

        // Default potong 400 baris awal
        const defaultLines = lines.slice(0, 400)
        const defaultContent = defaultLines.map((l, i) => `[${i + 1}] ${l}`).join('\n')
        return {
          success: true,
          totalLines,
          content: defaultContent,
          note:
            totalLines > 400
              ? 'File panjang. Hanya menampilkan 400 baris awal. Gunakan read-file dengan argumen startLine||endLine untuk melihat sisa baris.'
              : ''
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'file-outline': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        let filePath = query.trim()
        const activeRoot = config?.workspaceRoot || getWorkspaceDir()
        if (!path.isAbsolute(filePath)) {
          filePath = path.join(activeRoot, filePath)
        }
        if (!fs.existsSync(filePath))
          return { success: false, message: `File tidak ditemukan di path: ${filePath}` }

        const content = fs.readFileSync(filePath, 'utf8')
        const lines = content.split('\n')
        const totalLines = lines.length

        // Regex for structural elements across JS, TS, Python, Go, HTML, Markdown, etc.
        const structuralRegex =
          /^(?:\s*)(?:export\s+|async\s+|function\s+|class\s+|const\s+\w+\s*=\s*(?:async\s*)?\(|let\s+\w+\s*=\s*(?:async\s*)?\(|var\s+\w+\s*=\s*(?:async\s*)?\(|def\s+|type\s+|interface\s+|struct\s+|#+\s+|ipcMain\.|window\.api\.|return\s+\()/i

        const outlineItems = []
        lines.forEach((line, index) => {
          if (structuralRegex.test(line)) {
            const trimmed = line.trim()
            if (trimmed.length > 0) {
              outlineItems.push(`[Baris ${index + 1}] ${trimmed.slice(0, 120)}`)
            }
          }
        })

        if (outlineItems.length === 0) {
          const step = Math.max(1, Math.floor(totalLines / 20))
          for (let i = 0; i < totalLines; i += step) {
            const trimmed = lines[i].trim()
            if (trimmed) {
              outlineItems.push(`[Baris ${i + 1}] ${trimmed.slice(0, 100)}`)
            }
          }
        }

        return {
          success: true,
          totalLines,
          outlineCount: outlineItems.length,
          outline: outlineItems.join('\n')
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'read-document': {
    needsApproval: false,
    handler: async (query) => {
      try {
        const parts = query.split('||')
        const filePath = parts[0].trim()
        const param2 = parts[1] ? parts[1].trim() : ''
        const param3 = parts[2] ? parts[2].trim() : ''

        if (!fs.existsSync(filePath))
          return { success: false, message: 'File tidak ditemukan di path tersebut.' }

        const ext = path.extname(filePath).toLowerCase()
        let rawText = ''

        if (ext === '.pdf') {
          const buffer = fs.readFileSync(filePath)
          try {
            const pdfParseNs = await import('pdf-parse')
            const pdfParseModule = pdfParseNs.default ?? pdfParseNs
            if (typeof pdfParseModule === 'function') {
              const res = await pdfParseModule(buffer)
              rawText = res.text
            } else if (pdfParseModule.PDFParse) {
              const parser = new pdfParseModule.PDFParse({ data: buffer })
              const res = await parser.getText()
              rawText = res.text
            }
          } catch (pdfErr) {
            return { success: false, error: `Gagal membaca PDF: ${pdfErr.message}` }
          }
        } else if (ext === '.docx') {
          const buffer = fs.readFileSync(filePath)
          try {
            const mammothNs = await import('mammoth')
            const mammoth = mammothNs.default ?? mammothNs
            const result = await mammoth.extractRawText({ buffer })
            rawText = result.value
          } catch (docxErr) {
            return { success: false, error: `Gagal membaca DOCX: ${docxErr.message}` }
          }
        } else {
          rawText = fs.readFileSync(filePath, 'utf8')
        }

        let cleanText = rawText.replace(/\r\n/g, '\n').trim()
        // Format single giant lines (e.g. PDF text without newlines) to prevent V8 freezes
        cleanText = cleanText.replace(/([^\n]{150,250})\s+/g, '$1\n')
        const totalChars = cleanText.length

        if (totalChars === 0) {
          return { success: true, totalChars: 0, content: 'Dokumen kosong.' }
        }

        const allLines = cleanText.split('\n')
        const totalLines = allLines.length

        // MODE 1: Line Slicing (path||startLine||endLine)
        if (param2 && !isNaN(param2) && param3 && !isNaN(param3)) {
          const startLine = Math.max(1, parseInt(param2, 10))
          const endLine = Math.min(totalLines, parseInt(param3, 10))
          const sliced = allLines
            .slice(startLine - 1, endLine)
            .map((l, idx) => `${startLine + idx}: ${l}`)
            .join('\n')

          return {
            success: true,
            filePath,
            totalLines,
            startLine,
            endLine,
            content: `[RENTANG BARIS ${startLine} s/d ${endLine} DARI TOTAL ${totalLines} BARIS]:\n${sliced}`
          }
        }

        // MODE 2: Keyword / Semantic Search (path||searchQuery)
        const searchQuery = param2
        if (searchQuery) {
          let resultsHeader = `[PENCARIAN PADA DOKUMEN: "${searchQuery}"]\n`
          let matchedSections = []

          // 2a. Direct Line / Keyword Matching
          const searchLower = searchQuery.toLowerCase()
          for (let i = 0; i < allLines.length; i++) {
            if (allLines[i].toLowerCase().includes(searchLower)) {
              const ctxStart = Math.max(0, i - 2)
              const ctxEnd = Math.min(allLines.length, i + 8)
              const snippet = allLines
                .slice(ctxStart, ctxEnd)
                .map((l, idx) => `${ctxStart + idx + 1}: ${l}`)
                .join('\n')
              matchedSections.push(`[COCOK PERSIS PADA BARIS ${i + 1}]:\n${snippet}`)
              if (matchedSections.length >= 4) break
            }
          }

          // 2b. Orama Semantic Vector Search
          // Orama search berjalan di Renderer process, tidak bisa diakses dari Main
          let oramaText = ''
          try {
            oramaText = ''
          } catch (oramaErr) {
            // Silently skip
          }

          let combinedContent = ''
          if (matchedSections.length > 0) {
            combinedContent += `--- HASIL PENCOCOKAN KATAKUNCI PERSIS ---\n${matchedSections.join('\n\n')}\n\n`
          }
          if (oramaText) {
            combinedContent += `--- HASIL VEKTOR SEMANTIK ORAMA ---\n${oramaText}`
          }

          if (combinedContent) {
            return {
              success: true,
              filePath,
              totalLines,
              totalChars,
              searchQuery,
              content: resultsHeader + combinedContent
            }
          } else {
            return {
              success: true,
              filePath,
              totalLines,
              totalChars,
              searchQuery,
              content: `Tidak ditemukan baris atau paragraf yang cocok dengan kata kunci "${searchQuery}".`
            }
          }
        }

        // MODE 3: Default Full / Smart Overview Read (tanpa query - Hybrid Structural + Strided)
        if (totalLines > 80) {
          // 3a. First 40 lines (Judul, Header, Intro)
          const firstBlock = allLines
            .slice(0, 40)
            .map((l, idx) => `${idx + 1}: ${l}`)
            .join('\n')

          // 3b. Universal Structural Heading Detection across middle body (Lines 41 to totalLines - 30)
          const middleStart = 40
          const middleEnd = Math.max(middleStart + 1, totalLines - 30)

          const structuralHeadings = []
          for (let i = middleStart; i < middleEnd; i++) {
            const line = allLines[i].trim()
            if (!line) continue

            // Universal structural patterns (Language-agnostic):
            // 1. Markdown/HTML headings: #, ##, ###, <h1>, <h2>
            // 2. Numbered sections in any language: 1., 1.1, 2.1.3, I., II., A., B.
            // 3. Short standalone lines (< 65 chars) in ALL CAPS or ending with a colon ':'
            const isMdHeading = /^#{1,6}\s+/.test(line) || /^<h[1-6]>/i.test(line)
            const isNumberedSection = /^([0-9]+\.[0-9.]*|[A-Z]\.|[IVXLCDM]+\.)\s+[A-Z0-9]/i.test(
              line
            )
            const isTitleStyle =
              line.length > 3 &&
              line.length < 65 &&
              ((line === line.toUpperCase() && /[A-Z]/.test(line)) || line.endsWith(':'))

            if (isMdHeading || isNumberedSection || isTitleStyle) {
              const snippetEnd = Math.min(totalLines, i + 3)
              const snippetText = allLines
                .slice(i, snippetEnd)
                .map((l, idx) => `${i + idx + 1}: ${l}`)
                .join('\n')
              structuralHeadings.push(`[HEADING BARIS ${i + 1}]:\n${snippetText}`)
              if (structuralHeadings.length >= 12) break
            }
          }

          // 3c. Fallback / Complementary Uniform Strided Sampling if structural headings are few (< 4)
          const sampledBody = []
          if (structuralHeadings.length < 4) {
            const middleTotal = middleEnd - middleStart
            const numSamples = 8
            const stepSize = Math.max(1, Math.floor(middleTotal / numSamples))

            for (let i = 0; i < numSamples; i++) {
              const targetLineIdx = middleStart + Math.min(i * stepSize, middleTotal - 1)
              const snippetStart = targetLineIdx
              const snippetEnd = Math.min(totalLines, snippetStart + 3)
              const snippetText = allLines
                .slice(snippetStart, snippetEnd)
                .map((l, idx) => `${snippetStart + idx + 1}: ${l}`)
                .join('\n')
              sampledBody.push(`[CUPLIKAN INTERVAL BARIS ${snippetStart + 1}]:\n${snippetText}`)
            }
          }

          // 3d. Last 30 lines (Kesimpulan / Penutup)
          const lastStart = Math.max(40, totalLines - 30)
          const lastBlock = allLines
            .slice(lastStart)
            .map((l, idx) => `${lastStart + idx + 1}: ${l}`)
            .join('\n')

          let summaryContent = `[RINGKASAN STRUKTUR DOKUMEN: Total ${totalLines} baris / ${totalChars} karakter]\n\n`
          summaryContent += `--- BAGIAN AWAL (BARIS 1 - 40) ---\n${firstBlock}\n\n`

          if (structuralHeadings.length > 0) {
            summaryContent += `--- STRUKTUR BAB & HEADINGS UTAMA DOKUMEN ---\n${structuralHeadings.join('\n\n')}\n\n`
          }
          if (sampledBody.length > 0) {
            summaryContent += `--- CUPLIKAN INTERVAL DARI SELURUH ISI DOKUMEN ---\n${sampledBody.join('\n\n')}\n\n`
          }

          summaryContent += `--- BAGIAN AKHIR / KESIMPULAN (BARIS ${lastStart + 1} - ${totalLines}) ---\n${lastBlock}\n\n`
          summaryContent += `[PERINTAH KELENGKAPAN SELESAI]: INFORMASI DI ATAS SUDAH MENCAKUP AWAL, TENGAH, dan AKHIR DOKUMEN! JANGAN MEMBACA ULANG POTONGAN BARIS! BILA TUGASMU MEMBUAT FILE (.md/.txt), LANGSUNG PANGGIL 'write-file' SEKARANG JUGA!`

          return {
            success: true,
            filePath,
            totalLines,
            totalChars,
            content: summaryContent
          }
        }

        return {
          success: true,
          filePath,
          totalLines,
          totalChars,
          content: allLines.map((l, idx) => `${idx + 1}: ${l}`).join('\n')
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'write-file': {
    needsApproval: true,
    approvalMessage: (query) => `Mark ingin menulis/membuat file:\n${query.split('||')[0].trim()}`,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        if (parts.length < 2)
          return {
            success: false,
            message: "Format salah. Gunakan separator '||' (contoh: D:\\file.txt||Halo)"
          }

        const content = parts.slice(1).join('||')

        // Pagar crawler: jangan tulis skrip scraper web (pola kabur observasi
        // nyata: tulis fetch_webinar.py lalu eksekusi via shell). Arahkan ke
        // browser-navigate/browser-extract.
        const { looksLikeCrawlerSource } = await import('./browser/bridge-core.mjs')
        if (looksLikeCrawlerSource(content)) {
          return {
            success: false,
            message:
              'Ditolak: jangan buat skrip scraper web. ' +
              'Gunakan browser-navigate (URL bersih) atau browser-extract (selector CSS).'
          }
        }

        const activeRoot = config?.workspaceRoot || getWorkspaceDir()
        const guarded = assertContained(activeRoot, parts[0]?.trim())
        if (!guarded.ok) {
          return { success: false, message: 'Akses ditolak: path di luar workspace.' }
        }
        const filePath = guarded.path

        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

        await fs.promises.writeFile(filePath, content, 'utf8')

        // Validasi sintaks otomatis (Self-Healing Hook)
        const syntaxCheck = await validateFileSyntax(filePath, content)
        if (!syntaxCheck.valid) {
          return {
            success: true,
            warning: 'FILE_CREATED_WITH_SYNTAX_ERROR',
            message: `File berhasil disimpan ke ${filePath}, TETAPI terdeteksi SYNTAX ERROR:\n${syntaxCheck.error}\nKamu WAJIB segera memperbaiki error ini sekarang!`,
            syntaxError: syntaxCheck.error
          }
        }

        return { success: true, message: `Berhasil menyimpan file ke ${filePath} tanpa error sintaks.` }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'replace-content': {
    needsApproval: true,
    approvalMessage: (query) => {
      const parts = query.split('||')
      return `Mark ingin mengedit isi kode pada berkas:\n${parts[0]?.trim()}`
    },
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        if (parts.length < 3) {
          return {
            success: false,
            message: 'Format salah. Gunakan: filePath||targetContent||replacementContent'
          }
        }

        let filePath = parts[0].trim()
        const targetContent = parts[1]
        const replacementContent = parts.slice(2).join('||')

        const activeRoot = config?.workspaceRoot || getWorkspaceDir()
        if (!path.isAbsolute(filePath)) {
          filePath = path.join(activeRoot, filePath)
        }

        if (!fs.existsSync(filePath)) {
          return { success: false, message: `File tidak ditemukan di path: ${filePath}` }
        }

        let fileContent = await fs.promises.readFile(filePath, 'utf8')

        const occurrences = fileContent.split(targetContent).length - 1
        if (occurrences === 0) {
          return {
            success: false,
            message: `targetContent tidak ditemukan di dalam berkas. Pastikan karakter/spasi sama persis. Disarankan memanggil 'read-file' terlebih dahulu.`
          }
        }

        if (occurrences > 1) {
          return {
            success: false,
            message: `targetContent ditemukan sebanyak ${occurrences} kali (tidak unik). Sertakan beberapa baris kode sebelum/sesudahnya agar targetContent menjadi unik.`
          }
        }

        const updatedContent = fileContent.replace(targetContent, replacementContent)
        await fs.promises.writeFile(filePath, updatedContent, 'utf8')

        // Validasi sintaks otomatis (Self-Healing Hook)
        const syntaxCheck = await validateFileSyntax(filePath, updatedContent)
        if (!syntaxCheck.valid) {
          return {
            success: true,
            warning: 'FILE_UPDATED_WITH_SYNTAX_ERROR',
            message: `File berhasil diubah, TETAPI terdeteksi SYNTAX ERROR:\n${syntaxCheck.error}\nKamu WAJIB segera memperbaiki error ini sekarang!`,
            syntaxError: syntaxCheck.error
          }
        }

        return {
          success: true,
          message: `Berhasil mengganti konten pada ${path.basename(filePath)} tanpa error sintaks.`
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'replace-lines': {
    needsApproval: true,
    approvalMessage: (query) => {
      const parts = query.split('||')
      return `Mark ingin mengganti baris ${parts[1]} hingga ${parts[2]} di file:\n${parts[0].trim()}`
    },
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        if (parts.length < 4)
          return {
            success: false,
            message: 'Format salah. Gunakan: path||startLine||endLine||kode_baru'
          }

        const activeRoot = config?.workspaceRoot || getWorkspaceDir()
        const guarded = assertContained(activeRoot, parts[0]?.trim())
        if (!guarded.ok) {
          return { success: false, message: 'Akses ditolak: path di luar workspace.' }
        }
        const filePath = guarded.path

        const startLine = parseInt(parts[1].trim(), 10)
        const endLine = parseInt(parts[2].trim(), 10)
        const newContent = parts.slice(3).join('||')

        if (!fs.existsSync(filePath))
          return { success: false, message: `File tidak ditemukan di path: ${filePath}` }

        const content = fs.readFileSync(filePath, 'utf8')
        const lines = content.split('\n')

        if (startLine < 1 || startLine > lines.length || endLine < startLine) {
          return { success: false, message: 'Range baris tidak valid' }
        }

        lines.splice(startLine - 1, endLine - startLine + 1, newContent)

        fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
        return {
          success: true,
          message: `Berhasil mengganti baris ${startLine}-${endLine} di ${filePath}`
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'delete-file': {
    needsApproval: true,
    approvalMessage: (query) => `Mark ingin MENGHAPUS file secara permanen:\n${query}`,
    handler: async (query, config) => {
      try {
        const activeRoot = config?.workspaceRoot || getWorkspaceDir()
        const guarded = assertContained(activeRoot, query.trim())
        if (!guarded.ok) {
          return { success: false, message: 'Akses ditolak: path di luar workspace.' }
        }
        const filePath = guarded.path
        if (!fs.existsSync(filePath))
          return { success: false, message: `File tidak ditemukan di path: ${filePath}` }
        fs.unlinkSync(filePath)
        return { success: true, message: `Berhasil menghapus file ${filePath}` }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'list-dir': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const activeRoot = config?.workspaceRoot || getWorkspaceDir()
        const rawTarget = query?.trim() || ''
        // Query kosong berarti root workspace itu sendiri.
        let targetDir = activeRoot
        if (rawTarget) {
          const guarded = assertContained(activeRoot, rawTarget)
          if (!guarded.ok) {
            return { success: false, message: 'Akses ditolak: path di luar workspace.' }
          }
          targetDir = guarded.path
        }
        if (!fs.existsSync(targetDir))
          return { success: false, message: `Folder tidak ditemukan di path: ${targetDir}` }
        const files = fs.readdirSync(targetDir)
        return { success: true, total_files: files.length, contents: files.join('\n') }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'find-files': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const parts = query ? query.split('||') : []
        const pattern = parts[0]?.trim() || '*'
        const subDir = parts[1]?.trim() || ''

        const activeRoot = config?.workspaceRoot || getWorkspaceDir()
        const targetDir = path.isAbsolute(subDir) ? subDir : (subDir ? path.join(activeRoot, subDir) : activeRoot)

        if (!fs.existsSync(targetDir)) {
          return { success: false, message: `Direktori tidak ditemukan: ${targetDir}` }
        }

        const IGNORED_DIRS = new Set([
          'node_modules',
          '.git',
          'dist',
          'build',
          '.next',
          '.output',
          'out',
          '.vscode',
          '.idea',
          'coverage',
          'target',
          'vendor'
        ])

        const matchedFiles = []
        const MAX_MATCHES = 80

        function scan(dir, relativePrefix = '') {
          if (matchedFiles.length >= MAX_MATCHES) return

          let entries = []
          try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
          } catch (readErr) {
            return
          }

          for (const entry of entries) {
            if (matchedFiles.length >= MAX_MATCHES) break

            const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name

            if (entry.isDirectory()) {
              if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
                scan(path.join(dir, entry.name), relPath)
              }
            } else {
              const cleanPattern = pattern.toLowerCase().replace(/\*/g, '')
              if (pattern === '*' || relPath.toLowerCase().includes(cleanPattern)) {
                matchedFiles.push(relPath)
              }
            }
          }
        }

        scan(targetDir)

        return {
          success: true,
          total: matchedFiles.length,
          files: matchedFiles,
          result: await rtkFilter(
            matchedFiles.length > 0
              ? `Ditemukan ${matchedFiles.length} berkas di '${path.basename(targetDir)}':\n${matchedFiles.map((f) => `- ${f}`).join('\n')}`
              : `Tidak ditemukan berkas yang cocok dengan pola "${pattern}" di folder tersebut.`,
            'find',
            config
          )
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  },
  'grep-search': {
    needsApproval: false,
    handler: async (query, config) => {
      try {
        const parts = query.split('||')
        if (parts.length < 2)
          return {
            success: false,
            message: "Format salah. Gunakan separator '||' (contoh: D:\\Project||nama_fungsi atau .||nama_fungsi)"
          }

        const rawDirArg = parts[0].trim()
        const keyword = parts[1].trim()

        if (!keyword) {
          return { success: false, message: 'Kata kunci pencarian tidak boleh kosong.' }
        }

        const activeRoot = config?.workspaceRoot || getWorkspaceDir()
        // '.' atau argumen kosong berarti root workspace itu sendiri.
        let dirPath = activeRoot
        if (rawDirArg && rawDirArg !== '.') {
          const guarded = assertContained(activeRoot, rawDirArg)
          if (!guarded.ok) {
            return { success: false, message: 'Akses ditolak: path di luar workspace.' }
          }
          dirPath = guarded.path
        }

        if (!fs.existsSync(dirPath)) {
          return { success: false, message: `Direktori tidak ditemukan: ${dirPath}` }
        }

        const IGNORED_GREP_DIRS = new Set([
          'node_modules',
          '.git',
          'dist',
          'build',
          '.next',
          '.cache',
          '.nuxt',
          'coverage',
          '.cache',
          'out',
          '.idea',
          '.vscode',
          'target',
          'bin',
          'obj'
        ])

        const TEXT_EXTENSIONS = new Set([
          '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
          '.json', '.html', '.htm', '.css', '.scss', '.less',
          '.py', '.md', '.markdown', '.txt', '.rs', '.go',
          '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.sh',
          '.ps1', '.bat', '.cmd', '.yml', '.yaml', '.xml',
          '.env', '.sql', '.toml', '.ini', '.cfg', '.vue', '.svelte'
        ])

        const matches = []
        const lowerKeyword = keyword.toLowerCase()

        async function walk(dir) {
          if (matches.length >= 50) return

          let entries
          try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true })
          } catch (_) {
            return
          }

          for (const entry of entries) {
            if (matches.length >= 50) break

            const fullPath = path.join(dir, entry.name)

            if (entry.isDirectory()) {
              if (!IGNORED_GREP_DIRS.has(entry.name.toLowerCase())) {
                await walk(fullPath)
              }
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase()
              if (TEXT_EXTENSIONS.has(ext) || !ext || entry.name.startsWith('.')) {
                try {
                  const stat = await fs.promises.stat(fullPath)
                  if (stat.size > 2 * 1024 * 1024) continue

                  const content = await fs.promises.readFile(fullPath, 'utf8')
                  if (content.toLowerCase().includes(lowerKeyword)) {
                    const lines = content.split('\n')
                    for (let i = 0; i < lines.length; i++) {
                      if (lines[i].toLowerCase().includes(lowerKeyword)) {
                        const relPath = path.relative(dirPath, fullPath)
                        matches.push(`${relPath}:${i + 1}: ${lines[i].trim()}`)
                        if (matches.length >= 50) break
                      }
                    }
                  }
                } catch (_) {}
              }
            }
          }
        }

        await walk(dirPath)

        if (matches.length === 0) {
          return { success: true, result: 'Pencarian tidak menemukan hasil apapun.' }
        }

        return {
          success: true,
          result: await rtkFilter(matches.join('\n'), 'grep', config),
          total_matches: matches.length
        }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }
  }
};
