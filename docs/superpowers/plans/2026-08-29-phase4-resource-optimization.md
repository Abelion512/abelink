# Phase 4: Resource Optimization + Lazy Loading

**Tanggal:** 2026-08-29  
**Status:** PLAN

**Goal:** MARK auto-detect spesifikasi laptop, auto-tune resource usage, tanpa perlu setting manual dari user.

**Architecture:** Auto-profile detection → preset allocation → lazy activation. Seperti n8n yang auto-detect worker threads berdasarkan RAM.

**Tech Stack:** Config store di app + memory monitor + dynamic activation

**Spec:** Semua fitur tetap ada. Yang berubah: **ketika** mereka aktif, bukan **apakah** mereka ada.

---

## Analogi: Seperti Mesin Production

- **n8n** punya queue mode + worker threads — kalau RAM kecil, turunkan worker count
- **Zapier** punya task throttle — limit concurrent tasks berdasarkan plan
- **Harness** punya auto-scaling — scale up/down based on resource pressure

MARK sekarang: **semua fitur nyala semua**. Seperti menjalankan 10 workflow bersamaan di n8n dengan 1 worker thread — mogok.

**Solusi:** Auto-detect hardware → preset profile → lazy-activate fitur saat dipanggil.

---

## Auto-Detection Logic

**Bagaimana MARK tahu spesifikasi laptop?**

```js
// Deteksi sederhana — tidak perlu benchmark kompleks
const detectProfile = () => {
  // 1. Cek deviceMemory (Chrome API) — estimasi RAM dalam GB
  const ramGB = navigator.deviceMemory || 8  // default 8GB jika tidak ada
  
  // 2. Cek logical processors — jumlah core CPU
  const cores = navigator.hardwareConcurrency || 4
  
  // 3. Cek GPU — ada/tidak (untuk Whisper WebGPU)
  const hasGPU = typeof navigator !== 'undefined' && !!navigator.gpu
  
  // 4. Tauri environment → anggap hardware constraint
  const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTEGRATION__
  
  // 5. Tentukan profile
  if (ramGB <= 4 && cores <= 4) return 'MINIMAL'      // 4GB no-GPU
  if (ramGB <= 8 && cores <= 8) return 'STANDARD'     // 8GB
  if (ramGB <= 16) return 'PERFORMANCE'                // 16GB
  return 'UNLIMITED'                                    // 32GB+
}
```

---

## Profiles (Presets)

| Profile | RAM Target | Fitur Aktif | Kapan Pakai |
|---------|-----------|-------------|-------------|
| **MINIMAL** | < 300MB | Chat + commands only | 4GB no-GPU laptop |
| **STANDARD** | < 500MB | + Voice STT on-demand | 8GB laptop |
| **PERFORMANCE** | < 800MB | + RAG indexing on-demand | 16GB laptop |
| **UNLIMITED** | No limit | Semua fitur langsung | 32GB+ desktop |

**Auto-select:** Profile otomatis di-set saat startup. User bisa override manual via Settings jika ingin.

---

## Task 1: Auto-Detect + Self-Tuning Config

**Files:**
- Create: `src/utils/autoProfile.js` — deteksi hardware + preset selection
- Modify: `src/api/db.js` — simpan profile preference user
- Modify: `src/pages/Configuration.jsx` — simple dropdown profile

**Analogies for automation engineer:**
- `autoProfile.js` = **workflow trigger** yang detect environment sebelum jalan
- `db.js config` = **variables store** — simpan setting antar session
- `Configuration.jsx` = **dashboard settings** — override auto-detection

- [ ] **Step 1: Auto-detect hardware profile**

```js
// src/utils/autoProfile.js

export function detectHardwareProfile() {
  const ramGB = typeof navigator !== 'undefined' ? (navigator.deviceMemory || 8) : 8
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4
  const hasGPU = typeof navigator !== 'undefined' && !!navigator.gpu
  const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTEGRATION__
  
  // Tauri + low RAM → conservative
  if (isTauri && ramGB <= 4) return 'MINIMAL'
  if (ramGB <= 4) return 'MINIMAL'
  if (ramGB <= 8) return 'STANDARD'
  if (ramGB <= 16) return 'PERFORMANCE'
  return 'UNLIMITED'
}

export function getProfileConfig(profile) {
  const configs = {
    MINIMAL: {
      label: 'Laptop Ringan (4GB)',
      enableVoiceSTT: false,        // Whisper 80MB — skip default
      enableWorkspaceRAG: false,    // Orama 50MB — skip default
      enableMemoryVisualizer: true, // List view — ringan
      enableGraphView: false,       // ForceGraph — skip default
      sttTrigger: 'manual',         // STT hanya jalan kalau user klik
      ragTrigger: 'manual'          // RAG hanya jalan kalau user klik index
    },
    STANDARD: {
      label: 'Laptop Biasa (8GB)',
      enableVoiceSTT: true,         // On-demand (lazy load)
      enableWorkspaceRAG: false,    // Off by default, bisa enable
      enableMemoryVisualizer: true,
      enableGraphView: true,
      sttTrigger: 'on-demand',
      ragTrigger: 'manual'
    },
    PERFORMANCE: {
      label: 'Laptop Kuat (16GB)',
      enableVoiceSTT: true,
      enableWorkspaceRAG: true,     // Auto index workspace
      enableMemoryVisualizer: true,
      enableGraphView: true,
      sttTrigger: 'on-demand',
      ragTrigger: 'auto'
    },
    UNLIMITED: {
      label: 'Desktop/Workstation (32GB+)',
      enableVoiceSTT: true,
      enableWorkspaceRAG: true,
      enableMemoryVisualizer: true,
      enableGraphView: true,
      sttTrigger: 'always-on',
      ragTrigger: 'auto'
    }
  }
  return configs[profile] || configs.STANDARD
}
```

- [ ] **Step 2: Save profile preference to app config**

```js
// src/api/db.js — tambah config store
export async function getAppConfig(key, fallback = null) {
  const row = await db.appConfig.get(key)
  return row ? JSON.parse(row.value) : fallback
}

export async function setAppConfig(key, value) {
  await db.appConfig.put({ key, value: JSON.stringify(value) })
}

export async function getActiveProfile() {
  const saved = await getAppConfig('hardwareProfile', null)
  if (saved) return saved
  // Auto-detect pertama kali
  const profile = detectHardwareProfile()
  await setAppConfig('hardwareProfile', profile)
  return profile
}
```

- [ ] **Step 3: Simple UI override**

```jsx
// src/pages/Configuration.jsx
const [profile, setProfile] = useState('STANDARD')

// Dropdown dengan label bisnis, bukan "enableWorkspaceRAG"
<select value={profile} onChange={async (e) => {
  const p = e.target.value
  setProfile(p)
  await setAppConfig('hardwareProfile', p)
  // Apply preset — seperti ganti worker count di n8n
  window.location.reload() // simple: restart dengan profile baru
}}>
  <option value="MINIMAL">Laptop Ringan (4GB) — hemat resource</option>
  <option value="STANDARD">Laptop Biasa (8GB) — seimbang</option>
  <option value="PERFORMANCE">Laptop Kuat (16GB) — semua fitur</option>
  <option value="UNLIMITED">Desktop (32GB+) — tanpa batas</option>
</select>
```

- [ ] **Step 4: Commit**

```bash
git add src/utils/autoProfile.js src/api/db.js src/pages/Configuration.jsx
git commit -m "feat: auto-detect hardware profile + self-tuning preset"
```

---

## Sisa Tasks — Ringkasan Bahasa Bisnis

**Task 2: Lazy-Activate Fitur Berat (On-Demand Loading)**

> Seperti **n8n workflow yang di-trigger on-demand** — bukan dijalankan saat startup.
> 
> **Yang berubah:**
> - Orama (RAG indexing) → hanya aktif kalau user klik "Index Folder" atau bot minta context file
> - Whisper (Voice STT) → hanya aktif kalau user klik mic button atau trigger voice command
> - ForceGraph (visual graf) → hanya aktif kalau user buka Memory Visualizer panel
> 
> **Manfaat:** Startup MARK lebih cepat, RAM idle lebih rendah.
> 
> **Implementasi:** Sederhana — pindah `init()` call dari `App.jsx` startup ke event handler di masing-masing fitur.

**Task 3: Voice STT Auto-Disable saat Tidak Dipakai**

> Seperti **Zapier task timeout** — auto-cleanup resource kalau tidak ada activity.
> 
> **Yang berubah:**
> - Whisper Worker otomatis di-terminate kalau tab MARK tidak aktif (tab switched/minimized) selama > 5 menit
> - Saat user kembali ke MARK + butuh voice → Worker di-recreate otomatis
> 
> **Manfaat:** Bebas RAM tanpa perlu user close MARK.
> 
> **Implementasi:** Event listener `visibilitychange` + `beforeunload`.

**Task 4: Emergency Resource Cleanup (Memory Pressure Relief)**

> Seperti **Harness auto-scaling down** — kalau resource habis, turunkan fitur yang tidak essential.
> 
> **Yang berubah:**
> - Monitor RAM usage setiap 30 detik
> - Kalau RAM > 80% → disable RAG indexing + Whisper worker (prioritize chat)
> - User dapat notifikasi singkat: "RAM penuh — fitur berat di-pause, klik Resume untuk nyalakan lagi"
> 
> **Manfaat:** MARK tidak crash/mogok saat RAM penuh.
> 
> **Implementasi:** `performance.memory` check + graceful degradation.

---

## Prioritas Eksekusi

| Priority | Task | Impact | Effort |
|----------|------|--------|--------|
| P0 | Task 1: Auto-detect + preset | Foundational — semua task lain butuh ini | 1 jam |
| P1 | Task 2: Lazy-activate heavy features | Biggest RAM saver | 30 min |
| P2 | Task 3: Voice STT cleanup | Stabilize RAM usage | 15 min |
| P3 | Task 4: Memory pressure relief | Safety net | 30 min |

**Total estimate:** ~2.5 jam implementasi + testing.

**Yang TIDAK berubah:** Semua fitur tetap ada. Halaman Chat, Telegram, Knowledge, Configuration, Memory Visualizer — semua tetap accessible. Yang berubah: **waktu aktivasi** (startup vs on-demand) + **default state** (sesuai hardware).

---

## Analogi Final untuk User

> MARK sekarang seperti **mesin yang nyalakan semua lampu + AC + TV sekaligus** saat dinyalakan — boros listrik (RAM).
> 
> Setelah Phase 4: MARK seperti **rumah pintar** — nyalakan lampu ruangan hanya kalau ada orang di dalam, matikan AC kalau jendela terbuka, turunkan brightness kalau baterai rendah.
> 
> User tidak perlu setting apapun. MARK detect laptop → pilih preset → auto-manage resource. Kalau mau override: Settings → pilih preset manual.
