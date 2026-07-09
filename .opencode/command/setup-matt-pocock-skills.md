---
description: "初始化配置：选择 issue tracker、triage 标签、领域文档布局。首次使用前运行。"
---

# Setup Matt Pocock's Skills

Scaffold the per-repo configuration that the engineering skills assume:

- Issue tracker — where issues live
- Triage labels — the strings used for the five canonical triage roles
- Domain docs — where CONTEXT.md and ADRs live

## Process

### 1. Explore
Look at the current repo to understand its starting state:
- git remote -v and .git/config
- AGENTS.md and CLAUDE.md
- CONTEXT.md and docs/adr/
- docs/agents/

### 2. Present findings and ask
Walk the user through three decisions one at a time:
- Section A: Issue tracker (GitHub, GitLab, Local markdown, Other)
- Section B: Triage label vocabulary (5 canonical roles)
- Section C: Domain docs layout (single-context or multi-context)

### 3. Confirm and edit
Show the user a draft of the configuration before writing.

### 4. Write
Add the Agent skills block to AGENTS.md. Write docs/agents/*.md files.

### 5. Done
Tell the user which engineering skills will now read from these files.
