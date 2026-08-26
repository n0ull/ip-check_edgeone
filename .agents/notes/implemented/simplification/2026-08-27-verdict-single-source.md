# Agent Note: 徽章判定表收敛为单一可序列化实现（familyOf / verdictFor）

Status: implemented

## Problem

「family →（徽章文案, class)」判定表在 `index.js` 内部有两份实现：`renderUi` 的服务端首屏注入与浏览器 `init` 的校准逻辑，靠两组字面量断言（simulate.mjs 与 ui-dom.mjs）人工对齐——改一处措辞需同步两处实现与两个测试文件的断言字符串。family 三元（`isIpv6(ip) ? 'IPv6' : 'IPv4'`）自身出现 3 次，且已发生一次良性分叉（`'未知'` vs `'unknown'`），模式重复使下一次分叉无法区分「有意」与「漂移」。此外 ui-dom.mjs 的中文错误用例硬编码了 `handleV4` 错误文案的副本（副本写 `4.example.com`，与真实输出的 `4.<domain>` 占位符从不一致）——测试钉住的是副本，不是来源。

## Decision

- 新增共享函数 `familyOf(ip) → 'IPv6' | 'IPv4' | null`（两文件双份内联、export，自动落入交集一致性门禁）；空输入返回 null，未知标签由调用点按上下文补充（页面 `'未知'`、API `'unknown'`）——有意分叉从藏在三元里变为调用点显式可见；`handleTest`、`onRequest`、`/api/self` 的三元全部改经 `familyOf`；
- 新增 `verdictFor(family) → { text, cls } | null`（仅 index.js，页面专属）：IPv6/IPv4 两态徽章文案与完整 className 的唯一来源；`renderUi`（服务端首屏）与 `init`（浏览器校准）共用同一实现——后者经 `UI_SCRIPT` 的 `toString()` 序列化注入页面（复用[浏览器脚本即真实函数](2026-08-26-browser-js-as-real-functions.md)的既定机制；`isIpv6`/`familyOf`/`verdictFor` 追加进序列化清单，`isIpv6` 是 `familyOf` 的依赖，缺一即在页面上下文 ReferenceError）；
- **第三态不合并**：服务端 `'检测中…'`（尚未发生）与浏览器 `'无法判定'`（已失败）语义不同，各留调用点；模板占位符改为承载完整 className（`class="__VERDICT_CLS__"`），消除「`badge ` 前缀烙在模板、浏览器全量赋值」的半个隐式接口；
- 测试：`simulate.mjs` 对 `familyOf`/`verdictFor` 做纯函数断言（措辞契约钉在函数上）；`ui-dom.mjs` 中文错误用例改为从 `onRequest` 真实 400 输出派生期望值（`errBody.split('，')[0]`），钉来源不钉副本。

线上行为零变化（模板替换后输出逐字不变；JSON/响应头语义不变）。

## Alternatives considered

- **`familyOf` 直接返回 `'unknown'`、页面侧再映射 `'未知'`**——多一层间接，且把 API 语言泄漏进共享函数；放弃。
- **`verdictFor(family, variant)` 参数化第三态**——为两个语义不同的第三态造参数是过度抽象；放弃。
- **ui-dom 保留硬编码副本**——服务端改标点时测试照样绿、线上才断；放弃。

## Consequences

措辞契约从 4 处收敛到 1 张表：改措辞只改 `verdictFor` 一处实现 + 一处纯函数断言；浏览器与服务端在构造上不可能再分叉。`familyOf` 是交集门禁（见[一致性笔记](../../archived/testing/2026-08-15-dual-inline-consistency-and-test-gates.md)）自动纳管的第一个新共享函数。
代价：`UI_SCRIPT` 序列化清单变长（8 个函数）；`verdictFor`/`familyOf` 需保持浏览器兼容写法（ES5 风格）；序列化函数的依赖必须一并入清单（本次 `isIpv6` 漏列曾在门禁中当场暴露）。
