# Session 2026-09-21 — PR #45 Blocker: mini-eval graduation gate alignment

## Scope

Resolve the only real CI blocker on PR #45 (`feat/general-agentic-runtime`) and keep the
documentation for the changed invariant honest.

PR #45 was not redesigned. No planner, supervisor, provider, browser stack, memory system,
skill system, benchmark framework, or Rust approval/watchdog boundary was touched.

## Phase 0 — State audit (from live GitHub, not assumptions)

| Item | Value |
| --- | --- |
| PR | #45 `feat: general agentic runtime for long-horizon autonomy` |
| State | `OPEN`, `isDraft: false`, `reviewDecision: ""` (no review recorded) |
| Head / base | `f8af089` / `e6e63d9` (base branch `main`) |
| `mergeable` | `MERGEABLE` |
| `mergeStateStatus` | `UNSTABLE` |
| Merged | no (`mergedAt: null`) |
| Checks | `Frontend test + build (vitest, vite)` **fail**; `Benchmark smoke` pass; `Rust check` pass; `Gitleaks` pass; `Tolak PR yang menargetkan master` pass; Socket Security pass; `Bundle AppImage/deb` skipped |
| Reviews / threads | none returned |

Remote `main` is `e6e63d9`. The workspace's local `main` ref (`f985bd9`) is an ancestor of
`e6e63d9` and its remote-tracking ref was stale, so all diffs below use the real PR base.

**PR45_STATE = BLOCKED.**

## Failure mechanism

CI job `Frontend test + build (vitest, vite)` failed at step *Unit tests (vitest)*:

```
FAIL tests/skillMiniEval.test.mjs > evaluateAndGraduateSkill & sweepTrialSkills
  × evaluateAndGraduateSkill otomatis meluluskan skill trial yang lolos
    AssertionError: expected 'trial' to be 'active'
  × sweepTrialSkills meluluskan trial yang valid dan mengarsipkan yang kedaluwarsa
    AssertionError: expected [] to include 'valid-trial'
1 failed | 120 passed (121 files) — 2 failed | 1201 passed (1203 tests)
```

The lint step had already passed with `0 errors, 1004 warnings`. The failure blocked the
later steps of the same job (extension gate and `vite build` never ran).

Cause: commit `30f17959 feat(agent-runtime): require grounded evidence for skill promotion`
deliberately changed the trial-gate contract in `src/api/db.js`:

```js
// before
if (uses > 0 || evalPassed === true)                    // eval alone promoted
// after
if (uses > 0 || (evalPassed === true && existing.evidenceVerified === true))
```

PR #45 updated the test that owns that contract (`tests/learnedSkillsTelemetry.test.mjs`:
`evalPassed alone does not promote an unverified trial`, plus a new
`evalPassed promotes a trial when originating evidence was verified`), but
`tests/skillMiniEval.test.mjs` is pre-existing on `main`, is untouched by the PR, and still
asserted the **old** semantics through the `evaluateAndGraduateSkill` / `sweepTrialSkills`
entry points.

So the repository contained two mutually contradictory tests for one invariant, and only the
stale one ran against the new gate. This is a stale-test blocker, not a runtime regression:
the reuse path (`use_count > 0`) and the runtime caller
(`src/hooks/agent/plan/agentTools.js`) behave exactly as documented.

## Fix

Smallest coherent change: align the stale test with the contract the PR deliberately
established, and make the new gate explicit at the mini-eval entry point instead of only at
the `db.js` primitive.

`tests/skillMiniEval.test.mjs`:

- `evaluateAndGraduateSkill` graduation test now declares its evidence basis
  (`state: 'trial', evidenceVerified: true`) — the skill represents a trajectory that carried
  independent completion verification.
- Added `evaluateAndGraduateSkill tidak meluluskan trial yang belum terverifikasi`: a
  structurally valid but unverified trial keeps `state: 'trial'` even though
  `evalResult.evalPassed === true`. This guards the invariant through the mini-eval layer.
- `sweepTrialSkills` test now covers both branches: `valid-trial` (`evidenceVerified: true`)
  graduates, and the new `valid-unverified-trial` (same SOP quality, no verification) is
  asserted to stay in `remainingTrial` and out of `graduated`. The existing
  archived/remaining assertions for `old-trial` and `young-trial` are unchanged.

Test titles were updated to state the real condition ("terverifikasi") instead of implying
that a structural pass alone graduates a skill.

## Documentation

- `docs/ARCHITECTURE.md`: added `### Evidence-Grounded Skill Promotion` under the PR's
  `## 4. General Agentic Runtime Contract` section. It records the promotion rule, that
  `evidenceVerified` comes from session `verificationState` and is monotonic, that new skills
  are always `trial`, and that `evalPassed` alone must never be asserted as a promotion
  trigger.
- `docs/ARCHITECTURE.md`: fixed a duplicate heading number introduced by PR #45 — the new
  `## 4. General Agentic Runtime Contract` collided with the pre-existing
  `## 4. Alur Data Kritis`. Sections 4-11 were renumbered to 5-12. No `ARCHITECTURE.md`
  anchor or section-number reference exists elsewhere in the repository, so nothing else
  needed updating.

## Files changed

Phase A (the CI blocker):

- `tests/skillMiniEval.test.mjs`
- `docs/ARCHITECTURE.md`
- `docs/PLANNED/sessions/2026-09-21_pr45-mini-eval-gate-alignment.md`

Phase B (audit follow-up, see below):

- `src/api/ai/objectiveVerifier.js` — new pure predicate `isIndependentlyVerified`
- `src/api/ai/skillSynthesizer.js` — evidence derivation now uses that predicate
- `tests/objectiveVerifier.test.mjs` — predicate regression tests
- `tests/skillSynthesizerEvidence.test.mjs` — new provenance regression tests

Phase C (Defect 2 wiring, applied with a reviewable unified patch — see "Audit follow-up"):

- `src/hooks/agent/useAbelinkPlan.js` — the synthesizer call now forwards
  `verificationState: lastVerification` and `objectiveKind`
- `tests/skillSynthesizerEvidence.test.mjs` — caller-wiring regression tests
- `docs/ARCHITECTURE.md` — provenance chain and wiring status updated

## Audit follow-up (same session): evidence-provenance defects

A provenance audit of `evidenceVerified` was requested before delivery. It found two
concrete defects. Both are fixed, and both carry a regression test that provably fails
without the fix: the derivation defect in the synthesizer, and the call-site wiring that had
left the whole evidence branch inert in production.

### Defect 1 (FIXED): a verification *exemption* was readable as trusted evidence

`evaluateEvidence` (`src/api/ai/objectiveVerifier.js`) returns `VERIFIED` for a
**conversational** objective unconditionally — `criteria: []`, `evidence: { ops: 0 }`. That is
an exemption from verification (there is no external world to check), and completion is right
to accept it. But the synthesizer derived evidence as:

```js
verificationState === 'verified'      // old derivation
```

which cannot tell an exemption apart from real world-state proof. Any caller passing
`verificationState: 'verified'` for a chat-only session would mint a reusable skill with
`evidenceVerified: true`, and it would then graduate to `active` on structural eval alone —
exactly the "model/claim becomes trusted evidence" failure the PR sets out to prevent.

Fix: the module that owns the exemption now also owns the distinction.

- `objectiveVerifier.js` exports `isIndependentlyVerified({ verification, kind })`, true only
  when the state is `verified` **and** the kind is not `conversational`.
- `skillSynthesizer.synthesizeSkillAndSave` takes an explicit `objectiveKind` and derives
  `evidenceVerified` through that predicate. The model's final answer is not an input, so a
  confident claim can never influence the result.

Regression proof: with the guard temporarily reverted, `tests/skillSynthesizerEvidence.test.mjs`
fails with `AssertionError: expected true to be false` on
"conversational exemption does NOT become evidence". With the guard restored, all 4 tests pass.
That is the required demonstration that the test actually catches the defect.

### Defect 2 (FIXED): the contract was not wired end-to-end

`evidenceVerified` has exactly one producer (`skillSynthesizer.js`) and `synthesizeSkillAndSave`
has exactly one production caller: `src/hooks/agent/useAbelinkPlan.js` — the
`decision.should_learn` block in the FINAL branch (lines 1762-1772). That call passes only
`userPrompt`, `executedTools`, `finalAnswer`, and `thought`:

```js
synthesizeSkillAndSave({
  userPrompt: userInput || lastUserPromptRef.current || '',
  executedTools: executedToolsList,
  finalAnswer: decision.answer || '',
  thought: decision.thought || ''
  // verificationState / objectiveKind missing -> default 'not_run' / 'general'
})
```

So in production `evidenceVerified` could only ever be `false` before this fix. Consequence:
PR #45's headline
learning gate is **inert** — `evaluateAndGraduateSkill`'s verified branch is unreachable, no
production trajectory can unlock eval-based graduation, and skills graduate only through the
reuse path (`use_count > 0`). The same call site also never supplies `outcome`, so the
learning pack shown to the model always reads `Outcome: unknown` (cosmetic; it does not gate
anything). The values are in scope at that line: `lastVerification` is assigned two hundred
lines above from `evaluateEvidence`, and `objectiveKind` is used eleven lines above.

This is a wiring gap, not a semantics gap: the PR added the parameters and the grounded
learning pack that renders `Verification state:`, clearly intending the verdict to flow.

Applied change (5 insertions / 1 deletion) at that call site:

```diff
                   finalAnswer: decision.answer || '',
-                  thought: decision.thought || ''
+                  thought: decision.thought || '',
+                  // Grounding: verdict verifier + kind objective, keduanya sudah
+                  // ada di scope ini. Caller hanya meneruskan, bukan menurunkan.
+                  verificationState: lastVerification,
+                  objectiveKind
                 })
```

How it was applied despite the tool limit: the file is 2400 lines / 102123 bytes and this
workspace's file editor only exposes roughly the first 64 KB of a file to a patch (matched
text at line 1600 succeeds; at line 1750 and 1766 the tool reports "not found"). The call site
sits at byte 75924, beyond that window. Rather than fake the fix, re-derive the verdict, or
leave the chain inert, the change was written as a unified diff and applied with
`git apply --check` (dry run, no writes) followed by `git apply`, then verified four ways:

- `git apply --check` passed before anything was written, so a mismatch could not corrupt the
  file;
- the file-read path returns the edited region (no stale snapshot in the sync layer);
- `git diff` reports exactly 5 insertions / 1 deletion at that site and nothing else in the
  file;
- the targeted tests, full unit suite, and lint all pass afterwards.

A reviewable patch was preferred over a silent shell edit for exactly that reason: it is
visible in `git diff` and self-verifying before it writes. The alternatives were still
rejected as worse than a patch:

- re-deriving the verdict inside the synthesizer from `userPrompt` + `executedTools` would
  re-classify the objective without the session's hints (a tools-disabled or forced
  conversational session could be re-read as `file`/`code` and wrongly count as verified) and
  would duplicate authoritative runtime state;
- a module-level "last verdict" registry would be a second source of truth and could attribute
  one session's verdict to another under concurrent sub-agents.

The same patch mechanism also removed a duplicated, truncated tail that an earlier tool call
in this session had appended to `tests/skillSynthesizerEvidence.test.mjs`; the final file was
re-checked to hold exactly one copy of each `describe` block. `docs/ARCHITECTURE.md` now
records the wiring as live instead of as a known gap.

## Verification performed locally

Run from the project root on the PR #45 branch (`f8af089` + these edits), reproducing the
exact CI commands:

| Step | Command | Result |
| --- | --- | --- |
| Pre-fix reproduction | `bunx vitest run tests/skillMiniEval.test.mjs` | 2 failed (matches CI exactly) |
| Targeted | `bunx vitest run tests/skillMiniEval.test.mjs tests/learnedSkillsTelemetry.test.mjs` | 22 passed |
| Full unit suite | `bunx vitest run` | 121 files passed, 1204 tests passed |
| Lint | `bun run lint` | exit 0, 0 errors, 1004 warnings (unchanged from CI baseline) |
| Extension gate | `bunx vitest run tests/browser-e2e.test.mjs tests/native-host.test.mjs tests/browser-flavor.test.mjs` | 42 passed |
| Frontend build | `bun run build` (`vite build`) | built successfully in 20.36s |
| Audit: predicated + provenance | `bunx vitest run tests/skillSynthesizerEvidence.test.mjs tests/objectiveVerifier.test.mjs tests/learnedSkillsTelemetry.test.mjs tests/skillMiniEval.test.mjs` | 4 files / 101 tests passed |
| Audit: negative control | same synthesizer test with the guard reverted | 1 failed (`expected true to be false`), 3 passed |
| Wiring: targeted | `bunx vitest run tests/skillSynthesizerEvidence.test.mjs tests/skillMiniEval.test.mjs tests/objectiveVerifier.test.mjs tests/learnedSkillsTelemetry.test.mjs` | 4 files / 103 tests passed |
| Wiring: negative control | the new regex assertions run in-memory against the call site with the two forwarded lines stripped | wiring assertions true -> false, so the test is discriminating |
| Wiring: full suite | `bunx vitest run` | 122 files / 1215 tests passed |
| Wiring: lint | `bun run lint` | exit 0, 0 errors, 1004 warnings (baseline unchanged) |

Final state on this branch: **122 files / 1215 tests passed**, lint exit 0 with the unchanged
1004-warning baseline. The count moved 1203 (2 failing) -> 1204 (Phase A guard test) -> 1213
(Phase B: 5 predicate tests + 4 provenance tests) -> 1215 (Phase C: 2 caller-wiring tests).

## What could not be verified

- No CI run has executed against the fixed head; the table above is a local reproduction of
  the same commands, not a GitHub Actions result. CI status must be re-read after push.
- The caller-wiring tests pin the forwarded properties in the production source; they do not
  execute the hook (this repository has no React render harness for `useAbelinkPlan`, whose
  other tests exercise logic exported from it instead). The synthesizer half of the chain is
  executed against real Dexie in `tests/skillSynthesizerEvidence.test.mjs`.
- The `outcome` argument is still not forwarded at that call site, so the learning pack shown
  to the model keeps reading `Outcome: unknown`. That is cosmetic (it gates nothing) and was
  left alone to keep this change to the documented wiring defect.
- No review approval exists on PR #45 (`reviewDecision` empty), so PR #45 is not "reviewed
  clean" regardless of CI.
- No Rust job was re-run locally: the PR touches no Rust file and `Rust check` already passed
  on the previous head.
- `Benchmark smoke` already passed on the previous head and no benchmark file was touched.

## Explicitly not claimed

- PR #45 is not claimed as merged, reviewed, or runtime-improved.
- No comparative main-vs-PR#45 measurement exists, so no runtime improvement is claimed.
- PR #46 was not started: the documented sequencing requires PR #45 merged into `main`
  first, and PR #45 is still open.

## Next gate

1. Push to `feat/general-agentic-runtime`, then confirm the `Frontend test + build (vitest,
   vite)` job turns green and no new check fails at the new head.
2. Re-read the check status for that head from GitHub: a local reproduction of the same
   commands is not a CI result.

Only after PR #45 is reviewed and merged into `main` may PR #46
(`feat/typed-evidence-plane-agent-benchmark-matrix`) be created from `main`.

PR #45 is not ready, not reviewed, and not merged as of this session. No comparative
main-vs-PR#45 run exists, so no runtime improvement is claimed.
