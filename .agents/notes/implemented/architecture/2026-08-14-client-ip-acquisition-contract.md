# Agent Note: 客户端 IP 获取契约

Status: implemented

## Problem

IP 查询服务的正确性完全取决于**客户端真实 IP** 的获取。两个风险：其一，EdgeOne 边缘函数如何暴露客户端源地址；其二，常见代理头（`X-Forwarded-For` 等）可被客户端伪造，若生产环境回退读取这些头，任何人都能把任意 IP 塞进响应。

## Decision

`getClientIp(request)`（`edge-functions/index.js` 与 `edge-functions/[[default]].js` 各自内联同一实现）按环境分层：

- **生产环境**（存在 `request.eo` 对象）：只信 `request.eo.clientIp`——EdgeOne 边缘节点注入的客户端真实 IP。即使 `eo.clientIp` 缺失也**不再回退代理头**（宁可返回空导致 400，也不返回可伪造的值）。
- **本地调试**（`edgeone makers dev`，无 `eo` 对象）：回退常见代理头（`x-forwarded-for` 首个地址、`x-real-ip`、`true-client-ip`、`eo-client-ip`、`cf-connecting-ip`），仅用于本地联调。

两个函数文件不跨文件 import（边缘构建器兼容性优先），工具函数各自内联、保持同一实现。

## Alternatives considered

- **生产环境也回退代理头**——`X-Forwarded-For` 可由任意客户端伪造，回显服务将输出攻击者控制的地址，破坏服务可信度；放弃。
- **抽公共模块 `_lib.js` 供两文件 import**——边缘构建器对跨文件 import 的支持未经验证，失败即全站不可用；为确定性牺牲少量重复，两文件各内联约 20 行。

## Consequences

线上返回的 IP 只可能来自 EdgeOne 注入的真实源地址；伪造代理头的请求得到与无头请求相同的结果（400 或真实 IP）。
代价是两份内联拷贝需要同步维护（已在[约定笔记](../process/2026-08-14-agent-note-conventions.md)中列为事实性同步点）。