## 2026-09-11 - [HIGH] Fix XSS vulnerability in Guidebook
**Vulnerability:** A Cross-Site Scripting (XSS) vulnerability was found in the `src/pages/Guidebook.jsx` file. The FAQ page used React's `dangerouslySetInnerHTML` combined with regex formatting instead of proper rendering.
**Learning:** `dangerouslySetInnerHTML` shouldn't be used, especially in conjunction with simple text-replacement regex. A much safer alternative already bundled in the repository is `react-markdown` via `<Markdown>`.
**Prevention:** Using `Markdown` component consistently throughout the app prevents injection vulnerabilities natively and also removes unreadable and hacky regex replacement chains for markdown elements.
