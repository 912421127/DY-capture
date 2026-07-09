---
description: "同 /grill-me，但同时生成项目领域文档（CONTEXT.md 和 ADR），适合有代码库时使用。"
---

Run a grilling session. Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

If a fact can be found by exploring the codebase, look it up rather than asking me. The decisions, though, are mine — put each one to me and wait for my answer.

As decisions are made, actively build and sharpen the project's domain model:
- Challenge terms against the glossary in CONTEXT.md
- If a concept is fuzzy or overloaded, resolve it
- Record hard-to-reverse decisions as ADRs in docs/adr/
- Update CONTEXT.md inline as terms get clarified

Do not enact the plan until I confirm we have reached a shared understanding.
