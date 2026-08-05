# Context Engineering Fix

## Research
- Anthropic: 1M=1048576, compaction default=150K, clearing=separate
- Hermes: threshold=0.50, proactive_prune=separate

## 2 Layers
- Layer 1: Tool-result clearing in prepareHistory (keep last 4)
- Layer 2: Compressor threshold 0.45->0.50, targetRatio 0.2->0.3

## BCDE Tests
B: Context, C: Awareness, D: Guardrails, E: Stress
