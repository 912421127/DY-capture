---
description: "调试困难 bug 的诊断循环：建立反馈循环 → 复现 → 假设 → 插桩 → 修复 → 回归测试。"
---

# Diagnosing Bugs

A disciplined diagnosis loop for hard bugs. Skip phases only when explicitly justified.

## Phase 1 — Build a feedback loop
Spend disproportionate effort here. Build a tight pass/fail signal for the bug — one that goes red on THIS bug. Try in order: failing test, curl/HTTP script, CLI invocation, headless browser, replay trace, throwaway harness, property/fuzz loop, bisection, differential loop.

## Phase 2 — Reproduce + minimise
Run the loop. Confirm it reproduces the user's exact failure mode. Then shrink to the smallest scenario that still goes red.

## Phase 3 — Hypothesise
Generate 3–5 ranked hypotheses. Each must be falsifiable. Show the list to the user before testing.

## Phase 4 — Instrument
Change one variable at a time. Tag every debug log with a unique prefix. Use debugger first, targeted logs second.

## Phase 5 — Fix + regression test
Write regression test before the fix at a correct seam. If no correct seam exists, that itself is the finding.

## Phase 6 — Cleanup + post-mortem
Remove all debug instrumentation. The hypothesis that turned out correct should be stated in the commit message. Ask: what would have prevented this bug?
