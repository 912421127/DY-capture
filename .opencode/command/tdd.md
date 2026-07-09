---
description: "测试驱动开发：红-绿-重构循环。先写失败测试，再写刚好通过的代码。"
---

# Test-Driven Development

TDD is the red → green loop. Every section applies on every cycle.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. A good test reads like a specification and survives refactors because it doesn't care about internal structure.

## Seams — where tests go

A seam is the public boundary you test at. Test only at pre-agreed seams. Before writing any test, write down the seams under test and confirm them with the user.

Ask: "What's the public interface, and which seams should we test?"

## Anti-patterns

- Implementation-coupled — mocks internal collaborators, tests private methods
- Tautological — the assertion recomputes the expected value the way the code does
- Horizontal slicing — writing all tests first, then all implementation

## Rules of the loop

- Red before green. Write the failing test first, then only enough code to pass it.
- One slice at a time. One seam, one test, one minimal implementation per cycle.
- Refactoring is not part of the loop.
