# MARK - Memory Adaptive Response Knowledge

> **Mark is a *Privacy-First Personal AI Assistant*.** More than just a regular chatbot, Mark is a smart assistant entity that lives on your laptop—equipped with local *Vector Memory*-based "long-term memory" that learns your habits without compromising data privacy. Powered by a *Hybrid AI Engine*, Mark can run 100% *offline* in stealth mode or accelerate with *Cloud APIs* to autonomously execute complex tasks (*Agentic Planning*), summarize YouTube videos, perform deep web research, and even interact through real-time voice communication—like your very own J.A.R.V.I.S.

> [!IMPORTANT]
> This project is specifically optimized for **Windows** (Windows 10/11).

## Key Features

- **Dual AI Provider (Hybrid):** You choose! Use **Local AI** (runs directly on your laptop without internet) for 100% privacy, or switch to **Cloud AI** for lightning-fast response times. The system is also smart enough to offload heavy background tasks to the cloud so your laptop stays snappy.
- **Autonomous Whatsapp Bot Thinking & Execution:** Mark is not just a simple chatbot. When given a complex task, Mark can formulate a step-by-step plan and execute it autonomously (e.g., searching the web for data, reading it, then summarizing it for you). The entire whatsapp bot flow is controlled by a dedicated AI Brain (`waAutonomous.js`) which acts as the supreme commander.
- **Smart AI:** Like a real human assistant, Mark silently learns and remembers your preferences, schedules, and habits from everyday conversations. All of this "memory" is stored securely **on your own laptop**, not on third-party servers.

## Tools

Mark is directly connected to a variety of powerful capabilities that allow it to go far beyond a simple text chatbot:
- **Deep Web Search:** Mark can independently browse the internet to research topics and present accurate summaries with citations.
- **YouTube Summarizer:** Just provide a YouTube video link, and Mark will automatically pull the transcript, chunk the text, and deliver a concise summary.
- **YouTube Music Player:** Integrated with YouTube Music (ad-free), Mark can be controlled to search and play your favorite songs directly from the chat interface.
- **Personal WhatsApp Bot:** Mark can act as a smart personal assistant right in your WhatsApp (using the Baileys library). It features a **Robust Auto-Retry Architecture** to handle poor network connections (preventing 428/1006 drops). Mark can adaptively read chat history, respond to mentions in groups, perform web searches, play songs on the laptop when requested by an Admin, and for non-admin users, Mark can automatically download YouTube songs as MP3 files and send them directly into the chat!
- **Screenshot & PC Control:** Mark has built-in native integration to take screenshots of your active monitors directly from WhatsApp. Through the Plugin System, you can also easily add tools like `windows-tools` (open apps, set volume, shutdown, restart) which execute asynchronously and safely via `waAutonomous.js`.
- **Voice & Audio (Voice-to-Voice):** Mark can be spoken to directly using a microphone (powered by Groq Whisper STT) and will respond with a natural-sounding voice (powered by Edge-TTS).

## Project Architecture

```text
mark/
├── src/
│   ├── main/              # Electron Main Process (Window Management, IPC, TTS, Tray)
│   │   ├── whatsapp/      # Native WhatsApp WebSocket Service (@whiskeysockets/baileys)
│   │   │   ├── baileys-service.js     # Connection, Msg Parsing, IPC Routing & Commands
│   │   │   ├── message-store.js       # In-memory chat history storage
│   │   │   ├── screenshot.js          # Native module (desktopCapturer) for WA screenshots
│   │   │   └── media-downloader.js    # Native module (ytdl-exec) for MP3 WA downloads
│   │   └── ai-bridge.js   # Centralized AI bridge for models, rate limits, & Auto-Repair JSON
│   ├── preload/           # Preload Scripts (Electron security bridge)
│   └── renderer/          # Frontend (React)
│       └── src/
│           ├── api/
│           │   ├── ai/             # AI Integration Modules (core, chat, planning, tools, utilities)
│           │   ├── db.js           # Local Database Schema & Migrations (Dexie/IndexedDB)
│           │   ├── scraping.js     # Google search & deep web research module
│           │   ├── vectorMemory.js # Vector Memory System (Transformers.js / LM Studio)
│           │   └── waAutonomous.js # Brain logic & Plugin execution for WhatsApp AI
│           ├── components/         # UI Components (Modular Chat Bubbles)
│           ├── contexts/           # Global State Management (ChatContext, YoutubeMusicContext)
│           ├── hooks/              # Custom React Hooks
│           │   ├── agent/          # Micro-Hooks System (useMarkPlan, useMarkSearch, etc.)
│           │   └── whatsapp/       # WhatsApp UI Automation Logic
│           └── pages/              # UI Pages (Chat, Settings, WhatsApp Bot)
```

## Tech Stack

| Category         | Technology                                                                   |
| ---------------- | ---------------------------------------------------------------------------- |
| **Framework**    | Electron 39, React 19, Vite 7                                               |
| **UI/Styling**   | Tailwind CSS 4, DaisyUI 5                                                   |
| **AI Engine**    | LM Studio / Groq API / Cerebras API (Inference)                             |
| **Vector Memory**| Transformers.js (`@huggingface/transformers`), LM Studio                     |
| **Web Search**   | Electron Webview (Google Search & Deep Research)                             |
| **Voice & Audio**| Groq API (STT), Edge-TTS, Web Audio API (Voice Activity Detection)           |
| **Integrations** | `youtube-transcript-plus`, `youtube-dl-exec` & `ffmpeg-static` (Audio), WhatsApp Baileys |
| **Database**     | Dexie.js (IndexedDB Wrapper)                                                |
| **Markdown**     | React Markdown, React Syntax Highlighter, remark-gfm, rehype-external-links |

## Setup & Installation

### Prerequisites
- **Operating System**: Windows 10/11
- **Node.js**: Version 18 or later
- (Optional) **LM Studio** if you want to run models offline.
- (Optional) **Groq API Key** if you want to use the super-fast cloud models.

### Installation Steps

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/username/mark-project.git
    cd mark-project/mark
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the application:**
    ```bash
    npm run dev
    ```

4.  **Initial Configuration:**
    Open the **Settings** menu inside the application, select your AI provider (LM Studio or Groq), enter your API Key (if using Groq), and configure the Vector Memory provider (recommended: **Transformers.js** for a fully local experience without additional software).

## 🔌 Plugins System (Custom Tools)

Mark allows you to easily extend its capabilities by creating **Custom Plugins** directly from the User Interface! You don't need to dive into the core codebase to add new features or scripts.

### How to Create a Plugin

1. Open the **Plugins** menu from the sidebar in the application.
2. Click **Buat Plugin Baru** (Create New Plugin).
3. Fill in the **Plugin Name** (e.g., `pc-controller`) and a general **Description**.
4. (Optional) If your script requires external libraries, enter them in the **Dependencies (NPM)** field separated by commas (e.g., `systeminformation, axios`). Mark will automatically install them!
5. Add one or more **Actions**. An action is a specific task the AI can trigger.
   - **Action Name**: The function name (e.g., `sys-shutdown`).
   - **Description**: Tell the AI what this action does.
   - **Trigger Hint**: Tell the AI *when* to use it (e.g., "If the user asks to turn off the PC").
6. **Write your Code** using the built-in Monaco Editor. Plugins use standard Node.js (CommonJS).

#### Example: PC Shutdown Action
```javascript
const { exec } = require('child_process');

// Execute windows shutdown command after 60 seconds
setTimeout(() => {
  exec('shutdown /s /f /t 0');
}, 60000);

// Return the result to Mark
return {
  success: true,
  message: "PC will shutdown in 60 seconds."
};
```

7. Click **Simpan Plugin**. Mark will instantly learn your new tool and you can immediately trigger it by chatting with Mark (or via WhatsApp if you are the Admin)!

## Building the Application

To create an installer (Windows executable):
```bash
npm run build:win
```
The installer file (`.exe`) will be automatically available in the `dist/` folder.

## Roadmap

- [x] Web Search & Deep Research Integration
- [x] Vector MMS (Semantic memory search with Transformers.js & LM Studio)
- [x] YouTube Summarization (Transcript extraction & video data)
- [x] Continuous Conversation & Time Awareness
- [x] Few-Shot Examples for AI response consistency
- [x] Settings Page (Dynamic configuration for AI Engine & Vector Provider)
- [x] YouTube Music Player & Automatic Ad Blocker
- [x] Live Voice Interaction (Audio Beta & Groq Voice Commands)
- [x] Agentic Planning with citation source links
- [x] Personal WhatsApp AI Bot Integration (Preload-free Injection)
- [ ] Image Analysis (Vision): Enable AI to read images locally
- [ ] Memory Export/Import: User memory backup & restore feature
- [ ] Code Interpreter: Enable AI to dynamically execute scripts, providing limitless freedom
- [ ] Prompt Templates: Save long prompts or custom personas (e.g., "marketing specialist"). Users simply type `@template-name` in the chat field.

## License

This project is licensed under **MIT**, with the additional condition: **Strictly prohibited to sell this software for commercial profit without written permission.**

---
> Built for a more private and intelligent AI future.
