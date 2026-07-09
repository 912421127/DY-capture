---
description: "在一个多会话的教学工作区里，系统地教你一个技能或概念。"
argument-hint: "你想学什么？"
---

The user has asked you to teach them something. This is a stateful request — they intend to learn the topic over multiple sessions.

## Teaching Workspace

Treat the current directory as a teaching workspace. Create these files as needed:

- `MISSION.md`: The reason the user is interested in the topic.
- `./reference/*.html`: Reference materials — cheat sheets, glossaries.
- `RESOURCES.md`: High-quality resources for knowledge acquisition.
- `./learning-records/*.md`: What the user has learned (like ADRs for knowledge).
- `./lessons/*.html`: Self-contained HTML lessons, one per topic.
- `./assets/*`: Reusable components shared across lessons.

## Philosophy

Learning needs:
- **Knowledge** from high-quality resources
- **Skills** through interactive lessons
- **Wisdom** from real-world interaction

Design for **storage strength** (long-term retention), not just fluency (momentary recall).

Use retrieval practice, spacing, and interleaving to build durable learning.
