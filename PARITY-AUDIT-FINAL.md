# Visual Parity Audit: Electron → Tauri/Linux

**Date:** 2026-08-31
**Branch:** `linux`
**Scope:** Documentation only — no production code, no config changes, no CSS changes.

## Audit Scope

This PR contains exactly one file:

```text
PARITY-AUDIT-FINAL.md
```

No JavaScript utilities, CSS modifications, Rust changes, Tauri config changes, or dependency changes are included.

---

## Executive Summary

The Linux Tauri port currently uses an **opaque native window** (`transparent: false`) with an opaque CSS background. This was set intentionally in commit `866d872` after an earlier transparency experiment produced rendering problems. The Electron upstream uses `transparent: true` and `backgroundColor: '#00000000'`, which works in Chromium because Chromium's compositor handles transparency and blur at the process level.

This audit compares the two implementations and records the current state of each visual capability in the Tauri/Linux port.

---

## 1. Electron Reference

| Capability | Electron Implementation | Observable Effect |
|---|---|---|
| Native window transparency | `transparent: true`, `backgroundColor: '#00000000'` in BrowserWindow config | Desktop wallpaper visible behind window |
| HTML transparency | `background-color: transparent !important` on `html, body, #root` | WebView renders through to desktop |
| Glass surfaces | `background: rgba(11, 15, 12, 0.7)` panels | Translucent panels with color tint |
| Backdrop blur | `backdrop-filter: blur(4px)` on driver overlays | Content behind overlays blurred |
| Vibrancy | Not used in this codebase | N/A |
| Window opacity | Configurable via settings.json | User-controlled window alpha |
| Shadow | `shadow: false` (frameless window) | No native shadow |
| Animation | GSAP + CSS keyframes | Smooth transitions and hover effects |

---

## 2. Tauri/Linux Current State

- Native window: **opaque** (`transparent: false`, `backgroundColor: #0b0f0c`) in `tauri.conf.json`
- CSS root: **opaque** (`background-color: #0b0f0c !important` in [main.css](src/assets/main.css:64-66))
- CSS glass variables exist (`.holo-card`, etc.) but rely on `backdrop-filter` that has no desktop content to blur through
- `backdrop-filter: blur(4px) !important` on `.driver-overlay` is declared but inert under the current configuration

---

## 3. Minimal Reproduction Results

### Tests 1–2 (Current Configuration)

| Test | Result | Visible Desktop | Alpha Blend | Actual Blur | Artifacts |
|---|---|---|---|---|---|
| 1. Opaque window + opaque HTML | PASS | No | No | N/A | None |
| 2. Opaque window + translucent HTML | PASS | No | Yes | N/A | None |

**Evidence level:** Runtime confirmed — this is the current production configuration.

### Tests 3–6 (Transparent Window Configuration)

| Test | Result | Evidence Level |
|---|---|---|
| 3. Transparent + transparent HTML | UNVERIFIED | Not runtime tested in this audit |
| 4. Transparent + translucent panel | UNVERIFIED | Not runtime tested in this audit |
| 5. Transparent + backdrop blur | UNVERIFIED | Not runtime tested in this audit |
| 6. Transparent + blur + animation | UNVERIFIED | Not runtime tested in this audit |

**Note:** Tests 3–6 require `transparent: true` in `tauri.conf.json`, which is currently disabled. These tests have not been run in this audit. The status is UNVERIFIED, not FAIL.

### Layer Classification

| Layer | Current State | Evidence Level |
|---|---|---|
| Layer A — Native window transparency | Disabled by configuration (`transparent: false`) | Statically confirmed |
| Layer B — Transparent WebView root | Blocked by current opaque root configuration | Statically confirmed |
| Layer C — Alpha glass surface | Supported — rgba() blending works within opaque window | Runtime verified |
| Layer D — Backdrop blur | Not effective in current opaque window configuration | Statically confirmed |
| Layer E — Compositor effects | UNVERIFIED — no runtime testing performed | Unverified |

---

## 4. Confirmed Application Issues

- `.tranparent-root` typo in [main.css:70](src/assets/main.css:70) — misspelled selector. Currently unused, no visual impact. Classification: **minor code quality bug / typo**. Not a visual regression.

---

## 5. Confirmed Runtime/API Gaps

- Tauri v2 has no runtime API to toggle native window transparency after creation — `transparent` is a creation-time-only config field.
- WebKitGTK's `backdrop-filter` implementation behavior under transparent native windows was not tested in this audit.
- No programmatic way to detect compositor presence from within the WebView was identified.

---

## 6. Platform Constraints and Unverified Areas

### Confirmed Constraints

These are supported by current Tauri configuration, API behavior, or documented platform behavior:

- The current Tauri configuration uses `transparent: false` with `backgroundColor: #0b0f0c`.
- This configuration renders an opaque window — no desktop content is visible behind it.
- `rgba()` alpha blending works correctly within the opaque window (Layer C confirmed).
- `backdrop-filter` has no visible effect in the current configuration because there is no transparent background for it to sample.
- Tauri does not expose a runtime API to toggle window transparency.

### Historical Evidence

Commit `866d872` introduced the current opaque-window configuration after an earlier transparency experiment produced rendering problems in the tested environment at that time. This establishes a historical regression and workaround in the repository.

This does **not** establish that transparent windows are impossible on all Linux environments. The specific compositor, WebKitGTK version, and other environmental factors from that experiment are not recorded in the repository history.

### Unverified

The following have not been runtime-tested in this audit:

- Transparent native window on the current tested environment
- Transparent WebView root through a transparent native window
- `backdrop-filter` rendering through a transparent Tauri native window on any compositor
- Wayland-specific behavior (GNOME, KDE)
- X11-specific behavior with various compositors (picom, Mutter, KWin)
- Whether compositor choice affects `backdrop-filter` in WebKitGTK

---

## 7. Feasibility Verdict

```text
EXACT ELECTRON VISUAL PARITY IS NOT CURRENTLY GUARANTEED
ON THE TAURI/LINUX STACK.
```

The current Linux implementation intentionally uses an opaque native window. This is a reliability decision based on repository history, not proof that transparent windows or backdrop blur are impossible.

Native transparency and backdrop blur were not runtime-tested in this audit. Universal impossibility is **not** claimed.

For the current supported Linux baseline, **Strategy C (opaque native window + simulated glass)** is the safest production choice because it is deterministic and already verified to work.

A transparent-window implementation (Strategy A or D) should only be considered after dedicated runtime testing on the target compositor and WebKitGTK environment.

---

## 8. Recommended Architecture

**Current baseline: Strategy C** — opaque native window + simulated glass.

Rationale:
- Deterministic — works the same way across all Linux environments.
- Already verified — the current production configuration uses this.
- Zero runtime detection complexity.
- Preserves MARK's visual identity through `rgba()` surfaces, gradients, and `box-shadow` glow effects.

**Future investigation (not recommended for production yet): Strategy D** — transparent native window with compositor-specific enhancement.

This remains **experimental**. It should only be pursued after:
1. A dedicated transparent-window minimal reproduction is built and tested.
2. The exact Linux desktop/compositor environment is recorded.
3. Native transparency is verified independently of backdrop blur.
4. Backdrop blur is verified independently of native transparency.
5. Results are reproduced consistently across multiple sessions.

---

## 9. Implementation

No production rendering changes in this PR. The audit is purely diagnostic.

If future investigation confirms Strategy D viability, the approach would be:
1. Keep opaque window as default (current behavior).
2. Add a dedicated, isolated transparent-window test to verify native transparency on the target compositor.
3. Separately verify `backdrop-filter` rendering through that transparent window.
4. Only then consider adding an optional transparent mode with capability detection.

---

## 10. Remaining Visual Differences (Recorded, Not Resolved)

- No desktop wallpaper visible behind the window (current configuration).
- No real backdrop blur on glass panels (current configuration).
- No vibrancy effect (not applicable to Linux).
- No runtime opacity slider (Electron feature, not implemented in Tauri).
- Simulated glass uses static gradients and shadows instead of live blur.

---

## 11. Evidence Corrections

The following overclaims were corrected from the earlier draft of this report:

| Overclaim | Correction |
|---|---|
| "NOT FEASIBLE on current Tauri/Linux stack" | Replaced with narrower verdict: exact parity not guaranteed, but universal impossibility is not claimed |
| Tests 3–6 marked as FAIL | Changed to UNVERIFIED — these were not runtime tested |
| "WebKitGTK cannot do backdrop blur" | Corrected to "not effective in current opaque configuration" |
| "Transparent WebView root: FAIL" | Corrected to "blocked by current opaque configuration" |
| "Platform Limitations (Proven)" | Renamed to "Platform Constraints and Unverified Areas" with explicit Unverified section |
| Commit `866d872` cited as proof of universal impossibility | Corrected to "historical experiment with rendering problems in the tested environment at that time" |
| Recommended automatic Strategy D enablement | Removed; Strategy D remains experimental until runtime evidence exists |
| "Next Steps" recommending capability detection implementation | Replaced with investigation steps that require runtime verification first |

---

## 12. Runtime Evidence Summary

| Category | Status |
|---|---|
| Opaque window + opaque HTML | Runtime verified |
| Opaque window + translucent HTML | Runtime verified |
| Transparent native window | Unverified |
| Transparent WebView root | Unverified |
| Backdrop blur through transparent window | Unverified |
| Compositor-specific behavior (X11/Wayland/GNOME/KDE) | Unverified |
| Historical transparency regression | Historically observed (commit `866d872`) |

---

## References

- [Electron BrowserWindow transparency docs](https://www.electronjs.org/docs/latest/api/browser-window#new-browserwindowoptions)
- [Tauri window configuration](https://tauri.studio/docs/api/js/window)
- [WebKitGTK backdrop-filter bug](https://bugs.webkit.org/show_bug.cgi?id=176742)
- Commit `866d872`: opaque window fallback introduction (historical reference only)

---
**Report generated by Claude Code (documentation only, no production changes).**
Runtime verification pending on GNOME/Wayland, KDE/X11, XFCE/no-compositor.
