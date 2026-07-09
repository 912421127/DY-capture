---
description: "把当前对话转为 PRD（产品需求文档），发布到 issue tracker。"
---

This skill takes the current conversation context and codebase understanding and produces a PRD. Do NOT interview the user — just synthesize what you already know.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already.

2. Sketch out the seams at which you're going to test the feature. Check with the user that these seams match their expectations.

3. Write the PRD using this template, then publish it to the project issue tracker.

## PRD Template

### Problem Statement
The problem that the user is facing, from the user's perspective.

### Solution
The solution to the problem, from the user's perspective.

### User Stories
A LONG, numbered list of user stories in the format: "As an <actor>, I want a <feature>, so that <benefit>"

### Implementation Decisions
Modules that will be built/modified, interfaces, architectural decisions, schema changes, API contracts.

### Testing Decisions
What makes a good test, which modules will be tested, prior art for the tests.

### Out of Scope
Things that are out of scope for this PRD.

### Further Notes
Any further notes about the feature.
