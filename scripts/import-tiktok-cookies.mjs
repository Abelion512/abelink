// Import TikTok session cookies (Netscape format, dari "Get cookies.txt LOCALLY")
// Jalankan: npx electron scripts/import-tiktok-cookies.mjs <path-cookies.txt>
import { app, session } from 'electron'
import { readFileSync } from 'node:fs'

app.whenReady().then(async () => {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: npx electron scripts/import-tiktok-cookies.mjs <cookies.txt>')
    app.exit(1)
  }
  const lines = readFileSync(file, 'utf8').split('\n')
  const s = session.fromPartition('persist:mark-browser')
  let ok = 0
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue
    const [domain, , path, secure, exp, name, ...rest] = line.split('\t')
    const value = rest.join('\t')
    await s.cookies.set({
      url: (secure === 'TRUE' ? 'https://' : 'http://') + domain + path,
      name,
      value,
      domain,
      path,
      secure: secure === 'TRUE',
      expirationDate: Number(exp) || undefined,
      httpOnly: true,
      sameSite: 'no_restriction'
    })
    ok++
  }
  console.log(`Imported ${ok} cookies to persist:mark-browser`)
  app.exit(0)
})
