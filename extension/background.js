// --------------------------------------------------------------- tagging
// Kontrak: elemen dalam main/article/[role=main] diutamakan, maks 200
// elemen, teks maks 120 char (lihat extension/tagger-rank.mjs — salinan
// inline di bawah karena fungsi ini DI-SERIALISASI, wajib self-contained).
function taggerFn() {
  document.querySelectorAll('[data-abelink-id]').forEach((el) => el.removeAttribute('data-abelink-id'))
  const SELECTORS = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="switch"]',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ')

  // Ranking inline (salinan rankTaggerElements dari tagger-rank.mjs):
  // scan scope konten utama dulu, lalu fallback seluruh dokumen.
  const MAIN_SCOPE = 'main, [role="main"], article'
  const scopeRoots = [...document.querySelectorAll(MAIN_SCOPE)]
  const inMain = new Set()
  for (const root of scopeRoots) {
    for (const el of root.querySelectorAll(SELECTORS)) inMain.add(el)
  }
  const docEls = [...document.querySelectorAll(SELECTORS)]
  const els = [...docEls.filter((el) => inMain.has(el)), ...docEls.filter((el) => !inMain.has(el))]
  const out = []
  const MAX = 200
  const MAX_TEXT = 120
  let n = 1
  const vh = window.innerHeight || document.documentElement.clientHeight || 800
  const vw = window.innerWidth || document.documentElement.clientWidth || 1200

  for (const el of els) {
    if (out.length >= MAX) break
    const rect = el.getBoundingClientRect()
    if (rect.width < 3 || rect.height < 3) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue

    const id = 'ak' + n++
    el.setAttribute('data-abelink-id', id)
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.placeholder || '')
      .trim()
      .slice(0, MAX_TEXT)
    const inViewport = rect.top >= 0 && rect.left >= 0 && rect.top <= vh && rect.left <= vw

    out.push({
      abelinkId: id,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || el.getAttribute('role') || '',
      text,
      placeholder: el.placeholder || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      href: el.href ? el.href.slice(0, 200) : '',
      inViewport,
      x: Math.round(rect.x + window.scrollX),
      y: Math.round(rect.y + window.scrollY)
    })
  }
  const mainRoot = document.querySelector(MAIN_SCOPE) || document.body
  const pageText = String(mainRoot?.innerText || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 5000)

  return { title: document.title, url: location.href, text: pageText, elements: out }
}

async function readDomInTab(tabId) {
  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: taggerFn })
  if (!injection?.result) return { ok: false, error: 'Gagal membaca DOM (hasil injection kosong).' }
  return { ok: true, data: JSON.stringify(injection.result) }
}
