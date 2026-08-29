# Agent Note: EdgeOne Makers 跨文件 import 支持调查

Status: implemented

## Problem

`edge-functions/index.js` 与 `edge-functions/[[default]].js` 曾各自内联同一组共享函数，而非提取到共享模块后 import。原因是 2024-08 时「边缘构建器对跨文件 import 的支持未经验证，失败即全站不可用」（见[客户端 IP 契约笔记](../architecture/2026-08-14-client-ip-acquisition-contract.md)）。本调查回答：当前 EdgeOne Makers 构建器是否支持跨文件 ESM import？

## Decision

**结论：支持（2026-08 实证，两级证据）。**

- **CLI 包反编译（静态一手证据）**：`edgeone` npm 包 v1.6.28 的边缘函数构建器（`edgeone-dist/cli.js`，完全 bundle/minify，关键逻辑可提取）对每个入口文件独立调用 esbuild：`buildSync({ entryPoints: [e], bundle: true, write: false, ... })`——**未传入 `external`**，esbuild 默认解析并内联所有本地相对路径 import。文件是否注册为路由由 `isPagesFunction`（检查源码含 `onRequest`）决定，纯工具模块（如 `_shared.js`）被过滤，不会注册为路由。官方文档对跨文件 import 无显式声明（无论支持与否；中国站子页 404、国际站文档 gated）；文档缺失不改变源码事实。
- **部署冒烟（动态实证，2026-08-27，一次性 Upload 项目 `ip-check-import-smoke`）**：`_shared.js` 迁移后真实部署——构建通过；`/4`、`/test`、`/api/self`、405、404 行为与迁移前一致；**toString 序列化语义存活但文本不保真**：esbuild 以 AST 重印函数源码（缩进 2→4 空格、单引号→双引号、单语句分支展开花括号、非 ASCII 字符串转 `\uXXXX` 转义、注释剥离），函数名保留、逻辑等价；部署产物中的实际页面脚本经 DOM 沙箱四路径验证（12 断言全绿，含 `\uFF0C` 中文分句路径）。

迁移已由[共享模块提取笔记](../simplification/2026-08-27-shared-module-extraction.md)实施。

## Alternatives considered

- **继续双份内联 + `consistency.mjs` 兜底（维持现状）**——零迁移风险但持续支付同步维护成本；原始前提证伪后该理由不再成立；放弃。
- **仅文档推断不实测**——构建器行为是平台事实，文档无显式声明时只有反编译与部署冒烟两类证据；放弃（两级证据均已执行）。
- **其他模块方案（`require`、动态 `import()`）**——运行时为 V8 ESM（`"type": "module"`），`require` 不可用；静态 import 已被 esbuild 解析，动态不必要；放弃。

## Consequences

跨文件 import 从「未验证的未知」变为「已验证的事实」；双份内联 + 文本一致性门禁的时代结束（`test/consistency.mjs` 退役，[一致性笔记](../../archived/testing/2026-08-15-dual-inline-consistency-and-test-gates.md)归档）。
残余风险与边界：

- 证据基于 CLI v1.6.28 与 2026-08-27 的实际构建行为；平台未来升级构建器、尤其启用压缩/改名（minify），会破坏 toString 序列化机制（函数名被改写即页面脚本失效）——升级 `edgeone` CLI 后应重跑一次部署冒烟（对比页面内嵌脚本函数名 + DOM 沙箱行为）。2026-08-29 起该回评条件同样覆盖[页面脚本作用域](../architecture/2026-08-29-page-script-scope-and-browserscript.md)的剥壳不变式（`function 名() {` 起始、末 `}` 收尾、签名无解构参数）；本地侧已由 simulate 的 browserScript 不变式断言 + DOM 沙箱执行覆盖。
- esbuild 独立 bundle 每个入口，共享代码在两个入口产物中各出现一份（当前 ~130 行可忽略；增长到 KB 级再评估边缘函数体积限制）。
- 若未来能访问控制台内官方文档，应复核「支持」是否有官方显式声明。
