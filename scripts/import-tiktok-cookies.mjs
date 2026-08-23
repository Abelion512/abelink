// Import TikTok session cookies (Netscape format, dari "Get cookies.txt LOCALLY")
// Jalankan: npx electron scripts/import-tiktok-cookies.mjs <path-cookies.txt>
import { app, session } from 'electron'
import { readFileSync } from 'node:fs'

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  // Electron: argv = [electron, --no-sandbox, script.mjs, cookie.txt] → cookie di index 3
  const file = process.argv.find((a) => a.endsWith('.txt'))
  if (!file) {
    console.error('Usage: npx electron scripts/import-tiktok-cookies.mjs <cookies.txt>')
    app.exit(1)
  }
  const lines = readFileSync(file, 'utf8').split('\n')
  const s = session.fromPartition('persist:mark-browser')
  let ok = 0
  for (const line of lines) {
    if (!line || line.startsWith('#') || !line.trim()) continue
    const [domain, , path, secure, exp, name, ...rest] = line.split('\t')
    const value = rest.join('\t')
    if (!domain || !name) continue
    const url = (secure === 'TRUE' ? 'https://' : 'http://') + domain + path
    console.log(`Setting: ${name} @ ${url}`)
    try {
      const result = await s.cookies.set({
        url,
        name,
        value,
        domain,
        path,
        secure: secure === 'TRUE',
        expirationDate: Number(exp) || undefined,
      })
      console.log(`  → OK:`, result)
      ok++
    } catch (e) {
      console.error(`WARN: ${name}=${domain} → ${e.message}`)
    }
  }
  // Verify
  const all = await s.cookies.get({ domain: 'tiktok.com' })
  console.log('Verified cookies in partition:', all.map(c => c.name))
  console.log(`Imported ${ok} cookies to persist:mark-browser`)
  app.exit(0)
})
