# Agent Note: 页面脚本作用域与 browserScript 自动闭包

Status: implemented

## Problem

两个页面的浏览器脚本由手工序列化数组拼装（`UI_SCRIPT`/`WEBRTC_SCRIPT` 的 `[fn, …].map(toString).join`），「页面脚本由哪些函数构成」这一知识因此散落两处：函数定义在宿主文件，函数清单在数组里，两者靠纯约定同步。失败模式三类：漏登（函数被引用但未入数组）＝页面运行时 ReferenceError，且只有 DOM 测试恰好覆盖的路径能拦；多登＝死代码上线；词法封闭无保障（浏览器函数误引模块级标识符如 `SUBDOMAINS`）＝构建与测试全静默。该契约已实际咬人：isIpv4 严格化（见[同批笔记](../bug-fix/2026-08-27-isipv4-strict-and-regex-dedup.md)）因 `extractIp`/`isPublicIp` 新引用共享助手而被迫手工同步数组——一次纯粹的机制性步骤。数组 interface 的复杂度≈实现本身（shallow），且架构评审（2026-08-29）确认它是最近 6 个代码提交中 4 个的摩擦来源。

## Decision

- **页面脚本作用域**：每个页面的浏览器函数嵌套声明进一个真实函数（`uiScriptScope` / `webrtcScriptScope`，各留宿主文件），胶水语句（`init('__BASE__')`、`$('run').addEventListener(…)`）为作用域末行。页面局部函数的闭包由 JavaScript 词法作用域结构性保证——函数体文本天然携带全部嵌套声明，「登记」这个动作不复存在。
- **`browserScript(scope, shared)`（_shared.js）**：序列化器剥取作用域函数体（首个 `{` 至末个 `}`），再从 `shared` 命名空间（宿主文件 `import * as shared`）按 `\b` 名字对作用域体做**传递闭包拣选**（init→familyOf→isIpv6 链自动展开），前置被引用者源码。误拣（名字出现于字符串/正则/注释）只会让页面多一个无害函数；漏拣不可能（名字被引用必被 `\b` 命中）；非函数导出跳过不序列化（引用它的页面在测试期 ReferenceError，方向保守）。剥壳不变式（签名无解构参数；esbuild 重印保留函数声明**结构**——符号名则不然：入口以自由标识符引用共享符号时 esbuild 会改名避让，2026-08-29 事故见[改名笔记](../bug-fix/2026-08-29-webrtc-free-identifier-esbuild-rename.md)）由 simulate 不变式断言钉住。
- **泄漏类残余风险测试期必现**：dom-sandbox 全局升级 Proxy 陷阱（`has` 恒真 + `get` 三级解析：测试 mock → 白名单（空 vm 沙箱全局——纯 JS 语言内建、随语言升级自动跟随——外加浏览器普遍存在的 `console`）→ 其余抛错点名）。浏览器函数误引模块级标识符、`typeof` 探测、缺 mock 全部在 `npm test` 爆炸而非线上。
- **verdictFor 迁入 _shared.js**：徽章判定表本就是服务端 renderUi 与浏览器 init 共用的纯函数，迁入后两个宿主文件的序列化来源统一为 `shared` 命名空间，机制完全对称（[判定表笔记](../simplification/2026-08-27-verdict-single-source.md)事实已同步）。

线上行为零变化：`UI_SCRIPT`/`WEBRTC_SCRIPT` 导出不变，页面产物函数集合与原先手工数组精确一致（两页各 8 函数 + 胶水），66+17+14 断言全绿。

## Alternatives considered

### 手写 lexer 闭包漫游序列化器（browserScript(entry) 解析自由标识符）
interface 最深（一行、无任何清单），但 implementation 需要一个正确处理字符串/注释/正则字面量/属性访问/对象键/局部声明的 mini-lexer（约 150-250 行微妙代码）；本代码库正则字面量密集，误判面大。复杂度只活在机制内部，理解税却由每个未来维护者支付，违反「boring 方案优先」的认知负荷原则。放弃。

### 保留手工数组 + 机械校验器（vm 探针验证闭包）
改动最小、最 boring，但「函数定义 + 数组」两处知识保留——忘登记由校验器在门禁期喊停而非结构性不可能，正确性靠验证而非构造。按「正确性 > 稳定性」原则让位于作用域方案（其门禁收益由 Proxy 陷阱独立达成）。放弃。

### 序列化器显式依赖清单（browserScript(scope, { familyOf, isIpv6, … })）
作用域方案内唯一的变体分歧：每页手工列出跨模块助手。清单变小但仍是清单，与「消灭两处知识」的目标相悖；命名空间 grep 使 `_shared.js` 未来新增助手对两个页面零改动。放弃。

## Consequences

手工序列化数组退役；未来向页面脚本添加局部助手是纯函数书写（零登记步骤），添加跨模块助手只需正常 import——a85f852 类变更的机制性同步步骤消失。Proxy 陷阱首跑即拦截 `parseInt` 解析并逼出「空沙箱内建白名单」设计，当场验证了泄漏类缺陷的测试期可见性。
代价：作用域嵌套使两文件浏览器区段缩进 +2（一次性 diff churn）；`browserScript` 的剥壳不变式新增一条 esbuild 重印依赖（函数声明结构保留；符号名可在自由标识符避让下被改名——入口须命名 import 页面脚本引用的共享符号，由[打包门禁](../testing/2026-08-29-bundle-gate.md)把守）——[import 调研笔记](../process/2026-08-27-edgeone-makers-import-support-investigation.md)的 minify 回评条件同样覆盖本机制，升级 CLI 后重跑部署冒烟即可；序列化产物体积与原数组方案同量级（共享助手按引用拣选，未引用者不进页面）。
