// MarkBench smoke test — dipakai CI (Tauri CI + Release).
// Tanpa network, tanpa LLM: hanya memverifikasi registry task, verifier
// deterministik (PASS dan FAIL case), dan parser tool-call quote-aware.
// Runner penuh (bun run benchmark:echo) baru menyentuh LLM saat dijalankan lokal.

import assert from 'node:assert/strict'
import { TASKS, listTasks } from './terminal-bench.mjs'
import { parseToolCalls } from './mark-adapter.mjs'

// 1. Task registry terbaca
const tasks = listTasks()
assert.ok(tasks.length >= 1, 'minimal satu task terdaftar')
assert.ok(TASKS['tb-echo-01'], 'task tb-echo-01 harus terdaftar')
console.log(`[ok] registry: ${tasks.length} task`)

// 2. Verifier deterministik — PASS case
const echoTask = TASKS['tb-echo-01']
assert.equal(echoTask.verifier('MarkBench is active'), true, 'verifier harus PASS untuk output persis')
assert.equal(echoTask.verifier('  MarkBench is active\n'), true, 'verifier harus toleran terhadap whitespace')
console.log('[ok] verifier PASS case')

// 3. Verifier deterministik — FAIL case
assert.equal(echoTask.verifier('MarkBench is active!'), false, 'verifier harus FAIL untuk output beda')
assert.equal(echoTask.verifier('Tentu, MarkBench is active'), false, 'verifier harus FAIL untuk output dibungkus teks lain')
assert.equal(echoTask.verifier(''), false, 'verifier harus FAIL untuk output kosong')
console.log('[ok] verifier FAIL case')

// 4. Parser tool-call quote-aware
const parsed = parseToolCalls(
  'x [tool: write-file(path="a,b.txt", content="hello, world", overwrite=true)] y [tool: read-file(path=\'c.txt\')]'
)
assert.equal(parsed.length, 2, 'dua tool call harus ter-parse')
assert.deepEqual(parsed[0].arguments, { path: 'a,b.txt', content: 'hello, world', overwrite: true })
assert.deepEqual(parsed[1].arguments, { path: 'c.txt' })
console.log('[ok] parser tool-call quote-aware')

console.log('MarkBench smoke: LOLOS')
