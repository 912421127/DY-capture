---
description: "构建一次性原型来验证设计问题：逻辑/状态模型用终端应用，UI 用可切换变体。"
---

# Prototype

A prototype is throwaway code that answers a question.

## Rules
1. Throwaway from day one, clearly marked as such.
2. One command to run.
3. No persistence by default. State lives in memory.
4. Skip the polish. No tests, no error handling beyond what makes the prototype runnable.
5. Surface the state. After every action, print or render the full relevant state.
6. Delete or absorb when done.

## When done
The answer is the only thing worth keeping. Capture it somewhere durable (commit message, ADR, issue).
