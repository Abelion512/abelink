// Helper resume co-pilot: pause-state browser (bukan terminal).
// Resume = browser-read tab SAMA, tidak pernah re-navigate.
export const BROWSER_RESUME_RE = /lanjutkan|continue|resume|sudah selesai/i

export const isBrowserResumeRequest = (text = '') => BROWSER_RESUME_RE.test(String(text || ''))

export const buildBrowserResume = (pausedBrowser = {}) => {
  const { sessionId = 'default', tabId = null, url = '', goal = '' } = pausedBrowser
  const query = tabId != null ? `tab:${tabId}` : ''
  return {
    resumeAction: { tool: 'browser-read', query, sessionId },
    observation:
      `[RESUME] User melanjutkan (${goal || url || 'tab browser'}). ` +
      `Baca ulang tab yang SAMA (tabId ${tabId ?? 'aktif sesi'}) via browser-read — JANGAN browser-navigate ulang.`
  }
}
