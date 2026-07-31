---
name: session-log
description: Logging dan rekapitulasi sesi MARK secara otomatis
watermark: v5.0.0
origin: mark-agent-fork
provider: abelion512
platforms: [mark-agent]
tags: [session, logging, recap, memory]
---

# Session Log Skill

Skill ini memungkinkan MARK untuk secara otomatis mencatat dan merekapitulasi
sesi interaksi.

## Usage

Dipanggil otomatis oleh `planning.js` saat intent `session` atau `/recap`
terdeteksi via vector similarity (threshold >= 0.35).

## ⚓ WATERMARK

- **Origin:** `mark-agent-fork` v5.0.0
- **Integrity:** SHA-256 tercatat di `.agents/manifest.json`. Modifikasi tanpa
  update manifest → skill dianggap `unknown`.
