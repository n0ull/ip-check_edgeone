# Agent Note: 本项目 Agent Note 约定

Status: implemented

## Problem

项目需要统一的决策记录体系（`.agents/`），但成熟开源仓库的完整配套（双语对、格式门禁脚本）对单语小项目过重：双语对无人阅读、完整门禁配套超出项目规模所需，全部照搬只会制造无人维护的死重。

## Decision

在 `.agents/` 下落地通用的 Agent Note **结构**与**文件格式契约**，裁剪其**配套机制**：

- **保留（结构全量对齐）**：`notes/{lifecycle}/{class}/yyyy-mm-dd-topic-title.md` 布局，生命周期四态（proposed/implemented/rejected/archived）与六分类封闭集合；体系说明在 `notes/README.md`，子树站立命令在 `notes/AGENTS.md`；`implemented/AGENTS.md` 与 `CLAUDE.md`（同内容副本，供不同 agent 工具读取）定义维护边界，`archived/AGENTS.md` 定义冻结规则；替代检查与归档机制；头部块（`# Agent Note: <标题>` + `Status:` 与文件夹一致）；正文骨架（`## Problem` 开篇；implemented 用 `## Decision`/`## Alternatives considered`/`## Consequences`，禁止提案期措辞）；`## Alternatives considered` 强制段；生命周期迁移重写规则；SKILL.md 的 frontmatter（`name`/`description`）格式。
- **裁剪（机制简化）**：单语中文（不建 `.md`/`.zh.md`/`.i18n.yaml` triplet）；门禁脚本简化为一个轻量校验器（`scripts/verify-agent-notes.mjs`，`npm run verify:notes`，覆盖目录集合、头部块、状态一致性、强制章节与归档元数据，无哈希与配对门）；无归档工作流技能（归档与替代检查人工执行，校验器检查 `Archived:` 行）。
- **事实性同步点**：共享函数集中在 `edge-functions/_shared.js`，两入口文件各自 import，修改共享逻辑只改一处（见[客户端 IP 契约](../architecture/2026-08-14-client-ip-acquisition-contract.md)）。

## Alternatives considered

- **完整照搬成熟开源仓库的配套**（双语对 + 门禁脚本）——双语对在本项目无读者，完整门禁配套超出单维护者项目的收益成本比，创建即死重；放弃。
- **不建 `.agents/`，决策只写进 README**——README 定位是部署参考手册，混入决策史违反其职责，且评审中指出的『决策与理由』无处安放；放弃。

## Consequences

决策记录（平台约束、IP 契约、UI 回退、语义措辞、部署管理）已有单一归属地，README 保持部署手册纯净并链接到 `.agents/`。
代价是校验器比完整门禁体系（哈希、配对、跨文档引用门）轻——完整门禁的边际收益不抵维护成本（「项目无 git 与 CI」的原始前提已失效，理由重评见[裁剪理由重评笔记](2026-08-27-note-trimming-rejustification.md)）；若引入英文读者、多人协作或发生配对漂移事故，按 [notes/README.md](../../README.md) 的指引补三元组与完整门禁。