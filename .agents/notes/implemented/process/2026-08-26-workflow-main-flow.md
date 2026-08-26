# Agent Note: 变更主流程固化（定形→实现→门禁→审查→提交→部署）

Status: implemented

## Problem

一次完整改动虽走完了 Matt 技能主流程的各环节（架构评审 → grilling → 实现 → 审查），但顺序是即兴的：/code-review 在 4 个提交之后才补跑，且 Spec 轴真的抓到一处注释与代码不符的残留——『审查前置』没有制度保障。同时 Matt 体系的 domain.md 默认把决策写入 docs/adr/，与本仓库既有的 .agents/notes/ 决策库形成双轨；两个决策库并存必然漂移。

## Decision

主流程固化到 ip-service-workflow 技能（SKILL.md 新增『变更主流程』节）与 AGENTS.md（一句话指针）：

- **六步顺序**：定形（功能/架构级改动先 grilling 或架构评审）→ 实现（代码 + 测试断言 + Agent Note）→ 门禁（node --check + npm test）→ **/code-review 双轴审查（提交前）** → 提交（pre-commit 复检）→ 部署与线上验证。
- **审查豁免边界**：纯文档/注释级编辑可跳过审查（与 notes 契约的机械编辑豁免对齐）。
- **双轨归一**：.agents/notes/ 是本仓库唯一决策/ADR 库；Matt 系技能（domain-modeling 等）的决策记录写 Agent Note，不创建 docs/adr/；该规则写入 docs/agents/domain.md 供技能消费。CONTEXT.md 术语表保持惰性创建。
- **审查通道**：子代理默认模型（opencodezen / x-preview-f-free）已失效（环境事实）；审查代理经 workflow 显式指定 provider/model，当前约定 kimi-coding / kimi-for-coding。子代理默认模型修复后本约定可回退。

## Alternatives considered

- **只靠 pre-commit 机械门禁**——门禁已在，但漏掉注释与代码不符这类机械检查覆盖不到的问题（本次 Spec 轴的实例）；独立审查捕捉的是另一类错误。放弃。
- **审查写进 pre-commit 钩子强制**——审查需要模型调用与人工判读，不是机械门；钩子保持快速确定性，审查留在流程层。放弃。
- **按 Matt 默认把决策写入 docs/adr/**——本仓库 notes 体系有生命周期与机械校验，优于裸 adr 目录；迁址会废弃既有 13 篇笔记的格式投资。放弃。

## Consequences

- 任何变更按同一顺序执行，审查不再依赖人肉想起；SKILL.md 承载步骤细节，AGENTS.md 只付一句话的常驻成本。
- 双轨消除：决策只有一个家；docs/agents/domain.md 承担对 Matt 技能的翻译层。
- 代价：每个非豁免提交多一次双轴审查（数分钟 + 两次模型调用）；审查通道约定需在子代理默认模型修复后回评。
