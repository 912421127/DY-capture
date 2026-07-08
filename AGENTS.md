# AGENTS.md
DO NOT send optional commentary
这份文件是给 Codex/AI 助手看的项目协作约定。修改这个项目时，请优先照顾新手可读性：代码要简单、直白、容易理解。

## 写代码原则

- 优先使用最简单、最容易读懂的实现，不要为了“高级”而写复杂代码。
- 不要随便引入复杂设计模式、过度封装、链式技巧或黑魔法写法。
- 函数尽量短小，一个函数只做一件清楚的事情。
- 变量名、函数名要直白，让新人看到名字就大概知道用途。
- 修改现有功能前，先读懂相关代码，只做和当前任务有关的最小改动。
- 如果有两种写法都能完成任务，优先选择更好读、更好改、更容易调试的写法。

## 中文注释要求

- 新增或修改核心逻辑时，要写中文注释。
- 注释重点说明“为什么这样做”和“这段代码负责什么”。
- 不写没有帮助的空话注释，例如“设置变量”“调用函数”。
- 涉及 PDD 接口、风控参数、字体解码、导出格式等容易出错的地方，要保留清楚说明。
- 如果代码本身已经非常直白，可以少写注释，但复杂或容易误解的地方必须说明。

## 用户可见内容

- UI 文案、按钮文字、错误提示、导出文件名优先使用中文。
- 面向用户的提示要说人话，尽量告诉用户“发生了什么”和“下一步怎么做”。
- 不要把接口字段名或技术细节直接暴露给普通用户，除非这是调试信息。

## 项目结构习惯

- `src/features/` 放具体功能，例如商品数据采集、经营数据采集。
- `src/shared/` 放多个功能都会用到的通用工具。
- Vue 组件主要负责展示和交互，采集、整理、导出逻辑尽量放到对应 feature 文件里。
- 新增功能时，优先参考已有功能的写法，保持项目风格一致。

## 测试和检查

- 修改 TypeScript 或 Vue 代码后，优先运行 `npm run compile`。
- 修改导出、数据整理、格式转换等逻辑时，尽量补充或更新测试。
- 如果新增测试文件，放在 `tests/` 目录下。
- 不要为了让测试通过而绕开真实逻辑，测试应该覆盖用户真正会用到的行为。

## 常用命令

- `npm run dev`：本地开发。
- `npm run compile`：类型检查。
- `npm test`：运行测试。
- `npm run build`：生产构建。

## 依赖和实现选择

- 不要轻易新增依赖；如果必须新增，要说明原因。
- 能用项目里已有工具解决，就不要再引入新的库。
- 依赖浏览器扩展环境的代码，要注意不要使用 Node.js 专属 API。
- 下载文件、读取页面、导出数据等通用能力，优先放到 `src/shared/` 或对应 feature 的工具文件里。

## 交付说明

- 完成修改后，说明改了哪些文件、实现了什么效果、跑过哪些检查。
- 如果没有运行某个检查，要明确说明原因。
- 如果发现已有代码有乱码、历史遗留问题或潜在风险，可以提醒用户，但不要顺手大改无关内容。

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.
Before implementing:

•State your assumptions explicitly. If uncertain, ask.
•If multiple interpretations exist, present them - don't pick silently.
•If a simpler approach exists, say so. Push back when warranted.
•If something is unclear, stop. Name what's confusing. Ask.

Simplicity First
Minimum code that solves the problem. Nothing speculative.
•No features beyond what was asked.
•No abstractions for single-use code.
•No "flexibility" or "configurability" that wasn't requested.
•No error handling for impossible scenarios.
•If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

Surgical Changes
Touch only what you must. Clean up only your own mess.
When editing existing code:

•Don't "improve" adjacent code, comments, or formatting.
•Don't refactor things that aren't broken.
•Match existing style, even if you'd do it differently.
•If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

•Remove imports/variables/functions that YOUR changes made unused.
•Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

Goal-Driven Execution
Define success criteria. Loop until verified.
Transform tasks into verifiable goals:

•"Add validation" → "Write tests for invalid inputs, then make them pass"
•"Fix the bug" → "Write a test that reproduces it, then make it pass"
•"Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

[Step] → verify: [check]
[Step] → verify: [check]
[Step] → verify: [check]
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.