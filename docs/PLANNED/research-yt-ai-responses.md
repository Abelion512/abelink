# AI Platforms Responses: "Electron YouTube webview blocked" Issue

**Date:** 2026-07-29

**Question Asked:**

```
I have an Electron app (MARK) where I use a webview (partition='persist:mark-browser') to load youtube.com. Google blocks it with black screen after session expires. I need a solution that actually works in 2025.

Current approach that FAILS:
- webview with partition='persist:mark-browser'
- User can login via physical BrowserWindow (same partition) — cookies persist
- But after restart, Google session expires and webview goes black with no error

Questions:
1. Would using BrowserWindow instead of webview fix the Google OAuth block?
2. Does th-ch/youtube-music use webview or BrowserWindow?
3. Can I just show/hide the existing BrowserWindow (browser-agent.js) instead of webview?
4. What is the actual working approach in 2025?
```

---

## ChatGPT

**Status:** Session not available (redirected to login)

**URL:** https://chatgpt.com/

**Page snippet:**

```
Skip to content
Chat history
New chat
Images
Plugins
Deep research
See plans and pricing
Settings
Help

Get responses tailored to you

Log in to get answers based on saved chats, plus create images and upload files.

Log in
ChatGPT
Log in
Sign up for free
Ready when you are.
Voice
ChatGPT is AI. By using it, you agree to our Terms & Privacy Policy. Chats may be reviewed and used to improve our AI models. Learn more
```

---

## Claude

**Error:** locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('div[contenteditable="true"]').first() to be visible


---

## DeepSeek

**Status:** Session not available (redirected to login)

**URL:** https://chat.deepseek.com/sign_in

**Page snippet:**

```
By signing up or logging in, you consent to DeepSeek's 
Terms of Use and 
Privacy Policy.
Forgot password?
Sign up
Log in
Log in with Google
Login with Apple
浙ICP备2023025841号
 · 
Contact us
```

---

