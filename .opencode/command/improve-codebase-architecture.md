---
description: "扫描代码库架构问题，生成 HTML 可视化报告，然后追问你选哪个来改进。"
---

# Improve Codebase Architecture

Surface architectural friction and propose deepening opportunities — refactors that turn shallow modules into deep ones.

## Process

### 1. Explore
Read the project's domain glossary (CONTEXT.md) and any ADRs in the area you're touching. Then explore the codebase organically and note where you experience friction:
- Where does understanding one concept require bouncing between many small modules?
- Where are modules shallow — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called?
- Where do tightly-coupled modules leak across their seams?

### 2. Present candidates as an HTML report
Write a self-contained HTML file to the OS temp directory with before/after visualizations for each candidate. Open it for the user.

For each candidate, render a card with:
- Files — which files/modules are involved
- Problem — why the current architecture is causing friction
- Solution — plain English description of what would change
- Benefits — explained in terms of locality and leverage
- Before / After diagram
- Recommendation strength — one of Strong, Worth exploring, Speculative

End with a Top recommendation section.

### 3. Grilling loop
Once the user picks a candidate, run a grilling session to walk the design tree with them.
