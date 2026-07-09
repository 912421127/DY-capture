---
description: "不知道该用哪个技能？问这个。路由到合适的技能和工作流。"
---

# Ask Matt

You don't remember every skill, so ask.

A flow is a path through the skills. Most paths run along one main flow, and two on-ramps merge onto it.

## The main flow: idea → ship

1. `/grill-with-docs` — sharpen the idea by interview. Start here when you have a codebase.
2. Branch — can you settle every question in conversation? If not, detour through `/prototype`, bridged by `/handoff`.
3. Branch — is this a multi-session build?
   - Yes → `/to-prd` → `/to-issues` → `/implement`
   - No → `/implement` right here

## On-ramps

- Bugs and requests piling up → `/triage`
- Something's broken → `/diagnosing-bugs`

## Codebase health

- `/improve-codebase-architecture` — run whenever you have a spare moment

## Standalone

- `/grill-me` — same interview, no codebase
- `/prototype` — throwaway code to answer a question
- `/research` — background investigation
- `/teach` — learn a concept over multiple sessions
- `/handoff` — context handoff between sessions

## Precondition

`/setup-matt-pocock-skills` — run before your first engineering flow
