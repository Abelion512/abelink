            })

            // Trajectory Supervisor: record the attempt, maybe stage a hint.
            // Runs only on real executions (the identical-repeat cache above
            // already `continue`s before this point). Additive: guarded so a
            // supervisor fault can never break the tool loop.
            if (supervisor) {
              try {
                // Thin supervisor: Fase 1 fields only. hintText still flows
                // only through the existing pendingSupervisorHint
                // staged-observation path.
                const toolSuccess = !String(execResult.resultString || '').startsWith('[ERROR]')
                const supResult = supervisor.update({
                  tool,
                  query,
                  success: toolSuccess,
                  verificationState: lastVerification,
                  observation: execResult.resultString || '',
                  result: execResult.resultString || '',
                  stepsLeft: maxPlanSteps - stepCount,
                  verifyGateActive: pendingVerifyObservation != null
                })
                if (supResult.hintText && !pendingSupervisorHint) {
                  pendingSupervisorHint = supResult.hintText
                  try {
                    trajectoryLogStep({
                      step: stepCount,
                      total: maxPlanSteps,
                      description: `supervisor:${supResult.directive}`,
                      status: 'supervisor-directive'
                    })