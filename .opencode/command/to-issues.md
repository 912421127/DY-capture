---
description: "把 PRD 或计划拆成独立可执行的 issue，用垂直切片方式组织。"
---

# To Issues

Break a plan into independently-grabbable issues using vertical slices (tracer bullets).

## Process

### 1. Gather context
Work from whatever is already in the conversation context. If the user passes an issue reference, fetch it from the issue tracker.

### 2. Explore the codebase (optional)
Look for opportunities to prefactor the code to make the implementation easier.

### 3. Draft the issues
Break the plan into tracer bullet issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end.

### 4. Quiz the user
Present the proposed breakdown as a numbered list with Title, Blocked by, and User stories covered. Ask if the granularity feels right.

### 5. Publish the issues to the issue tracker
For each approved slice, publish a new issue. Publish issues in dependency order.

## Issue body template

### Parent
A reference to the parent issue (if any).

### What to build
A concise description of this vertical slice. Describe the end-to-end behavior.

### Acceptance criteria
- [ ] Criterion 1
- [ ] Criterion 2

### Blocked by
A reference to the blocking ticket (if any), or "None - can start immediately".
