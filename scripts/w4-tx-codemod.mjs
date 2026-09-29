// Codemod W4 v2 (TEMPORARY — dihapus sebelum commit W4):
// Standardisasi semua pemanggilan locale ke helper typed `t(bind, key, ...args)`
// yang di-export dari src/api/locale.ts (selalu return string).
//  1) `tx(bind, 'key')`          -> `t(bind, 'key')`
//     `tx(bind, 'key')(a, b)`    -> `t(bind, 'key', a, b)`
//  2) helper lokal `const t = (k) => tx(bind, k)` dihapus, dan semua
//     `t('key')` / `t('key')(a)` -> `t(bind, 'key', ...)`
//  3) helper v1 yang salah (hasil codemod percobaan) juga dibersihkan.
//  4) import locale diselaraskan: `tx` -> `t` (dipertahankan bila masih dipakai).
import { readFileSync, writeFileSync } from 'node:fs'

const files = process.argv.slice(2)

// Baca argumen pemanggilan seimbang mulai dari karakter '(' di posisi start.
function readBalanced(text, start) {
  if (text[start] !== '(') return null
  let depth = 0
  let i = start
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      i++
      while (i < n) {
        if (text[i] === '\\') { i += 2; continue }
        if (quote === '`' && text[i] === '$' && text[i + 1] === '{') {
          let bd = 1
          i += 2
          while (i < n && bd > 0) {
            if (text[i] === '{') bd++
            else if (text[i] === '}') bd--
            else if (text[i] === '"' || text[i] === "'" || text[i] === '`') {
              const q2 = text[i]
              i++
              while (i < n) {
                if (text[i] === '\\') { i += 2; continue }
                if (text[i] === q2) break
                i++
              }
            }
            i++
          }
          continue
        }
        if (text[i] === quote) break
        i++
      }
      i++
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return { end: i, inner: text.slice(start + 1, i) }
    }
    i++
  }
  return null
}

function splitArgs(inner) {
  const parts = []
  let depth = 0
  let cur = ''
  let i = 0
  while (i < inner.length) {
    const ch = inner[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch
      cur += ch
      i++
      while (i < inner.length) {
        if (inner[i] === '\\') { cur += inner[i] + inner[i + 1]; i += 2; continue }
        cur += inner[i]
        if (inner[i] === q) { i++; break }
        i++
      }
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; i++; continue }
    cur += ch
    i++
  }
  if (cur.trim() !== '' || parts.length > 0) parts.push(cur)
  return parts.map((p) => p.trim())
}

// Kumpulkan posisi kemunculan regex (aman terhadap pergeseran offset).
function findAll(text, re) {
  const out = []
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m
  while ((m = r.exec(text)) !== null) {
    out.push({ index: m.index, match: m })
    if (m.index === r.lastIndex) r.lastIndex++
  }
  return out
}

const results = []
for (const file of files) {
  let text = readFileSync(file, 'utf8')
  const orig = text
  const binds = new Set()

  // (0) Bersihkan helper v1 yang salah dari codemod percobaan.
  text = text.replace(
    /\nconst t = \(k: string, \.\.\.args: unknown\[\]\): string => \{\s*\n\s*const v = tx\((\w+), k\)\s*\n\s*return typeof v === 'function' \? String\(v\(args\[0\], args\[1\]\)\) : v\s*\n\s*\}\n/g,
    (_full, bind) => {
      binds.add(bind)
      return '\n'
    }
  )

  // (1) Hapus helper lokal `const t = (k|key) => tx(bind, k|key)` + catat bind.
  text = text.replace(
    /[ \t]*const t = \((?:k|key)\) => tx\((\w+), (?:k|key)\)[ \t]*\n/g,
    (_full, bind) => {
      binds.add(bind)
      return ''
    }
  )

  // (2) tx(bind, 'key')(args?) -> t(bind, 'key', args?) — pass berulang utk nested.
  for (let pass = 0; pass < 6; pass++) {
    let changed = false
    const hits = findAll(text, /\btx\s*\(/g)
    for (const { index: at } of hits.reverse()) {
      const open = text.indexOf('(', at)
      const first = readBalanced(text, open)
      if (!first) continue
      const args = splitArgs(first.inner)
      if (args.length < 2) continue
      const bind = args[0]
      const key = args[1]
      if (!/^[A-Za-z_$][\w$.]*$/.test(bind)) continue
      if (!/^(?:'[^']*'|"[^"]*")$/.test(key)) continue
      let j = first.end + 1
      while (j < text.length && /\s/.test(text[j])) j++
      if (text[j] === '(') {
        const second = readBalanced(text, j)
        if (second) {
          const extra = splitArgs(second.inner).join(', ')
          text = text.slice(0, at) + `t(${bind}, ${key}${extra ? ', ' + extra : ''})` + text.slice(second.end + 1)
          changed = true
          binds.add(bind)
          continue
        }
      }
      text = text.slice(0, at) + `t(${bind}, ${key})` + text.slice(first.end + 1)
      changed = true
      binds.add(bind)
    }
    if (!changed) break
  }

  // (3) Pemanggilan lokal t('key')(args?) -> t(bind, 'key', args?) bila bind
  //     diketahui (dari helper yang dihapus). Aman: first-arg string literal
  //     hanya dipakai helper locale; pemakian lain (mis. (t) => t.stop())
  //     tidak pernah dipanggil dengan literal string.
  for (const bind of binds) {
    for (let pass = 0; pass < 6; pass++) {
      let changed = false
      const hits = findAll(text, /\bt\s*\(\s*['"]/g)
      for (const { index: at } of hits.reverse()) {
        const open = text.indexOf('(', at)
        const first = readBalanced(text, open)
        if (!first) continue
        const args = splitArgs(first.inner)
        if (args.length < 1 || !/^(?:'[^']*'|"[^"]*")$/.test(args[0])) continue
        let j = first.end + 1
        while (j < text.length && /\s/.test(text[j])) j++
        if (text[j] === '(') {
          const second = readBalanced(text, j)
          if (second) {
            const extra = splitArgs(second.inner).join(', ')
            text = text.slice(0, at) + `t(${bind}, ${args.join(', ')}${extra ? ', ' + extra : ''})` + text.slice(second.end + 1)
            changed = true
            continue
          }
        }
        text = text.slice(0, at) + `t(${bind}, ${args.join(', ')})` + text.slice(first.end + 1)
        changed = true
      }
      if (!changed) break
    }
  }

  // (4) Selaraskan import locale: tx -> t (tambah t, buang tx bila tak terpakai).
  text = text.replace(
    /import\s*\{([^}]*)\}\s*from\s*(['"][^'"]*locale['"];?)/g,
    (full, names, from) => {
      const list = names.split(',').map((s) => s.trim()).filter(Boolean)
      const kept = list.filter((s) => s !== 'tx')
      if (!kept.includes('t')) kept.unshift('t')
      const joined = `import { ${kept.join(', ')} } from ${from}`
      if (joined.length === full.length && joined === full) return full
      return joined
    }
  )

  if (text !== orig) {
    writeFileSync(file, text)
    results.push(`${file} (bind=${[...binds].join('|') || '-'})`)
  }
}

console.log(`codemod: ${results.length} file diubah`)
for (const r of results) console.log('  ' + r)
