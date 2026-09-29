// Codemod W4 (TEMPORARY — dihapus sebelum commit W4):
// Perbaiki akses `.message`/`.stack` pada catch-var `unknown` (strict):
//   e.message  -> (e instanceof Error ? e.message : String(e))
//   e?.message -> (e instanceof Error ? e.message : String(e))
// Hanya menyentuh identifier catch umum (e, err, error, ex) agar aman.
import { readFileSync, writeFileSync } from 'node:fs'

const files = process.argv.slice(2)
const VAR = '(?:e|err|error|ex)'
const results = []

for (const file of files) {
  let text = readFileSync(file, 'utf8')
  const orig = text

  text = text.replace(
    new RegExp(`\\b${VAR}\\?\\.message\\b`, 'g'),
    '(e instanceof Error ? e.message : String(e))'
  )
  text = text.replace(
    new RegExp(`\\b${VAR}\\.message\\b`, 'g'),
    '(e instanceof Error ? e.message : String(e))'
  )
  // rapikan double-wrap hasil pola bertingkat: ((e instanceof ... : String(e)))
  text = text.replace(/\(\((e instanceof Error \? e\.message : String\(e\))\)\)/g, '($1)')

  if (text !== orig) {
    writeFileSync(file, text)
    results.push(file)
  }
}
console.log(`codemod-catch: ${results.length} file diubah`)
for (const r of results) console.log('  ' + r)
