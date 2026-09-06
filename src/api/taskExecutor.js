import { getAgentTaskContentHash, validateAgentTaskStepOutput } from './taskStore'
import { evaluateEvidence, VERIFICATION_STATE } from './ai/objectiveVerifier'

// Executor helper: menentukan hasil checkpoint; eksekusi tool tetap berada di
// ReAct loop utama.
//
// Checkpoint = MODEL_CLAIM (output step) + SYSTEM VERIFICATION (evidence).
// Deliverable claims diuji dengan bukti dunia nyata, bukan panjang teks saja:
//   - Step dengan artifactPath: write sukses ATAU read-back sukses = pass.
//   - Step lain: konten cukup + eksekusi tool terakhir tidak gagal.
// Evidence (tools/observations) opsional — bila tidak tersedia, perilaku
// validasi dasar lama tetap berlaku (backward compatible).
export function buildDurableStepCheckpoint(step, output, maxRetries = 2, evidenceInput = null) {
  const validation = validateAgentTaskStepOutput(step, output)
  const attempts = step?.attempts || 0
  const canRetry = !validation.isComplete && attempts < maxRetries + 1

  let verification = null
  if (evidenceInput) {
    try {
      const evidence = evaluateEvidence({
        objectiveText: step?.deliverable || step?.objective || step?.title || '',
        answer: output,
        tools: evidenceInput.tools || [],
        observations: evidenceInput.observations || []
      })
      verification = {
        state: evidence.state,
        kind: evidence.kind,
        criteria: evidence.criteria
      }
      if (evidence.state === VERIFICATION_STATE.FAILED) {
        validation.isComplete = false
        validation.score = 0
        validation.missingRequirements = [
          ...new Set([
            ...validation.missingRequirements,
            ...evidence.criteria.filter((c) => c.state === 'fail').map((c) => c.label)
          ])
        ]
        validation.notes =
          'Verifikasi world-state gagal: bukti eksekusi menunjukkan kegagalan (verify-failed).'
      }
    } catch (e) {
      // Additive layer: verifier error tidak boleh menggagalkan checkpoint.
      console.warn('[taskExecutor] objectiveVerifier error:', e?.message)
    }
  }

  return {
    status: validation.isComplete ? 'completed' : canRetry ? 'needs_revision' : 'failed',
    outputSummary: String(output || '').slice(0, 1200),
    contentHash: getAgentTaskContentHash(output),
    artifactPath: step?.artifactPath || null,
    validation,
    verification,
    error: validation.isComplete || canRetry ? null : 'Validasi step gagal setelah batas retry.',
    canRetry
  }
}
