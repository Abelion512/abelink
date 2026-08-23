# DRIFT MANIFEST — mark-agent-fork vs upstream/master

Generated: 2026-08-16
Decision: reset src/ to official (Mazees/mark-agent), re-apply Linux patches manually.

## FEATURES TO SHELVE (user wants re-implemented later)
- Auto scan model dari endpoint (/models) + selectable hasil di config
- What's New
- 4 mode (chat/voice/camera/screen)
- Jam digital saat click orb
- last.fm biarkan di connector tapi just api
- Fitur import chat

## ADDED (hanya di fork — 59 file, cutoff)
src/main/.youtube-protection.yml
src/main/agent-keyring.js
src/main/agent-skills-loader.js
src/main/browser-dom-parser.js
src/main/computer/audit-log.js
src/main/computer/policy-engine.js
src/main/computer/quarantine.js
src/main/lastfm-service.js
src/main/linux-agent.sh
src/main/modelDiscovery.js
src/main/mpris-service.js
src/main/native-tools.js
src/main/playback-history.js
src/main/read-ui.py
src/main/screenshot-ocr.py
src/main/tool-registry.js
src/main/whatsapp/baileys-service.js
src/main/whatsapp/media-downloader.js
src/main/whatsapp/message-store.js
src/main/whatsapp/screenshot.js
src/main/youtube-player.js
src/main/ytdl-service.js
src/renderer/src/api/ai/approval-modes.js
src/renderer/src/api/ai/fallback-serializer.js
src/renderer/src/api/ai/guard-gate.js
src/renderer/src/api/ai/output-sanitizer.js
src/renderer/src/api/ai/prompt-compressor.js
src/renderer/src/api/ai/sessionKnowledge.js
src/renderer/src/api/ai/skill-sanitizer.js
src/renderer/src/api/ai/skillLibrary.js
src/renderer/src/api/ai/tool-registry.js
src/renderer/src/api/ai/vision-service.js
src/renderer/src/api/checkpoint-manager.js
src/renderer/src/api/vectorCore.js
src/renderer/src/api/vectorLoader.js
src/renderer/src/api/waAgent.js
src/renderer/src/components/core/OptionsPicker.jsx
src/renderer/src/hooks/agent/tools/index.js
src/renderer/src/hooks/agent/tools/misc.js
src/renderer/src/hooks/agent/tools/music.js
src/renderer/src/hooks/agent/tools/native.js
src/renderer/src/hooks/agent/tools/pc.js
src/renderer/src/hooks/agent/tools/plugin.js
src/renderer/src/hooks/agent/tools/vision.js
src/renderer/src/hooks/agent/tools/wa.js
src/renderer/src/hooks/agent/tools/youtube.js
src/renderer/src/hooks/whatsapp/useWhatsappBot.js
src/renderer/src/pages/WhatsappBot.jsx
src/renderer/src/pages/config/ConfigSidebar.jsx
src/renderer/src/pages/config/sections/ConfigAdmin.jsx
src/renderer/src/pages/config/sections/ConfigAI.jsx
src/renderer/src/pages/config/sections/ConfigCamera.jsx
src/renderer/src/pages/config/sections/ConfigChat.jsx
src/renderer/src/pages/config/sections/ConfigIntegrations.jsx
src/renderer/src/pages/config/sections/ConfigMemory.jsx
src/renderer/src/pages/config/sections/ConfigPersona.jsx
src/renderer/src/pages/config/sections/ConfigProviderKeys.jsx
src/renderer/src/pages/config/sections/ConfigVoice.jsx
src/shared/cleanAndParse.js

## DELETED (ada di official, kita hapus — 26 file, restore)
src/main/google/google-calendar.js
src/main/google/google-drive.js
src/main/google/google-gmail.js
src/main/google/google-service.js
src/main/node-tools.js
src/main/pc-agent-scripts/mouse-locker.ps1
src/main/pc-agent-scripts/ocr-region.ps1
src/main/pc-agent-scripts/pc-daemon.ps1
src/main/pc-agent-scripts/read-ui.ps1
src/main/pc-agent-scripts/win-action.ps1
src/main/skills/skill-manager.js
src/main/telegram/telegram-service.js
src/renderer/src/api/ai/memoryGroomer.js
src/renderer/src/api/ai/taskPlanner.js
src/renderer/src/api/localWhisper.js
src/renderer/src/api/taskExecutor.js
src/renderer/src/api/taskStore.js
src/renderer/src/api/tools/core-tools.js
src/renderer/src/api/tools/group-tools.js
src/renderer/src/api/tools/index.js
src/renderer/src/api/whisperWorker.js
src/renderer/src/hooks/telegram/useTelegramBot.js
src/renderer/src/pages/GoogleWorkspace.jsx
src/renderer/src/pages/SkillEditor.jsx
src/renderer/src/pages/Skills.jsx
src/renderer/src/pages/TelegramBot.jsx

## MODIFIED (55 file — reset konten ke official)
src/main/ai-bridge.js
src/main/browser-agent.js
src/main/index.js
src/main/pc-agent.js
src/main/awareness/window-tracker.js
src/main/plugins/plugin-loader.js
src/preload/index.js
src/renderer/index.html
src/renderer/src/App.jsx
src/renderer/src/api/db.js
src/renderer/src/api/groq.js
src/renderer/src/api/oramaStore.js
src/renderer/src/api/ragPipeline.js
src/renderer/src/api/vectorMemory.js
src/renderer/src/api/ai/awareness.js
src/renderer/src/api/ai/chatSummarizer.js
src/renderer/src/api/ai/core.js
src/renderer/src/api/ai/persona.js
src/renderer/src/api/ai/planning.js
src/renderer/src/api/ai/relationship.js
src/renderer/src/api/ai/tools.js
src/renderer/src/api/ai/utils.js
src/renderer/src/assets/main.css
src/renderer/src/components/YoutubeMusicPlayer.jsx
src/renderer/src/components/Chat/PluginExecutionBubble.jsx
src/renderer/src/components/core/BrowserPreviewWidget.jsx
src/renderer/src/components/core/DraggableHoloCard.jsx
src/renderer/src/components/core/FloatingMenu.jsx
src/renderer/src/components/core/HistoryDrawer.jsx
src/renderer/src/components/core/HoloCard.jsx
src/renderer/src/components/core/InputBar.jsx
src/renderer/src/components/core/MemoryVisualizer.jsx
src/renderer/src/components/core/OrbVisualizer.jsx
src/renderer/src/components/core/ProcessPanel.jsx
src/renderer/src/components/core/ResponseArea.jsx
src/renderer/src/contexts/YoutubeMusicContext.jsx
src/renderer/src/data/faqData.js
src/renderer/src/hooks/useAwareness.js
src/renderer/src/hooks/useMarkAgent.js
src/renderer/src/hooks/useMemoryGroomer.js
src/renderer/src/hooks/useVAD.js
src/renderer/src/hooks/agent/useMarkMusic.js
src/renderer/src/hooks/agent/useMarkPlan.js
src/renderer/src/hooks/agent/useMarkState.js
src/renderer/src/hooks/agent/useMarkYoutube.js
src/renderer/src/hooks/agent/useRelationalGrowth.js
src/renderer/src/pages/Configuration.jsx
src/renderer/src/pages/Guidebook.jsx
src/renderer/src/pages/Knowledge.jsx
src/renderer/src/pages/LiveAudio.jsx
src/renderer/src/pages/MarkHome.jsx
src/renderer/src/pages/Plugins.jsx
src/renderer/src/pages/RelationalGrowth.jsx