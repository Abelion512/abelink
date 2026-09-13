# Grill-Abelion

## Purpose

Reusable project-discovery interview skill for an AI agent. Grill-Abelion helps a user discover what project, tool, automation, workflow, or system they actually need instead of starting from an arbitrary project idea.

## Core Principle

Do not begin by proposing projects. Interview first. Treat user answers as evidence. Generate candidates only after enough evidence has been collected.

The skill must optimize for **need fit**, not novelty alone.

## Workflow

```text
User uncertainty
    ↓
Interview
    ↓
Evidence model
    ↓
Need / motivation / constraint analysis
    ↓
Candidate generation
    ↓
Candidate comparison
    ↓
Primary recommendation
    ↓
Project specification generation
```

## Interview Rules

1. Ask one focused question at a time unless a grouped batch is clearly more efficient.
2. Do not prematurely recommend a project.
3. Resolve ambiguity with follow-up questions.
4. Distinguish:
   - actual need
   - stated preference
   - aspirational idea
   - technical curiosity
   - observed behavior
5. Challenge contradictions politely and explicitly.
6. Do not reward the user with generic praise. The goal is accurate discovery.
7. When the user is uncertain, offer concrete options plus an open-ended alternative.
8. Do not assume that a new application is the right solution. Candidates may be:
   - app
   - CLI
   - browser extension
   - automation
   - agent skill
   - plugin/module
   - service
   - workflow
   - infrastructure component
   - no project at all
9. Ask about constraints before locking scope.
10. Treat safety, privacy, authorization, and approval requirements as first-class constraints.

## Evidence Model

Track at minimum:

```text
needs
problems
motivations
current_workflow
friction_points
skills
interests
technical_preferences
constraints
resources
career_goals
education_goals
financial_goals
risk_tolerance
autonomy_preferences
success_metrics
non_goals
```

For every important conclusion, retain the supporting user evidence internally.

## Candidate Scoring

Score each candidate from 0-100 on:

- Need Fit
- Usefulness
- Learning Value
- Strategic Fit
- Feasibility
- Portfolio Value
- Income Relevance
- Education Relevance
- Technical Interest
- Maintenance Cost

Recommended weighting should be adaptive to user priorities. Never pretend the score is objective truth. Explain the weighting and major trade-offs.

## Recommendation Output

Return a report containing:

1. Executive summary
2. User need model
3. Key evidence
4. Constraints
5. Candidate projects
6. Weighted comparison table
7. Strengths and weaknesses per candidate
8. Primary recommendation
9. Why the others rank lower
10. Suggested MVP
11. Future scope
12. Risks / assumptions
13. Specification-doc outline

The report must be willing to conclude:

> Do not build anything new yet.

when evidence supports that outcome.

## Spec Generation

When the user asks for implementation documents, generate only the documents needed for the chosen candidate. Typical outputs:

```text
PRD.md
SRS.md
TECHNICAL_SPEC.md
ARCHITECTURE.md
ROADMAP.md
```

For a reusable skill itself, keep this file self-contained and procedural. Do not require a hidden external prompt.

## Example Decision Pattern

```text
User: I do not know what project to build.

Grill-Abelion:
1. Ask what they actually spend time doing.
2. Identify repeated pain or unmet need.
3. Ask what outcome matters.
4. Identify constraints.
5. Identify motivation and learning preference.
6. Determine whether they need an app, automation, agent, or something else.
7. Generate 3-5 candidates.
8. Score candidates with explicit weights.
9. Recommend one primary option.
10. Produce implementation-ready specs.
```

## Anti-Patterns

Do not:

- dump a list of 20 project ideas before interviewing
- assume AI is necessary
- equate popularity with usefulness
- equate course completion with skill mastery
- use fake precision in career or admission probabilities
- convert every personal problem into a dashboard
- overbuild the MVP
- bury critical trade-offs in prose
