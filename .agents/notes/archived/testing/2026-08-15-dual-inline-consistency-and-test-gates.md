# Agent Note: 双文件一致性校验与测试门禁整合

Status: implemented
Archived: 2026-08-27

> 共享模块提取（_shared.js）后双份内联消失，consistency.mjs 退役，本节守护的机制不复存在；作为历史快照冻结。

## Problem

[客户端 IP 契约](../../implemented/architecture/2026-08-14-client-ip-acquisition-contract.md)要求 `index.js` 与 `[[default]].js` 双份内联同一实现、『改一必改二』，但该约束此前只有人工约定，且漂移已实际发生：`handleV4`/`handleV6` 的错误文案两文件曾不一致（详细版与简短版并存）。
测试同时存在缺口：主页 UI 的内嵌 JS 只断言字符串包含、无语法有效性校验（`/webrtc` 页有，主页没有，而两者同样受外层字符串消化转义的影响）；`Accept: application/json` 协商路径无断言；`verify:notes` 游离于 `npm test` 之外，提交前可能漏跑。
后续走查又发现门禁自身的两个缺口：方法门禁以匿名块双份内联于两个 `onRequest` 体内，不是具名函数、不在比对清单内，完全不受机械保护（与[方法门禁笔记](../../implemented/feature/2026-08-15-preferred-header-and-method-guard.md)的声称不符）；SHARED 清单本身是『哪些函数共享』的第二份手工拷贝，漏加即静默失保（新增共享函数需人肉记得登记，该负担曾被列入本节代价）。

## Decision

- `test/consistency.mjs`：提取两文件共享函数的源码（按花括号配对提取，约束为函数体内字符串/正则中的花括号成对出现），仅归一化行尾差异（CRLF 与行尾空白）后逐字比对；配套把 `handleV4`/`handleV6` 的漂移文案统一为详细版（`handleV6` 已随[移除 6. 兼容面](../simplification/2026-08-26-remove-v6-compat-surface.md)删除）；
- **受检集合自动推导**（取代初版的手工 SHARED 清单）：扫描两文件顶层 `function` 声明（正则严格行首锚定，嵌套函数因缩进不匹配），取交集减去显式例外 `onRequest`（唯一合法的同名不同体函数，两文件各自入口）；比对从声明起点开始、含 `export`/`async` 修饰符，修饰符漂移同样判不一致。新增共享函数自动纳入门禁；交集清单打印在测试日志供扫视，空交集硬断言失败以防静默通过；漏加例外的失效方向是误报（吵）而非漏保（静）；
- 方法门禁为具名共享函数 `methodGuard(request) → Response | null`（判断、文案、`Allow` 头内聚），两个 `onRequest` 入口首先调用——此前它以匿名块双份内联、不在门禁内，具名化后自动落入交集受检；
- `test/simulate.mjs` 补充 `Accept: application/json` 协商断言与两个 405 方法门禁断言（主页 UI 的 `new Function` 语法冒烟断言已随[浏览器脚本即真实函数](../simplification/2026-08-26-browser-js-as-real-functions.md)退役——脚本改为真实函数后，语法由模块 import 与 `node --check` 直接保证）；
- `npm test` 串起全部本地验证（构成以 `package.json` 的 `test` script 为权威），一个命令即完整门禁，同时挂入 pre-commit 钩子（见[提交前预检笔记](../process/2026-08-15-pre-commit-gate.md)）。

## Alternatives considered

- **抽公共模块供两文件 import，从根上消除重复**——[IP 契约笔记](../architecture/2026-08-14-client-ip-acquisition-contract.md)已定案：边缘构建器对跨文件 import 的支持未经验证，失败即全站不可用；重复是确定性代价，机械校验是与该定案兼容的防漂移方式。
- **仅靠评审纪律防漂移**——漂移已在有评审纪律的情况下发生（两版文案并存），人工约定不足以兜底；放弃。

## Consequences

『改一忘改二』在本地测试阶段即失败，不再依赖人肉同步；`npm test` 单命令覆盖逻辑断言、双页 DOM 沙箱、双文件一致性与笔记格式。
代价：共享函数源码被锁定为逐字一致（含声明修饰符、注释与字符串内空白），微调必须双份同步——这正是契约要求的纪律，改由机械门禁执行；花括号配对的提取方式要求函数体内花括号成对出现。交集推导消除了手工清单的登记纪律；残余盲区：共享函数被单方面改名会从交集消失（函数删除由 simulate.mjs 的运行时引用兜底，改名漂移靠日志透明与审查兜底）。
