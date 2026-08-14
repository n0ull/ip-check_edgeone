# Agent Notes

一类设计文档存放在这里：**Agent Note** 记录影响本代码库的决策——代码和文档承载不了的『为什么』与『我们放弃了什么』。
本文件定义 Agent Note 存放位置、何时书写、替代检查、归档机制，以及[文件内格式](#文件内格式)。

## 目录结构

```text
.agents/
├── notes/                 # 本文档所在的决策记录树
│   ├── README.md          # 本体系说明（入口）
│   ├── AGENTS.md          # 本子树站立命令
│   ├── proposed/          # 待评审提案（按分类分子目录）
│   ├── implemented/       # 已上线决策；AGENTS.md 与 CLAUDE.md 定义其维护边界
│   ├── rejected/          # 被否决的提案（按分类分子目录）
│   └── archived/          # 冻结的历史快照；AGENTS.md 定义冻结规则
└── skills/                # 可复用工作流（SKILL.md + agents/openai.yaml）
```

## 布局与命名

每篇 Agent Note 有两个坐标，都编码在**路径**里：`{lifecycle}/{class}/yyyy-mm-dd-topic-title.md`。

- **生命周期**（顶层文件夹）即笔记状态，状态变化时笔记在文件夹间移动：
  - `proposed/` —— 待评审的提案，尚未实现（或仅部分实现）。
  - `implemented/` —— 决策已上线。文件记录『决定什么、否掉什么』，并**与线上实际保持同步**：代码后续移动文件、改名、改默认值时，同一变更中更新笔记以匹配事实（仅事实——路径、名称、结构——不重写决策本身）。维护边界见 [implemented/AGENTS.md](implemented/AGENTS.md)。
  - `rejected/` —— 提案被评审否决。仅当其理由能阻止一个有诱惑力的错误时保留，否则整篇删除。
  - `archived/` —— 已封存的实现笔记，只读历史快照。冻结规则见 [archived/AGENTS.md](archived/AGENTS.md)。
- **分类**（嵌套文件夹）即决策的种类——见[分类](#分类)。

文件名的日期是主题**首次提出**的日期。笔记间交叉引用用相对 Markdown 链接（`[主题](../../implemented/architecture/2026-….md)`），不用裸文件名，保证可机械校验、移动后仍有效。

## 分类

每篇笔记归属一个路径编码的分类，取自封闭集合（`scripts/verify-agent-notes.mjs` 拒绝其他目录）：

| 分类 | 覆盖内容 |
| --- | --- |
| `feature` | 新的用户或模型可见能力。 |
| `bug-fix` | 修复缺陷或收尾事后分析暴露的缺口。 |
| `simplification` | 移除代码、行为或表面面积而不增加能力。 |
| `architecture` | 关于**已发布源码**的结构决策——文件如何组织、运行时词汇是什么。 |
| `process` | 代码**周边**的工具、策略或工作流——门禁、包管理、部署——而非运行时行为。 |
| `testing` | 测试基础设施与策略。 |

`architecture` / `process` 的分界：**architecture** 关乎交付的源码；**process** 是围绕它的工具与流程。

## 何时书写

每个非平凡变更必须**在同一变更中新增或更新至少一篇 Agent Note**。
变更在以下情形视为非平凡：改变行为、架构、跨文件/跨包共享的契约、流程或工具、测试策略、磁盘/线上/配置格式，或维护者可能合理回访的决策。
已实现的决定直接写 `implemented/`；重大未来工作在 `proposed/` 起稿。更新已拥有该决策的笔记即可满足规则，不要造重复。
纯机械或局部编辑——不改变行为、契约、结构、流程或理由——可豁免。
笔记永不编辑成*另一个*决策：用新笔记取代，并双向交叉链接。

## 替代检查

每篇新 Agent Note 在同一次变更中触发**替代检查**，不推迟到后续清理：

- 搜索活跃树中覆盖同一决策或机制的老笔记；
- 被**完全替代**的 implemented 笔记：按[归档机制](#归档机制)归档完整文件，或按合并规则并入新笔记后删除（删除前必须保留原笔记的全部独特理由、备选、后果、验证要求与覆盖缺口，并修复所有入链）；
- 被**部分替代**或理由仍独立有用的笔记：保持活跃并交叉链接。

推迟替代检查的代价是：写新笔记的作者持有最新证据，推迟会让冗余的活跃权威并存，后续分类更贵。

## 归档机制

只有 `implemented/` 笔记可归档。归档条件：已上线决策已完整落地，且其理由、备选、后果、否定保证或重新引入条件不太可能指导未来工作。
归档变更仅允许：移动笔记到 `archived/{class}/`、在 `Status: implemented` 下方插入 `Archived: YYYY-MM-DD`、修复或删除入链。
归档后永久冻结：不随包改名、行为变更、翻译标准或格式规则更新，不作为当前依据。主动文档可以链接到归档笔记（有意引用历史）。
本项目规模小、无归档工作流技能，归档与替代检查由 `verify-agent-notes.mjs` 校验归档元数据，人工执行移动。

## 文件内格式

每篇活跃笔记遵循统一格式，由 `npm run verify:notes`（[scripts/verify-agent-notes.mjs](../../scripts/verify-agent-notes.mjs)）机械校验。

### 头部块

每篇笔记的前三行精确为：

```markdown
# Agent Note: <标题>

Status: <状态>
```

`Status:` 取值三种，且必须与所在生命周期文件夹一致：

- `Status: proposed`
- `Status: implemented`
- `Status: rejected — <一句话原因>`

状态行不携带日期与括号：文件名持有首次提出日期，git 持有其余历史。拒绝原因是唯一携带内容的状态，因为被拒笔记的结论正是读者要找的事实。

### 正文骨架

每篇笔记以 `## Problem` 开篇——动机，脱离解决方案也能独立成立。后续随生命周期不同：

#### `implemented/`

```markdown
## Problem
## Decision
…自有的技术章节…
## Alternatives considered
## Consequences
```

`## Decision` 以现在时描述已上线的现实，整篇与线上保持同步。`## Consequences` 记录取舍**付出与买到的**。
提案时代的措辞（`## Proposal`、`## Plan`、`## Migration plan`、`## Acceptance criteria`、`should…`）在 implemented 笔记中禁止出现。

#### `proposed/`

```markdown
## Problem
## Proposal
…自有的技术章节…
## Alternatives considered
## Acceptance criteria
## Risks
```

`## Proposal` 是意图中的变更，允许未来时态；`## Acceptance criteria` 定义可观测的完成态；`## Risks` 覆盖可能出错与明知放弃的。

#### `rejected/`

被拒笔记是冻结的提案：保留提案期章节，结论写在 `Status:` 行。

### Alternatives considered —— 强制段

每篇笔记必须携带 `## Alternatives considered`：每个真实备选与落选原因，每条一段或以 `### Why not <X>?` 小节承载。
备选是**记录**的，不是**发明**的：决策没有记录它击败了什么，就招致 Agent Note 要预防的重新争辩。

### 生命周期迁移

在生命周期文件夹间移动笔记 = 同变更中重写正文骨架：

- `proposed/` → `implemented/`：把 `## Proposal` 改写为现在时的 `## Decision`，把 `## Acceptance criteria`、`## Risks` 折叠进 `## Consequences`（或现在时的 `## Testing`/`## Verification` 节），删除计划语言；
- `proposed/` → `rejected/`：仅在 `Status:` 行补充拒绝原因，冻结文件；
- `implemented/` → `archived/`：按[归档机制](#归档机制)操作。

## 语言约定（对三元组的本地化适配）

通用模式为三元组：`.md`（英文权威）+ `.zh.md`（中文镜像，逐节对齐）+ `.i18n.yaml`（配对一致性侧车，记录两侧 git blob 哈希）。
本项目采用**单语中文**：正文只写 `.md`，不建 `.zh.md` 与 `.i18n.yaml`。
理由：项目无英文读者，且未纳入 git 版本管理（`.i18n.yaml` 依赖 git blob 哈希，无法生成有效值）。
若未来引入英文读者或纳入 git，按三元组契约补齐：`.md` 为英文权威、`.zh.md` 逐节镜像（机器头 `# Agent Note:` 与 `Status:` 保持英文原样）、`.i18n.yaml` 记录配对哈希。

## 门禁

`npm run verify:notes`（[scripts/verify-agent-notes.mjs](../../scripts/verify-agent-notes.mjs)）机械校验：

- 生命周期文件夹与分类目录属于封闭集合；
- 头部块（`# Agent Note:` + `Status:`）与所在目录一致；
- `## Problem` 与 `## Alternatives considered` 必选；
- implemented 笔记必须含 `## Decision`、`## Consequences`，禁止提案期章节；
- proposed 笔记必须含 `## Proposal`、`## Acceptance criteria`、`## Risks`；
- 归档笔记必须含 `Archived:` 行，且不在归档后继续变更。

## 本目录内容

- `AGENTS.md` —— 本子树站立命令。
- `implemented/AGENTS.md` 与 `implemented/CLAUDE.md` —— implemented 笔记的维护边界（两份内容相同，供不同 agent 工具读取）。
- `archived/AGENTS.md` —— 归档冻结规则。
- `proposed/`、`rejected/`、`archived/` —— 空分类目录，随状态迁移使用。
- `skills/` —— 可复用工作流（SKILL.md 采用 `name`/`description` frontmatter + 正文的格式）。