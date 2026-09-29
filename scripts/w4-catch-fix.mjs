// Codemod W4 fix (TEMPORARY): selaraskan var pada guard
// `(e instanceof Error ? e.message : String(e))` dengan var catch terdekat,
// dan sederhanakan double-wrap hasil replacement bertingkat.
import { readFileSync, writeFileSync } from 'node:fs'

const files = process.argv.slice(2)
const GUARD = /\(e instanceof Error \? e\.message : String\(e\)\)/g
const CATCH_RE = /catch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g
const results = []

for (const file of files) {
  let text = readFileSync(file, 'utf8')
  const orig = text

  // 1) Sederhanakan double-wrap dulu (muncul saat pola (X.message || err) diganti).
  text = text.replace(
    /\(e instanceof Error \? \(e instanceof Error \? e\.message : String\(e\)\) : String\(e\)\)/g,
    '(e instanceof Error ? e.message : String(e))'
  )

  // 2) Selaraskan var guard ke catch var terdekat sebelum posisi guard.
  const m = [...text.matchAll(GUARD)]
  for (const hit of m.reverse()) {
    const before = text.slice(0, hit.index)
    let lastCatch = null
    let cm
    CATCH_RE.lastIndex = 0
    while ((cm = CATCH_RE.exec(before)) !== null) lastCatch = cm[1]
    if (!lastCatch || lastCatch === 'e') continue
    const fixed = `(e instanceof Error ? e.message : String(e))`
      .replaceAll('(e instanceof Error', `(${lastCatch} instanceof Error`)
      .replaceAll('e.message', `${lastCatch}.message`)
      .replaceAll('String(e)', `String(${lastCatch})`)
    text = text.slice(0, hit.index) + fixed + text.slice(hit.index + hit[0].length)
  }

  if (text !== orig) {
    writeFileSync(file, text)
    results.push(file)
  }
}
console.log(`codemod-catch-fix: ${results.length} file diubah`)
for (const r of results) console.log('  ' + r)
