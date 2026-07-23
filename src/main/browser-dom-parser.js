// DOM parser script injected into browser window to extract interactive elements and text.
// Extracted to its own file to keep browser-agent.js focused on window lifecycle.
export const DOM_PARSER_SCRIPT = `
(() => {
  // Hapus semua data-mark-id sebelumnya
  document.querySelectorAll('[data-mark-id]').forEach(el => el.removeAttribute('data-mark-id'));

  // === INJECT USER BLOCKER OVERLAY ===
  if (!document.getElementById('mark-blocker-style')) {
    const style = document.createElement('style');
    style.id = 'mark-blocker-style';
    style.textContent = \`
      @keyframes mark-spin { 100% { transform: rotate(360deg); } }
      .mark-spin { animation: mark-spin 1.5s linear infinite; }
      @keyframes mark-pulse { 50% { opacity: 0.7; } }
      .mark-pulse { animation: mark-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
    \`;
    document.head.appendChild(style);
  }

  let blocker = document.getElementById('mark-user-blocker');
  if (!blocker) {
    blocker = document.createElement('div');
    blocker.id = 'mark-user-blocker';
    blocker.innerHTML = \`
      <div style="background: rgba(25, 54, 45, 0.9); backdrop-filter: blur(8px); border: 1px solid rgba(31, 184, 84, 0.4); border-radius: 30px; padding: 10px 20px; display: flex; align-items: center; gap: 10px; color: #1fb854; font-family: system-ui, sans-serif; font-weight: 600; font-size: 14px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.4); pointer-events: none;">
        <svg class="mark-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
        <span class="mark-pulse">Mark is working...</span>
      </div>
    \`;
    Object.assign(blocker.style, {
      position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.1)', zIndex: '2147483647', cursor: 'not-allowed',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      paddingTop: '24px', pointerEvents: 'auto', transition: 'all 0.3s'
    });
    
    // Prevent wheel and touchmove events from bubbling down
    blocker.addEventListener('wheel', e => e.preventDefault(), { passive: false });
    blocker.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.body.appendChild(blocker);
  }
  blocker.style.display = 'flex';

  const INTERACTIVE_SELECTORS = [
    'a[href]', 'button', 'input', 'select', 'textarea',
    '[role="button"]', '[role="link"]', '[role="tab"]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  const allElements = document.querySelectorAll(INTERACTIVE_SELECTORS);
  const results = [];
  let markId = 1;
  const MAX_ELEMENTS = 80;
  const MAX_TEXT_LENGTH = 80;

  for (const el of allElements) {
    if (results.length >= MAX_ELEMENTS) break;

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    if (el.offsetWidth < 5 || el.offsetHeight < 5) continue;

    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    if (rect.right < 0 || rect.left > window.innerWidth) continue;

    const tag = el.tagName.toLowerCase();
    let type = 'Element';
    if (tag === 'a') type = 'Link';
    else if (tag === 'button' || el.getAttribute('role') === 'button') type = 'Button';
    else if (tag === 'input') type = 'Input (' + (el.type || 'text') + ')';
    else if (tag === 'select') type = 'Dropdown';
    else if (tag === 'textarea') type = 'TextArea';

    let label = el.innerText?.trim() || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || '';
    label = label.replace(/\\n/g, ' ').substring(0, MAX_TEXT_LENGTH);

    el.setAttribute('data-mark-id', markId);
    results.push('[' + markId + '] ' + type + ': "' + label + '"');
    markId++;
  }

  const getVisibleText = () => {
    let text = '';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    let lastParent = null;
    while ((node = walker.nextNode())) {
      if (text.length > 8000) break;
      const parent = node.parentElement;
      if (!parent) continue;
      const tag = parent.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript') continue;
      const rect = parent.getBoundingClientRect();
      if (rect.bottom > -200 && rect.top < window.innerHeight + 1500) {
        const val = node.nodeValue.trim();
        if (val.length > 0) {
          if (lastParent !== parent && ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(tag)) {
            text += '\\n';
          }
          text += val + ' ';
          lastParent = parent;
        }
      }
    }
    return text.trim();
  }

  const bodyText = getVisibleText() || '';
  const pageTitle = document.title || '';
  const currentURL = window.location.href || '';

  let output = '[URL Aktif]: ' + currentURL + '\\n';
  output += '[Title]: ' + pageTitle + '\\n\\n';
  output += '== ELEMEN INTERAKTIF (' + results.length + ' ditemukan) ==\\n';
  output += results.join('\\n');
  output += '\\n\\n== KONTEN TEKS DI LAYAR (Dan sekitarnya) ==\\n';
  output += bodyText;

  return output;
})()
`
