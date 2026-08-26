# Agent Note: 客户端 IP 获取契约

Status: implemented

## Problem

IP 查询服务的正确性完全取决于**客户端真实 IP** 的获取。两个风险：其一，EdgeOne 边缘函数如何暴露客户端源地址；其二，常见代理头（`X-Forwarded-For` 等）可被客户端伪造，若生产环境回退读取这些头，任何人都能把任意 IP 塞进响应。

## Decision

`getClientIp(request)`（由 `edge-functions/_shared.js` 统一提供，`index.js` 与 `[[default]].js` 各自 import）按环境分层：

- **生产环境**（存在 `request.eo` 对象）：只信 `request.eo.clientIp`——EdgeOne 边缘节点注入的客户端真实 IP。即使 `eo.clientIp` 缺失也**不再回退代理头**（宁可返回空导致 400，也不返回可伪造的值）。
- **本地调试**（`edgeone makers dev`，无 `eo` 对象）：回退常见代理头（`x-forwarded-for` 首个地址、`x-real-ip`、`true-client-ip`、`eo-client-ip`、`cf-connecting-ip`），仅用于本地联调。

共享函数（`getClientIp`、`familyOf`、`methodGuard`、`handleV4`、`handleTest` 等）集中在 `_shared.js`，两入口文件不再内联副本。边缘构建器对每个入口独立执行 esbuild `bundle: true`（无 `external`），本地相对路径 import 在构建期被解析并内联，行为与原先双份内联等价，但实现唯一化。决策经过见[共享模块提取笔记](../simplification/2026-08-27-shared-module-extraction.md)与[import 调研笔记](../implemented/process/2026-08-27-edgeone-makers-import-support-investigation.md)。

## Alternatives considered

- **生产环境也回退代理头**——`X-Forwarded-For` 可由任意客户端伪造，回显服务将输出攻击者控制的地址，破坏服务可信度；放弃。
- **继续双份内联 + `consistency.mjs` 机械兜底**（原定案）——2024-08 时边缘构建器对跨文件 import 的支持未经验证，以"失败即全站不可用"为由选择双份内联，并以 `test/consistency.mjs` 机械校验双份一致。2026-08 调研（[import 调研笔记](../implemented/process/2026-08-27-edgeone-makers-import-support-investigation.md)）证实当前 CLI 构建器基于 esbuild `bundle: true`（无 `external`），跨文件 import 安全；原始前提失效，按"正确性 > 稳定性"原则迁移到共享模块。

## Consequences

线上返回的 IP 只可能来自 EdgeOne 注入的真实源地址；伪造代理头的请求得到与无头请求相同的结果（400 或真实 IP）。
共享函数集中在 `_shared.js`，实现唯一化，消除双份同步维护负担；`test/consistency.mjs` 随之退役（见[共享模块提取笔记](../simplification/2026-08-27-shared-module-extraction.md)）。
代价是边缘构建 bundle 时共享代码在两个入口产物中各出现一份——对当前 ~120 行工具函数可忽略。