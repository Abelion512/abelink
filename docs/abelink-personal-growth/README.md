# Abelink Project Discovery Outputs

## 1. Grill-Abelion
Reusable agent skill for interviewing a user and discovering which project or workflow they actually need.

## 2. Abelink Personal Growth & Execution Layer
Modular domain layer for Abelink covering goal execution, learning, skill evidence, career, scholarship, governance, focus policy, and self-critique.

## Recommended use

1. Put `grill-abelion/SKILL.md` into the Abelink skill store.
2. Treat `abelink-personal-growth/` as the design/spec package for a new modular layer.
3. Implement against stable Abelink integration boundaries rather than hardcoding volatile paths.
4. Keep the current core unchanged unless an explicit interface extension is required.
