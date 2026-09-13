# Autonomy Policy

## Decision Inputs

```text
risk
capability
reliability
verification
userPolicy
externalSideEffects
reversibility
```

## Levels

### AUTO
Routine, reversible, low-risk actions with sufficient verification.

### GUIDED
Actions where the agent can execute but should keep the user informed or request lightweight confirmation.

### APPROVAL_REQUIRED
External side effects, high-risk system actions, account changes, submissions, purchases, financial actions, or other user-defined critical actions.

### DENY
Actions forbidden by policy, unsupported capability, missing authorization, or failed safety checks.

## Rules

1. The model cannot approve itself.
2. Risk takes precedence over convenience.
3. Unsupported capability must fail explicitly.
4. Repeated successful execution may increase autonomy only through a policy decision, never implicitly.
5. Final academic submission always remains user-controlled.
6. Financial execution always remains user-controlled unless a future explicit policy says otherwise.
