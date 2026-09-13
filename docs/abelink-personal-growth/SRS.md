# Abelink Personal Growth & Execution Layer
# Software Requirements Specification

## 1. Functional Requirements

### FR-001 Goals
The system SHALL create, update, prioritize, pause, resume, and archive goals.

### FR-002 Objectives
The system SHALL decompose goals into measurable objectives and executable tasks.

### FR-003 Task Execution
The system SHALL track task state, dependencies, evidence, and completion conditions.

### FR-004 Evidence
Every meaningful completion MAY create evidence linked to a goal, task, and skill.

### FR-005 Skill State
The system SHALL maintain a skill state independent from task completion.

### FR-006 Transfer Testing
The system SHALL support independent and blind-transfer assessments.

### FR-007 Critic
The system SHALL evaluate user and agent behavior against declared objectives and available evidence.

### FR-008 Autonomy
The system SHALL classify actions by autonomy policy before execution.

### FR-009 Approval
Critical actions SHALL be routed to the existing Abelink approval boundary instead of allowing the AI model to self-approve.

### FR-010 Course Intelligence
The system SHALL store source, institution, cost, relevance, prerequisites, and confidence for recommendations.

### FR-011 Scholarship Intelligence
The system SHALL represent requirements, evidence, deadlines, sources, and unresolved unknowns.

### FR-012 Career Intelligence
The system SHALL connect skills to market opportunities and identify skill gaps.

### FR-013 Focus Policy
The system SHALL support restrictions and temporary access policies for configured applications.

### FR-014 Auditability
Important agent actions and policy decisions SHALL be auditable.

### FR-015 Modular Integration
The layer SHALL integrate through existing Abelink plugin, skill, capability, and tool boundaries where possible.

## 2. Non-Functional Requirements

### NFR-001 Modularity
The system SHALL NOT require invasive modifications to the Abelink core loop for domain feature additions.

### NFR-002 Privacy
Personal learning, career, and financial evidence SHALL remain local by default unless a user explicitly enables external processing or synchronization.

### NFR-003 Explainability
Recommendations SHALL expose evidence and rationale.

### NFR-004 Fail-Safe
Unverified or unsupported capabilities SHALL fail explicitly instead of returning false success.

### NFR-005 Reliability
Task state SHALL survive application restarts.

### NFR-006 Determinism
Policy evaluation for the same input SHALL produce deterministic outcomes unless explicitly marked as model-dependent.

### NFR-007 Testability
Every domain module SHALL provide unit tests for policy, state transitions, and core evaluation logic.

## 3. Data Requirements

Minimum entities:

```text
Goal
Objective
Task
Milestone
Skill
SkillEvidence
Assessment
EvidenceArtifact
LearningResource
Course
University
Program
Scholarship
Opportunity
FocusPolicy
ApprovalRequest
Critique
Outcome
```

## 4. Security Requirements

- Critical actions MUST use native approval boundaries.
- The model MUST NOT be able to approve its own high-risk action.
- Secrets MUST NOT be stored in skill or evidence documents.
- Financial integrations MUST use least privilege and explicit user authorization.
- Social/streaming automation MUST respect account ownership and platform policy.
- External research claims SHOULD retain source references and retrieval timestamps.

## 5. Acceptance Criteria

A release is acceptable when:

1. A user can define a goal and produce actionable tasks.
2. Task completion does not automatically mark a skill as mastered.
3. An independent assessment can downgrade skill confidence.
4. A blind transfer task can move a skill to fragile when transfer fails repeatedly.
5. Critical actions cannot bypass approval.
6. The critic can produce a concrete critique of at least one user behavior and one agent behavior.
7. State survives restart.
8. Tests cover goal/task/skill/policy transitions.
