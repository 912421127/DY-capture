---
description: "审查代码变更：从标准（编码规范）和规格（是否符合需求）两个维度并行审查。"
---

# Code Review

Two-axis review of the diff between HEAD and a fixed point:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / PRD / spec?

## Process

### 1. Pin the fixed point
Whatever the user said is the fixed point — a commit SHA, branch name, tag, main, HEAD~5, etc. If they didn't specify one, ask for it.

Capture the diff command: `git diff <fixed-point>...HEAD`

### 2. Identify the spec source
Look for the originating spec in order: issue references in commit messages, a path the user passed, a PRD/spec file, or ask the user.

### 3. Spawn both sub-agents in parallel
- Standards sub-agent: checks documented coding standards + smell baseline
- Spec sub-agent: checks against the originating issue/PRD

### 4. Aggregate
Present the two reports under Standards and Spec headings. End with a one-line summary per axis.
