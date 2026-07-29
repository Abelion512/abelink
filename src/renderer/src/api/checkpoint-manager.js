// Checkpoint Manager
// Based on: LangGraph Checkpointer + interrupt/resume pattern
// Source: https://docs.langchain.com/oss/python/langgraph/interrupts
// https://docs.langchain.com/oss/python/langgraph/checkpointers
//
// Checkpointer saves graph state at each super-step, organized by thread ID.
// Thread ID = pointer to specific conversation state.
// Resume from any checkpoint.

import { getAutonomousTask, updateAutonomousTask } from './db'

const CHECKPOINT_INTERVAL = 5 // every 5 tool calls
const MAX_CHECKPOINT_MESSAGES = 20 // last 20 messages only

export function createCheckpoint(stepCount, loopMessages, failureCounters, lastDecision) {
  return {
    loopMessages: (loopMessages || []).slice(-MAX_CHECKPOINT_MESSAGES),
    stepCount: stepCount || 0,
    failureCounters: failureCounters ? { ...failureCounters } : {},
    lastDecision: lastDecision ? { ...lastDecision } : null,
    timestamp: Date.now(),
  }
}

export async function saveCheckpoint(taskId, checkpoint) {
  if (!taskId) return
  try {
    await updateAutonomousTask(taskId, {
      checkpoint,
      updatedAt: Date.now(),
    })
  } catch (e) {
    console.error('[Checkpoint] Save failed:', e)
  }
}

export function shouldCheckpoint(stepCount, lastCheckpointStep) {
  return stepCount - (lastCheckpointStep || 0) >= CHECKPOINT_INTERVAL
}

export async function loadCheckpoint(taskId) {
  if (!taskId) return null
  try {
    const task = await getAutonomousTask(taskId)
    return task?.checkpoint || null
  } catch (e) {
    console.error('[Checkpoint] Load failed:', e)
    return null
  }
}

export function resumeFromCheckpoint(checkpoint, target) {
  if (!checkpoint) return

  if (target.loopMessages && checkpoint.loopMessages) {
    target.loopMessages = checkpoint.loopMessages
  }
  if (target.stepCount !== undefined) {
    target.stepCount = checkpoint.stepCount || 0
  }
  if (target.failureCounters && checkpoint.failureCounters) {
    target.failureCounters = { ...checkpoint.failureCounters }
  }
  if (target.lastDecision !== undefined) {
    target.lastDecision = checkpoint.lastDecision || null
  }
}
