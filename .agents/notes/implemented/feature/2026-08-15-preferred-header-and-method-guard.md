# Agent Note: 响应头语义对齐与 HTTP 方法门禁

Status: implemented

## Problem

[协议族语义笔记](2026-08-14-protocol-family-semantics.md)规定 IPv4 连接只称『连接』不称『优先』，JSON 的 `ipv6Preferred` 已仅在 IPv6 时输出；但纯文本响应头 `x-ip-preferred` 在 IPv4 连接时仍输出 `IPv4`——同一语义契约在两种表示上不一致，API 消费者仍可能把『IPv4 连接』误读为『IPv4 优先』。
另外，所有端点对任意 HTTP 方法（POST/PUT/DELETE…）都照常返回 IP 或页面，方法语义混乱，缺少拒绝面。

## Decision

两处收紧（`index.js` 与 `[[default]].js` 双份内联同步，由[一致性校验](../../archived/testing/2026-08-15-dual-inline-consistency-and-test-gates.md)机械防漂移）：

- **响应头对齐**：`handleTest` 的 `x-ip-preferred` 与 JSON 的 `ipv6Preferred` 执行同一规则——仅当本次连接确为 IPv6 时输出 `x-ip-preferred: IPv6`；IPv4 连接不输出该头（头部缺失即『无法判定』，而非显式否定）。`x-ip-family` 不变，两种协议族均输出；
- **方法门禁**：共享函数 `methodGuard(request)`（两文件内联同一实现）先检查 `request.method`，非 GET/HEAD 一律返回 405（纯文本 `仅支持 GET/HEAD 请求。` + `Allow: GET, HEAD` 头），放行返回 `null`；两个 `onRequest` 入口首先调用它，先于 Host 分发与路径路由生效。具名化使其随交集推导自动纳入一致性门禁（初版为匿名块内联，曾不受门禁覆盖）。

## Alternatives considered

- **保留 `x-ip-preferred: IPv4`**——与语义笔记的措辞纪律直接冲突（IPv4 连接无法判定策略优先），且与 JSON 表示不一致；放弃。
- **405 返回 JSON 错误体**——本服务端点以纯文本为主（curl 场景），统一 `textResponse` 更一致；机器可读信息由 `Allow` 头承载；放弃。
- **对非 GET 方法静默按原逻辑处理**（原行为）——方法语义混乱，且无合法用例；IP 回显无副作用不等于接受任意方法；放弃。

## Consequences

响应头与 JSON 字段的『优先』语义完全对齐：IPv4 连接时 API 不再输出任何 preferred 信号；非 GET/HEAD 请求得到明确的 405 与 `Allow` 提示。
代价是破坏性变更：依赖 `x-ip-preferred: IPv4` 的客户端需改为按头部缺失处理；测试断言与 README 端点说明已同步。
