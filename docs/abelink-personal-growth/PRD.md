# Abelink Personal Growth & Execution Layer

## 1. Product Definition

A modular, pluggable domain layer for Abelink that turns personal goals into verified learning, execution, evidence, and real-world outcomes.

```text
Goal
 ↓
Diagnosis
 ↓
Prioritization
 ↓
Plan
 ↓
Execute
 ↓
Verify
 ↓
Learn
 ↓
Transfer Test
 ↓
Evidence
 ↓
Outcome
 ↓
Critic
 ↓
Next Action
```

## 2. Problem

Abelink can execute tasks, but execution alone does not prove that the user acquired a capability or produced useful outcomes. The system needs a persistent layer that connects actions to skills, evidence, education, career, and income outcomes.

The user can focus deeply when motivated, so the product must not reduce the problem to timers or reminders. It should reduce the gap between intent and action, protect momentum, and challenge avoidance.

## 3. Goals

- Help the user complete current S1 priorities.
- Convert learning into transferable capability.
- Track meaningful evidence instead of vanity activity.
- Connect skills to market demand and remote income opportunities.
- Support S2 and government scholarship planning.
- Discover and rank high-value courses, prioritizing free options and reputable institutions.
- Govern social and streaming access using user-defined policy.
- Let Abelink execute work while preserving human approval at important boundaries.
- Provide independent assessment and blind transfer tests.
- Maintain a self-critical loop for both user and agent.
- Remain modular and pluggable.

## 4. Non-Goals

- Rewriting Abelink core architecture.
- Replacing the existing agent runtime.
- Building a generic social network.
- Building a generic LMS.
- Automatic academic submission without explicit approval.
- Automatic financial transactions.
- Treating AI task completion as proof of user mastery.

## 5. Primary User Journey

```text
User declares goal
 ↓
Abelink questions relevance / scope
 ↓
Research + context gathering
 ↓
Generate plan
 ↓
User approves important plan changes
 ↓
Abelink executes routine work
 ↓
User performs required learning checkpoints
 ↓
Independent / transfer assessment
 ↓
Evidence recorded
 ↓
Skill state updated
 ↓
Critic reviews user + agent
 ↓
Next action generated
```

## 6. Core Modules

### 6.1 Goal & Objective Manager

Stores goals, priority, time horizon, rationale, and success criteria.

### 6.2 Task Intelligence

Transforms objectives into executable tasks and milestones.

### 6.3 Learning Engine

Maps tasks to concepts, prerequisites, learning resources, practice, and transfer tests.

### 6.4 Skill Model

Tracks skill states:

```text
Unknown
Exposed
Practiced
Applied
Transferable
Mastered
Fragile
```

### 6.5 Evidence Ledger

Records meaningful outputs such as:

- completed assignment
- project milestone
- code contribution
- release
- portfolio artifact
- research artifact
- certificate
- client work
- verified income result

### 6.6 Career Intelligence

Connects current skills to market demand, skill gaps, projects, and remote opportunities.

### 6.7 Education & Scholarship Intelligence

Tracks target universities, programs, requirements, scholarship opportunities, deadlines, evidence, gaps, and required actions.

### 6.8 Course Intelligence

Ranks courses using institution quality, curriculum, instructor, difficulty, practical value, prerequisites, freshness, relevance, language, certificate value, and cost.

### 6.9 Focus & Access Governor

Applies user policy to social and streaming applications.

Example:

```text
Focus Mode ON
 ↓
App restricted
 ↓
User requests access
 ↓
Purpose requested
 ↓
Required action verified
 ↓
Temporary access
 ↓
Auto-lock
```

### 6.10 Critic

Evaluates both user and agent behavior.

### 6.11 Autonomy Manager

Determines whether a task can be autonomous, guided, or approval-gated based on capability, reliability, risk, verification, and user policy.

## 7. AI Assistance Policy

AI may research, reason, code, execute, test, debug, and provide reference implementations.

Important actions and final submissions require human approval.

Learning mode may permit full AI execution while still requiring the user to inspect, understand, reproduce, modify, or independently solve related tasks.

## 8. Assessment Modes

- Assisted
- Guided
- Independent
- Blind Transfer

A skill should not be marked mastered merely because an AI agent completed a task successfully.

## 9. Success Metrics

### Learning

- transfer-test performance
- independent-task performance
- fragile-skill reduction
- retained capability over time

### Execution

- goal-to-action conversion
- completed meaningful tasks
- abandoned task rate
- time from intent to first action

### Output

- real artifacts produced
- portfolio evidence
- completed coursework
- shipped projects
- research evidence

### Career

- skill-to-opportunity matches
- applications submitted with approval
- interviews / freelance opportunities
- earned income

### Education

- requirement coverage
- scholarship readiness
- prerequisite completion
- evidence quality

## 10. MVP

MVP should begin with:

1. Goals
2. Objective decomposition
3. Task execution tracking
4. Skill/evidence ledger
5. Independent assessment
6. Critic feedback
7. Basic focus policy
8. Plugin/skill boundary integration

Career and scholarship intelligence can initially be delivered through existing Abelink research capabilities instead of duplicating them.

## 11. Principles

- Evidence over claims.
- Capability over completion.
- Output over activity.
- Critical thinking over praise.
- Approval at meaningful boundaries.
- Modular over invasive.
- Explicit uncertainty over fake precision.
