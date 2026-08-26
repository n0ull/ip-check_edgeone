# Agent Note: README 内容边界——只写「是什么/怎么用」，决策史归笔记

Status: implemented

## Problem

README 自述中混入「为什么不提供 X」「曾经如何」类内容（无 `6.` 子域的理由、Actions 工作流失败史、Provider 冲突的来龙去脉等）。辩护性内容稀释部署手册的核心职责，是漂移高发面，也让以操作为目的的读者被迫穿越决策史。同日瘦身评审还发现多处冗余表达：工作原理 ASCII 图的分发映射与特性列表、端点表三重重复；参考文档链接农场含已废弃路径（「使用 GitHub Action」）与无关项（Cloud Functions）；`npm test` 描述残留已退役的「双文件内联一致性」。

## Decision

README 内容边界写入「文档体系」节：**README 只承载「是什么、怎么用、怎么部署/配置」；「为什么不」「曾经如何」一律进 Agent Note，README 至多留指针链接。** 同批清理：删工作原理 ASCII 图；原理段删除「不提供 `6.` 子域」的 why-not 论述（机制与用法保留，决策史留指针）；Provider 约束段删除 Actions 失败史（约束本身保留——它是操作警告）；参考文档砍到 4 个高价值链接；控制台版边缘函数 FAQ 压缩为一行；部署按钮说明、pre-commit 段、「完整的可部署项目」段压缩；修复 `npm test` 描述的退役残留。

## Alternatives considered

- **保留「为什么不」段落帮助理解**——理解需求的住所是 Agent Note（`## Alternatives considered` 段即为此存在）；README 读者以操作为目的，辩护性内容是噪音；放弃。
- **全文重写**——结构刚经历部署节重构，可用；只清理越界内容与冗余表达即可；放弃。

## Consequences

README 收敛为纯操作手册（186 → 171 行）；决策史唯一住所是 `.agents/notes/`。未来新增「为什么不做 X」类内容一律进笔记而非 README——本边界已在 README「文档体系」节自我声明。
