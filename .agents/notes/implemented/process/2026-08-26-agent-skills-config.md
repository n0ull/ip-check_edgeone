# Agent Note: Matt Pocock 技能套件仓库配置（docs/agents/）

Status: implemented

## Problem

Matt Pocock 工程技能（triage、to-tickets、to-spec、wayfinder、domain-modeling 等）需要每仓库配置才能工作：Issue 追踪位置、triage 标签词汇、领域文档（CONTEXT.md/ADR）的布局与消费规则。缺少这些文件时，技能不知道应调用 `gh` 还是写本地 markdown，也不知道应打什么标签、去哪里读领域约定。

## Decision

采用 setup-matt-pocock-skills 技能完成脚手架，定案如下：

- **Issue 追踪**：GitHub Issues（remote 指向 github.com/n0ull/ip-check_edgeone），技能一律用 `gh` CLI 操作；『PR 作为请求面』开关保持关闭。契约写在 `docs/agents/issue-tracker.md`。
- **Triage 标签**：使用五个标准角色原名 `needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`，不做映射改写。映射表在 `docs/agents/triage-labels.md`。
- **领域文档**：单上下文（single-context）布局——根 `CONTEXT.md` + `docs/adr/`，由 domain-modeling 技能按需惰性创建，不预建空文件。消费规则在 `docs/agents/domain.md`。
- **入口索引**：根 `AGENTS.md` 追加 `## Agent skills` 段，一行摘要指向三份配置。
- 本仓库自有的 `.agents/notes/` 决策记录体系不受影响，仍是决策的权威来源；`docs/agents/` 仅承载 Matt Pocock 技能的外部约定。

## Alternatives considered

- **本地 markdown 追踪（`.scratch/`）**：适合无 remote 的单人项目；本仓库已有 GitHub remote 且 Issues 可用，放弃。
- **自定义 triage 标签映射**：本仓库 issue tracker 无既有标签约定，无重复标签风险，直接用默认名，省去映射维护。
- **多上下文领域文档（`CONTEXT-MAP.md`）**：仓库无 monorepo 信号（单 `package.json`、无 workspaces、无 `packages/`），单上下文即可。
- **预建 `CONTEXT.md` 与 `docs/adr/` 骨架**：`docs/agents/domain.md` 要求惰性创建（由 domain-modeling 在术语或决策实际落地时生成）；预建空文件只会制造无内容的噪音。

## Consequences

- 付出：仓库新增 `docs/agents/` 三份配置文件与 `AGENTS.md` 一段索引，需随技能升级人工同步。
- 买到：triage / to-tickets / to-spec / wayfinder 等技能开箱可用——明确 issue 读写方式、标签词汇与领域文档位置，无需每次会话口头交代。
- 日常微调直接编辑 `docs/agents/*.md`；切换 Issue 追踪器或推倒重来时重跑 /setup-matt-pocock-skills。
