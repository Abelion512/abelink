// cli/core/protocol.ts — Minimal typed client-engine contract (Phase A1).
// Mendefinisikan perintah client, event stream mesin, dan tipe status sesi.

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type EngineCommandType =
  | 'run_task'
  | 'resume_session'
  | 'pause'
  | 'cancel'
  | 'send_input'
  | 'inspect_status'
  | 'subscribe_stream'

export interface TaskOptions {
  sessionId?: string
  workspace?: string
  workspaceRoot?: string
  provider?: string
  model?: string
  effort?: string
  maxTurns?: number
  maxSteps?: number
  disableTools?: boolean
  initialHistory?: Array<{ role: string; content: string }>
  [key: string]: unknown
}

export type EngineCommand =
  | { type: 'run_task'; payload: { prompt: string; options?: TaskOptions; sessionId?: string } }
  | { type: 'resume_session'; payload: { sessionId: string; input?: string; options?: TaskOptions } }
  | { type: 'pause'; payload: { sessionId: string; reason?: string } }
  | { type: 'cancel'; payload: { sessionId: string; reason?: string } }
  | { type: 'send_input'; payload: { sessionId: string; input: string } }
  | { type: 'inspect_status'; payload: { sessionId: string } }
  | { type: 'subscribe_stream'; payload: { sessionId: string; listener?: (event: EngineEvent) => void } }

export type EngineEventType =
  | 'session.started'
  | 'assistant.delta'
  | 'tool.started'
  | 'tool.result'
  | 'progress.updated'
  | 'verification.updated'
  | 'checkpoint.created'
  | 'checkpoint.failed'
  | 'session.paused'
  | 'session.completed'
  | 'session.failed'
  | 'session.cancelled'

export interface BaseEngineEvent {
  type: EngineEventType
  sessionId: string
  timestamp: number
}

export interface SessionStartedEvent extends BaseEngineEvent {
  type: 'session.started'
  prompt: string
  options?: TaskOptions
}

export interface AssistantDeltaEvent extends BaseEngineEvent {
  type: 'assistant.delta'
  delta: string
}

export interface ToolStartedEvent extends BaseEngineEvent {
  type: 'tool.started'
  tool: string
  query?: unknown
  step: number
}

export interface ToolResultEvent extends BaseEngineEvent {
  type: 'tool.result'
  tool: string
  ok: boolean
  result: string
  durationMs?: number
  step: number
}

export interface ProgressUpdatedEvent extends BaseEngineEvent {
  type: 'progress.updated'
  step: number
  decision?: unknown
  progress?: unknown
}

export interface VerificationUpdatedEvent extends BaseEngineEvent {
  type: 'verification.updated'
  verification: unknown
}

export interface CheckpointCreatedEvent extends BaseEngineEvent {
  type: 'checkpoint.created'
  checkpoint: unknown
}

export interface CheckpointFailedEvent extends BaseEngineEvent {
  type: 'checkpoint.failed'
  error: string
  reason?: string
}

export interface SessionPausedEvent extends BaseEngineEvent {
  type: 'session.paused'
  reason?: string
}

export interface SessionCompletedEvent extends BaseEngineEvent {
  type: 'session.completed'
  outcome: string
  reply: string
  stepCount: number
}

export interface SessionFailedEvent extends BaseEngineEvent {
  type: 'session.failed'
  error: string
  terminalReason?: string
}

export interface SessionCancelledEvent extends BaseEngineEvent {
  type: 'session.cancelled'
  reason?: string
}

export type EngineEvent =
  | SessionStartedEvent
  | AssistantDeltaEvent
  | ToolStartedEvent
  | ToolResultEvent
  | ProgressUpdatedEvent
  | VerificationUpdatedEvent
  | CheckpointCreatedEvent
  | CheckpointFailedEvent
  | SessionPausedEvent
  | SessionCompletedEvent
  | SessionFailedEvent
  | SessionCancelledEvent

export interface ProviderRuntimeConfig {
  provider?: string
  model?: string
  customEndpoint?: string
  apiKey?: string
  fetchTransport?: (payload: unknown, options?: unknown) => Promise<unknown>
}

export interface EngineSessionStatusInfo {
  sessionId: string
  status: SessionStatus
  stepCount: number
  checkpoint: unknown
  hasProviderRuntime: boolean
  provider: string | null
  model: string | null
}
