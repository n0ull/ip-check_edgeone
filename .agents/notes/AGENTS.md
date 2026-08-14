# AGENTS.md — Agent Notes 与工作流

- **非平凡变更必须携带 Agent Note**：改变行为、架构、契约、流程、测试策略或配置格式的变更，在同一变更中新增或更新 [Agent Note](README.md)。
- **笔记格式契约**：`# Agent Note: <标题>` + `Status:`（与文件夹一致）+ `## Problem` +（implemented：`## Decision`/`## Alternatives considered`/`## Consequences`）。格式细节见 [README.md](README.md)，机械校验见 `npm run verify:notes`。
- **状态即文件夹**：笔记在 `proposed/` → `implemented/` → `rejected/` 间移动时，同变更中重写正文骨架；`implemented/` 笔记与线上实际保持同步（仅事实）。
- **新笔记触发替代检查**：搜索活跃树中的老笔记，完全替代者按归档机制处理，部分替代者交叉链接（[规则](README.md)）。
- **禁止造重复**：更新已拥有该决策的笔记；被新决策取代时双向交叉链接。
- **备选段强制**：`## Alternatives considered` 记录真实备选与落选原因，不发明备选。
- **单语约定**：本项目笔记仅中文（`.md`），不建三元组（`.zh.md`/`.i18n.yaml`）；[理由](README.md#语言约定对三元组的本地化适配)。
- **代码与笔记同步**：修改 `edge-functions/` 行为后，检查是否有笔记需要更新（路径、名称、默认值等事实）。

## Skills 使用

- [ip-service-workflow](../skills/ip-service-workflow/SKILL.md)：本项目的开发、本地验证、部署、域名与线上验证工作流。涉及 `.agents` 之外的文档修订时同时运行其检查。