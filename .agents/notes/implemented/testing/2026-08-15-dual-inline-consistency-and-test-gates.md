# Agent Note: 双文件一致性校验与测试门禁整合

Status: implemented

## Problem

[客户端 IP 契约](../architecture/2026-08-14-client-ip-acquisition-contract.md)要求 `index.js` 与 `[[default]].js` 双份内联同一实现、『改一必改二』，但该约束此前只有人工约定，且漂移已实际发生：`handleV4`/`handleV6` 的错误文案两文件曾不一致（详细版与简短版并存）。
测试同时存在缺口：主页 UI 的内嵌 JS 只断言字符串包含、无语法有效性校验（`/webrtc` 页有，主页没有，而两者同样受外层字符串消化转义的影响）；`Accept: application/json` 协商路径无断言；`verify:notes` 游离于 `npm test` 之外，提交前可能漏跑。

## Decision

- 新增 `test/consistency.mjs`：从两个函数文件提取 9 个共享函数（`isIpv4`/`isIpv6`/`getClientIp`/`baseHeaders`/`textResponse`/`jsonResponse`/`wantsJson`/`handleV4`/`handleTest`；`handleV6` 已随[移除 6. 兼容面](../simplification/2026-08-26-remove-v6-compat-surface.md)删除）的源码（按花括号配对提取，约束为函数体内字符串/正则中的花括号成对出现），仅归一化行尾差异后逐字比对；配套把 `handleV4`/`handleV6` 的漂移文案统一为详细版；
- `test/simulate.mjs` 补充 `Accept: application/json` 协商断言与两个 405 方法门禁断言（主页 UI 的 `new Function` 语法冒烟断言已随[浏览器脚本即真实函数](../simplification/2026-08-26-browser-js-as-real-functions.md)退役——脚本改为真实函数后，语法由模块 import 与 `node --check` 直接保证）；
- `npm test` 串起全部本地验证：`simulate.mjs` → `ui-dom.mjs` → `webrtc-dom.mjs` → `consistency.mjs` → `verify-agent-notes.mjs`（`ui-dom.mjs` 后增，见[浏览器脚本即真实函数](../simplification/2026-08-26-browser-js-as-real-functions.md)），一个命令即完整门禁，同时挂入 pre-commit 钩子（见[提交前预检笔记](../process/2026-08-15-pre-commit-gate.md)）。

## Alternatives considered

- **抽公共模块供两文件 import，从根上消除重复**——[IP 契约笔记](../architecture/2026-08-14-client-ip-acquisition-contract.md)已定案：边缘构建器对跨文件 import 的支持未经验证，失败即全站不可用；重复是确定性代价，机械校验是与该定案兼容的防漂移方式。
- **仅靠评审纪律防漂移**——漂移已在有评审纪律的情况下发生（两版文案并存），人工约定不足以兜底；放弃。

## Consequences

『改一忘改二』在本地测试阶段即失败，不再依赖人肉同步；`npm test` 单命令覆盖逻辑断言、双页 DOM 沙箱、双文件一致性与笔记格式。
代价：共享函数源码被锁定为逐字一致（含注释与字符串内空白），微调必须双份同步——这正是契约要求的纪律，改由机械门禁执行；花括号配对的提取方式要求函数体内花括号成对出现，新增共享函数时需遵守。
