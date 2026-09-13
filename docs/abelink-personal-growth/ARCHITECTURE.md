# Abelink Personal Growth & Execution Layer
# Architecture

## 1. Design Position

This layer is a **domain module**, not a rewrite of Abelink.

It must integrate with stable interfaces and avoid coupling itself to volatile internal file layout wherever possible.

```text
                 Abelink Core
                      │
                Tool / Skill / Plugin
                      │
             Personal Growth Layer
                      │
      ┌───────────────┼────────────────┐
      ↓               ↓                ↓
 Learning          Career          Governance
      │               │                │
      └───────────────┼────────────────┘
                      ↓
                Evidence / Skill
                      ↓
                    Critic
                      ↓
              Next Action / Plan
```

## 2. Integration Boundary

Prefer existing Abelink boundaries:

- skills registry
- capability manager
- sidecar channel registry
- Tauri bridge
- native approval path
- existing memory/database facilities
- browser and OS automation facilities

The current Abelink architecture already separates React frontend, Rust shell, and Bun sidecar, with OS-sensitive behavior crossing explicit boundaries. The Personal Growth layer should preserve that separation.

## 3. Suggested Module Layout

```text
personal-growth/
├── domain/
│   ├── goals/
│   ├── tasks/
│   ├── skills/
│   ├── assessments/
│   ├── evidence/
│   ├── career/
│   ├── education/
│   ├── governance/
│   └── critic/
├── policies/
├── adapters/
└── tests/
```

Exact repository paths should be chosen after inspecting the target branch and existing module boundaries. Do not assume this directory must literally be added to the repository root.

## 4. Domain Contracts

The module should communicate through typed, versioned contracts.

Example:

```json
{
  "schemaVersion": 1,
  "type": "skill.update",
  "skillId": "rust.http.server",
  "state": "transferable",
  "confidence": 0.81,
  "evidenceIds": ["ev_123", "ev_456"]
}
```

## 5. Critic Architecture

```text
Observation
 ↓
Evidence normalization
 ↓
Objective comparison
 ↓
Failure / inconsistency detection
 ↓
Critique
 ↓
Recommended correction
```

Critic should be able to critique:

- user avoidance
- shallow learning
- excessive AI dependence
- failure to transfer knowledge
- poor prioritization
- agent hallucination
- weak verification
- unnecessary complexity
- premature completion

## 6. Autonomy Architecture

```text
Task
 ↓
Risk classification
 ↓
Capability / reliability check
 ↓
Verification requirement
 ↓
User policy
 ↓
Autonomy decision
```

Possible results:

```text
AUTO
GUIDED
APPROVAL_REQUIRED
DENY
```

The final approval mechanism stays below the model in the execution boundary.

## 7. Focus Governance

The access governor should be implemented as a policy subsystem, not embedded into the learning engine.

```text
Application Event
 ↓
Policy lookup
 ↓
Current focus state
 ↓
Purpose / gate condition
 ↓
Verification
 ↓
Allow / deny / temporary allow
```

## 8. Data Flow

```text
Goal
 ↓
Planner
 ↓
Task
 ↓
Agent execution
 ↓
Verification
 ↓
Evidence
 ↓
Skill update
 ↓
Critic
 ↓
Next recommendation
```

## 9. Failure Handling

The layer SHALL distinguish:

- task failure
- tool failure
- model failure
- verification failure
- user failure
- evidence insufficiency
- external data uncertainty

Do not collapse all failures into a generic `failed` state.

## 10. Compatibility

The Personal Growth layer must be implementable against both the current `main` architecture and the ongoing refactor represented by PR #4 by relying on stable integration contracts rather than legacy module names.
