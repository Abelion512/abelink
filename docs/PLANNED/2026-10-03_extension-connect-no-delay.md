# PLAN: extension connect without delay (investigation + fix proposal)

- Date: 2026-10-03
- Status: PLAN ONLY — no code changed in this task
- Owner direction: §16 handoff, item 5c — "PLAN fix extension connect tanpa delay"
  (`docs/PLANNED/sessions/2026-10-02_handoff-sesi-ratchet-any.md:238-243`)
- Scope: handshake path `extension connect` between sidecar bridge
  (`sidecar/main/browser/`) and MV3 extension (`extension/src/background.ts`)
  over `127.0.0.1:49712/49713`

## 1. 5W1H of the delay

### What

"Extension connect" = the interval from a connect trigger (user clicks
Connect in the popup, `browser:*` tool call with no live session, browser
cold start, or service-worker wake) until the first successful
`GET /abelink-bridge/handshake` (HTTP 200) followed by a live `/poll`
long-poll loop. There is **no measured latency number anywhere in the
repo**: no timing log, no metric, no harness event records handshake
duration. Every statement below is code-traced (file:line cited), not
measured. The verification plan in §4 exists precisely to produce the
first measurement.

### Where (handshake path, end to end)

Connect trigger sidecar-side:

1. Tool path: `sidecar/main/tools/browserTools.ts:77-115` (`ensureExtensionUp`)
   calls `launcher.ensureBrowserUp()` at `browserTools.ts:98-104`.
2. Reconnect-button path: `sidecar/engine/channels/browser.ts:197-235`
   (`browser:reconnect`) sweeps dead sessions (`bridge-core.ts:570-584`),
   then calls `launcher.ensureBrowserUp()` at `browser.ts:223-229`.
3. `ensureBrowserUp` (`sidecar/main/browser/launcher.ts:121-149`) first does
   an instant zero-timeout connected check (`launcher.ts:139`,
   `timeoutMs: 0`), then `throttledLaunch` (`launcher.ts:152-201`):
   `openInOsBrowser` via `xdg-open` (`launcher.ts:59-63`), then
   `waitForConnected` polling `listSessions()` every `LAUNCH_POLL_MS = 500`
   ms up to `LAUNCH_WAIT_MS = 20000` ms (`launcher.ts:17-18`, `68-115`).
4. HTTP transport: `sidecar/main/browser/server.ts:108-179` (`route`).
   Handshake endpoint at `server.ts:124-130` delegates to
   `handshake(sessionId, token)` in `sidecar/main/browser/bridge-core.ts:268-279`.

Connect trigger extension-side (`extension/src/background.ts`):

5. Explicit start: popup `start` message handler at `background.ts:1608-1711`
   resolves token in order manual-paste > native-host helper > per-port
   store (`background.ts:1609-1630`), verifies with one `handshake` GET
   (`background.ts:1646`), one automatic retry on `token-stale`
   (`background.ts:1651-1660`), then enters `loop()`.
6. Implicit resume: `tryAutoResume()` at `background.ts:1865-1992`, invoked
   from worker load (`background.ts:2062`), `onStartup`
   (`background.ts:2011-2013`), `abelink-bridge-resume` one-shot alarm and
   `abelink-bridge-keepalive` 1-minute alarm
   (`background.ts:1994-2009`, keepalive created at `background.ts:2008`).
7. Poll loop: `loop()` at `background.ts:183-255`; idle backoff
   `POLL_BACKOFF_MS = 1500` ms (`background.ts:73`, applied at
   `background.ts:243,247`).

### When (delay components, ranked hypotheses)

Static reading cannot apportion the delay between these components — no
timer exists on either side. Ranked by code-traced cost:

- **H1 — serial native-host token probes (most likely dominant).**
  `getPairing()` with no pinned pairing probes dev first, then prod, each
  via `getTokenViaNativeHost()` → one `chrome.runtime.sendNativeMessage`
  = one helper **process spawn** (`background.ts:44-56`, spawn at
  `background.ts:277`). `getCfg()` calls `getPairing()` on **every**
  invocation (`background.ts:89-97`), and `loop()` calls `getCfg()` every
  iteration (`background.ts:190`). So an unpaired cold connect pays up to
  two sequential process spawns before the first handshake GET, and every
  loop iteration re-pays the pairing check. The loop's 401 path additionally
  retries the helper **twice with `sleep(2000)` between attempts**
  (`background.ts:212-226`): +2 s floor plus two more spawns.
- **H2 — browser cold start inside the 20 s bounded wait.**
  `throttledLaunch` opens the OS default browser (`launcher.ts:188-190`)
  and `waitForConnected` polls every 500 ms for up to 20 s
  (`launcher.ts:17-18`). Browser process start + extension service-worker
  boot + first handshake all consume this budget. Per-poll cost is trivial
  (in-process `listSessions()`); the budget itself is the delay whenever the
  browser was closed.
- **H3 — service-worker suspend gap.**
  MV3 workers are terminated after ~30 s idle and woken by alarms, not by
  `setTimeout` — the code itself documents this at `background.ts:1816-1817`.
  Reconnect therefore waits for the next `abelink-bridge-keepalive` tick
  (period 1 minute, `background.ts:2008`) or the resume backoff ladder
  5 s → 10 s → 20 s → 30 s cap (`background.ts:1804-1814`,
  `resumeDelayMs` at `background.ts:1812-1814`). Reference:
  https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics
  (extension service-worker lifecycle; alarms as the wake mechanism, also
  noted in-repo at
  `docs/PLANNED/sessions/2026-10-02_handoff-sesi-ratchet-any.md:236`).
- **H4 — no-pairing full backoff on a non-network condition.**
  `tryAutoResume` without pairing pins `resumeFailCount = 3` (max backoff)
  and reschedules (`background.ts:1886-1896`): a fresh profile that never
  paired waits the maximum 30 s between attempts even though the condition
  needs user action, not time.
- **H5 (weak, listed for completeness) — one-time sidecar start cost.**
  `startBrowserBridge` writes the token file and dynamic-imports
  `native-host.ts` (`server.ts:246-262`). One-time per process, file I/O
  only; unlikely to dominate but unmeasured.

Explicitly **not** delay sources (ruled out by reading):

- `checkOrigin()` (`server.ts:95-106`): synchronous string compare, no I/O.
- Long-poll timeout `POLL_TIMEOUT_MS = 25000` (`bridge-core.ts:31`):
  handshake is a direct GET (`server.ts:124-130`), never routed through
  `takeNext()` (`bridge-core.ts:302-325`); the 25 s only bounds idle polls.
- `COMMAND_TIMEOUT_MS = 90000` (`bridge-core.ts:33`): bounds command
  dispatch (`bridge-core.ts:399-409`), not connect.
- `probePorts()` 3 s abort (`background.ts:137`): popup-only diagnostic
  path, not on the connect path.
- Token rotation (`bridge-core.ts:547-567`): runs inside an already-valid
  handshake (`bridge-core.ts:274-277`), adds no round trip.

### Why

Architectural, not a single bug: the connect path was built for correctness
(fail-fast, honest errors, no fake success — `browser.ts:1-18`) with each
recovery step added serially (G1 fix `background.ts:1948-1954`, E1/E2 token
handling `background.ts:1647-1672`). Nobody ever put a clock on it, so
serial helper spawns, a 20 s browser-start budget, and a 5→30 s resume
ladder stack additively with no visibility into which dominates.

### How (reproduction sketch, no code change)

1. Quit the browser completely (no running extension worker).
2. Trigger any `browser:*` channel (or click Connect with no pairing).
3. Observe wall time until first command executes: expected components are
   H2 (browser cold start, seconds) + H1 (helper spawns, only if token
   helper involved) + H3/H4 (if worker was suspended rather than absent).

## 2. Proposed fix (exact locations, implementation task)

All items keep §3 frozen zones intact. Ordered by expected payoff:

1. **Parallelize pairing probes** (`background.ts:44-56`): replace serial
   `await devToken` then `await prodToken` with one `Promise.all`. Worst
   case drops from 2 sequential helper spawns to 1. No wire/protocol
   change; pairing shape unchanged.
2. **Fast path in `getCfg()`** (`background.ts:89-97`): when
   `chrome.storage.session` already holds a port, skip `getPairing()` (and
   its native-host probes) entirely; only consult pairing when no port is
   stored. Kills the per-loop-iteration probe cost from H1.
3. **Single helper attempt in the loop 401 path** (`background.ts:212-226`):
   remove the second `getTokenViaNativeHost` + `sleep(2000)` retry; on
   failure go straight to `scheduleAutoResume()`, which already retries on
   backoff. Saves a guaranteed 2 s + one spawn per 401 episode.
4. **Do not max out backoff for needs-user-action states**
   (`background.ts:1893`): `resumeFailCount = 3` is correct to avoid 5 s
   worker wakeups, but write the `notice` distinction already present
   (`background.ts:1841-1854`) — no timing change proposed here, only keep
   the honest-status behavior while fixing H1–H3 first and re-measuring.
5. **Sidecar: keep `LAUNCH_WAIT_MS = 20000` / `LAUNCH_POLL_MS = 500`**
   (`launcher.ts:17-18`) unchanged initially — 500 ms granularity is not the
   bottleneck; the bottleneck is what happens *inside* the budget (H2). Only
   tighten after measurement proves poll granularity matters.
6. **Instrumentation first (prerequisite to 1–5 proving anything)** — add
   timestamp marks (both sides, no token/header values in logs; see
   `redactHeaders` reuse in §3):
   - extension: `performance.now()` at `start`/`tryAutoResume` entry, before
     and after each `getTokenViaNativeHost` call, at handshake request and
     at HTTP 200 (`background.ts:1608, 1865, 268-288, 1646, 1932`).
   - sidecar: `Date.now()` at `ensureBrowserUp` entry, `xdg-open` return,
     each `waitForConnected` hit, handshake handler entry
     (`launcher.ts:121, 188, 190; server.ts:124`).
   - Emit via existing channels: sidecar console `[BrowserBridge]` line
     (`server.ts:249-251`) and extension `console.log` mini-dashboard
     convention (`background.ts:84-86`).

## 3. Risks + frozen zones untouched

Frozen (must not change in the implementation PR):

- Ports `49712` (prod) / `49713` (dev): `BROWSER_BRIDGE.PORT` default
  (`bridge-core.ts:27`), `KNOWN_PORTS` (`background.ts:17`),
  `FLAVOR_PORTS` (`background.ts:21`).
- `HOST: '127.0.0.1'` (`bridge-core.ts:28`); bind call
  (`server.ts:233`).
- `checkOrigin()` (`server.ts:95-106`): extension-ID equality + `sec-fetch-site`
  guard stay byte-identical.
- Wire frame: `/abelink-bridge/handshake?session=&token=`,
  `/poll?session=&token=`, `POST /result`, token-in-query contract
  (`server.ts:108-179`, `background.ts:164-180`); `handshake()` response
  shape `{ ok, pollTimeoutMs, newToken? }` (`bridge-core.ts:272-278`).
- Reuse, do not rewrite: `HOST`, `checkOrigin()`, and `redactHeaders()`
  (`sidecar/main/capabilities/mcp-client.ts:15`). Note of fact: no
  `redact`-like helper exists in `sidecar/main/browser/` (grep for `redact`
  there returns nothing) — so "reuse" concretely means the new timing logs
  from §2 item 6 must pass through `redactHeaders`-style treatment, i.e.
  never log `token` query values or raw headers; log durations and status
  codes only.

Risks:

- Parallel probes (item 1) spawn two helper processes at once instead of
  one; negligible (short-lived), but on very slow disks could contend —
  re-measure, revert to serial if worse.
- `getCfg` fast path (item 2) must still respect explicit flavor switches
  (popup port change → `setPairing` at `background.ts:1705` writes storage,
  so the stored-port fast path follows the switch; verify with a
  prod↔dev toggle test).
- Removing the second 401 helper retry (item 3) trades one rare recovery
  (helper slow to appear, >0 s but <2 s after first attempt) for the common
  2 s saving; the backoff reschedule still recovers, just one ladder step
  later.
- Chrome may clamp `periodInMinutes: 1` keepalive (`background.ts:2008`):
  do not attempt sub-minute keepalive as a "fix" for H3 — verify clamp
  behavior first; waking the worker more often burns battery for a
  local-bridge use case.

## 4. Verification plan (how to prove the delay is gone)

1. **Baseline first**: with instrumentation (§2 item 6) merged, record 5
   cold connects (browser quit → `browser:reconnect`) and 5 warm resumes
   (worker suspended → automatic) from both log sources; tabulate
   per-component durations (helper-spawn ms, browser-start ms,
   backoff-wait ms, handshake RTT ms). No baseline, no claim.
2. **Acceptance**: median cold-connect wall time reduced vs baseline with
   per-component attribution showing which hypothesis paid off; warm resume
   bounded by one backoff step, not stacked retries. Report numbers in the
   implementation PR, not adjectives.
3. **Log/timing to check**:
   - sidecar stdout `[BrowserBridge] listening…` (`server.ts:249-251`)
     plus new timing marks;
   - extension service-worker console `[Abelink]` lines
     (`background.ts:86, 1943, 1973, 2008-area`);
   - popup `ports` probe output (`background.ts:1782`) for reachability vs
     auth distinction during the window.
4. **Regression**: existing browser bridge tests + manual prod↔dev toggle
   (item 2 risk); confirm 401 `token-stale` auto-recovery still works in one
   attempt (`background.ts:1651-1660`, `1955-1981`).
5. Corrupt-char scan on any new/edited file must be empty (gate carried over
   from this task); `git status` of the implementation PR must show only
   intended files.
