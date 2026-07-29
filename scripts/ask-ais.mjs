import { chromium } from 'playwright';
import fs from 'fs';

const QUESTION = `I have an Electron app (MARK) where I use a webview (partition='persist:mark-browser') to load youtube.com. Google blocks it with black screen after session expires. I need a solution that actually works in 2025.

Current approach that FAILS:
- webview with partition='persist:mark-browser'
- User can login via physical BrowserWindow (same partition) — cookies persist
- But after restart, Google session expires and webview goes black with no error

Questions:
1. Would using BrowserWindow instead of webview fix the Google OAuth block?
2. Does th-ch/youtube-music use webview or BrowserWindow?
3. Can I just show/hide the existing BrowserWindow (browser-agent.js) instead of webview?
4. What is the actual working approach in 2025?`;

const SITES = [
  {
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    sendQuestion: async (page) => {
      // Check we're on chat page (not login)
      const url = page.url();
      if (url.includes('auth') || url.includes('login') || url === 'https://chatgpt.com/') {
        return { needLogin: true, url };
      }
      const ta = page.locator('#prompt-textarea').first();
      await ta.waitFor({ state: 'visible', timeout: 15000 });
      await ta.click();
      await ta.fill(QUESTION);
      await page.keyboard.press('Enter');
      return { sent: true };
    },
    getResponse: async (page) => {
      // Wait for Stop button to disappear (means generation done)
      for (let i = 0; i < 120; i++) {
        await page.waitForTimeout(1000);
        const stop = page.locator('button[data-testid="stop-button"]');
        if (!(await stop.isVisible({ timeout: 500 }).catch(() => false)) && i > 5) break;
      }
      // Get last assistant message
      return page.evaluate(() => {
        const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
        if (msgs.length) return msgs[msgs.length-1].innerText;
        const articles = document.querySelectorAll('article');
        if (articles.length >= 2) return articles[articles.length-1].innerText;
        return document.body.innerText.substring(0, 5000);
      });
    }
  },
  {
    name: 'Claude',
    url: 'https://claude.ai',
    sendQuestion: async (page) => {
      const url = page.url();
      if (url.includes('login') || url.includes('sign')) {
        return { needLogin: true, url };
      }
      const ta = page.locator('div[contenteditable="true"]').first();
      await ta.waitFor({ state: 'visible', timeout: 15000 });
      await ta.click();
      await ta.fill(QUESTION);
      await page.keyboard.press('Enter');
      return { sent: true };
    },
    getResponse: async (page) => {
      for (let i = 0; i < 120; i++) {
        await page.waitForTimeout(1000);
        const stop = page.locator('button:has-text("Stop"), button[aria-label="Stop streaming"]').first();
        if (!(await stop.isVisible({ timeout: 500 }).catch(() => false)) && i > 5) break;
      }
      return page.evaluate(() => {
        const articles = document.querySelectorAll('article');
        if (articles.length >= 2) return articles[articles.length-1].innerText;
        return document.body.innerText.substring(0, 5000);
      });
    }
  },
  {
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    sendQuestion: async (page) => {
      const url = page.url();
      if (url.includes('sign_in') || url.includes('login') || url.includes('auth')) {
        return { needLogin: true, url };
      }
      // Wait for input field
      const input = page.locator('#chat-input, textarea, div[contenteditable="true"]').first();
      await input.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (bodyText.includes('sign_in') || bodyText.includes('Log in')) {
        return { needLogin: true, url: page.url(), body: bodyText.substring(0, 200) };
      }
      await input.click();
      await page.waitForTimeout(500);
      await input.fill(QUESTION);
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      return { sent: true };
    },
    getResponse: async (page) => {
      for (let i = 0; i < 120; i++) {
        await page.waitForTimeout(1000);
        const html = await page.content();
        if (html.includes('Stop') && i < 5) continue;
        // Check if stop button gone AND new content appeared
        const body = await page.evaluate(() => document.body.innerText);
        if (!body.includes('Stop generating') && i > 5) {
          return body.substring(0, 5000);
        }
      }
      return await page.evaluate(() => document.body.innerText.substring(0, 5000));
    }
  }
];

async function main() {
  // Use persistent context with the Default Chrome profile that has login sessions
  const context = await chromium.launchPersistentContext('/home/abelion/.config/google-chrome/Default', {
    headless: false,
    channel: 'chrome',
  });
  const results = [];

  for (const site of SITES) {
    console.log(`\n=== ${site.name} ===`);
    const page = await context.newPage();
    let result = { site: site.name };

    try {
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      
      // Save initial state
      const askResult = await site.sendQuestion(page);

      if (askResult.needLogin) {
        result.needLogin = true;
        result.url = askResult.url;
        result.bodyPrefix = askResult.body || (await page.evaluate(() => document.body.innerText.substring(0, 500)));
        console.log(`  Need login at ${askResult.url}`);
        await page.screenshot({ path: `/tmp/${site.name.toLowerCase()}_login.png` });
      } else {
        console.log('  Question sent, waiting for response...');
        result.response = await site.getResponse(page);
        console.log(`  Got response: ${(result.response || '').substring(0, 100)}...`);
        await page.screenshot({ path: `/tmp/${site.name.toLowerCase()}_response.png`, fullPage: true });
      }
    } catch (e) {
      console.log(`  Error: ${e.message}`);
      result.error = e.message;
      await page.screenshot({ path: `/tmp/${site.name.toLowerCase()}_error.png` }).catch(() => {});
    }

    results.push(result);
    await page.close();
  }

  await context.close();

  // Write markdown
  let md = `# AI Platforms Responses: "Electron YouTube webview blocked" Issue\n\n`;
  md += `**Date:** 2026-07-29\n\n`;
  md += `**Question Asked:**\n\n\`\`\`\n${QUESTION}\n\`\`\`\n\n---\n\n`;

  for (const r of results) {
    md += `## ${r.site}\n\n`;
    if (r.needLogin) {
      md += `**Status:** Session not available (redirected to login)\n\n`;
      md += `**URL:** ${r.url}\n\n`;
      md += `**Page snippet:**\n\n\`\`\`\n${r.bodyPrefix || ''}\n\`\`\`\n\n`;
    } else if (r.error) {
      md += `**Error:** ${r.error}\n\n`;
    } else if (r.response) {
      md += `${r.response}\n\n`;
    }
    md += `---\n\n`;
  }

  fs.writeFileSync('/media/abelion/Isaf/ican/project/AGENT/mark-agent-fork/docs/PLANNED/research-yt-ai-responses.md', md, 'utf-8');
  console.log('\n=== Written to docs/PLANNED/research-yt-ai-responses.md ===');
}

main().catch(e => { console.error(e); process.exit(1); });
