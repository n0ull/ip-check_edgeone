# Agent Note: 平台约束下的三域名 IP 查询架构

Status: implemented

## Problem

在 EdgeOne Makers（边缘函数 + 自定义域名）上实现 IP 查询服务，需求是：`curl 4.ip.<域名>` 返回访问者 IPv4、`curl test.ip.<域名>` 返回本次连接 IP（IPv6 即 IPv6 访问优先）、`ip.<域名>` 提供网页并展示 IPv4/IPv6/是否 IPv6 优先。
平台约束显著收窄了实现空间：

- 自定义域名**只提供 CNAME 接入**，无法用自有 DNS 的 A/AAAA 记录拆分协议族；
- 每个站点的协议族开关只有两态：**IPv6 关（仅 IPv4 可达）** 与 **IPv6 开（双栈）**，不存在『仅 IPv6』状态；
- 区域与项目在**部署时绑定**，同一项目区域不可变，更换区域只能删除项目重建（见[部署区域笔记](../process/2026-08-14-deployment-area-and-domain-management.md)）。

## Decision

采用**三域名**架构，全部 CNAME 接入：

| 域名 | 站点设置 | 语义 |
| --- | --- | --- |
| `ip.<域名>` | IPv6 开 · HTTP/2 开 | 查询网页（双栈） |
| `4.ip.<域名>` | **IPv6 关** · HTTP/2 开 | **仅 IPv4 可达**，curl 必返 IPv4 |
| `test.ip.<域名>` | IPv6 开 · HTTP/2 开 | 双栈测试端点，返回本次连接 IP |

**不提供 `6.ip.<域名>`**：平台无法强制某域名仅 IPv6（站点开关只能关闭 IPv6），双栈下的 `6.` 与 `test.` 行为完全相同且无法保证返回 IPv6，属无效设计。
IPv6 地址一律由双栈连接结果**派生**：`test.` 在 IPv6 连接下返回的地址即访问者的 IPv6；网页的 IPv6 卡片同理。

函数按 Host 子域名分发（`edge-functions/index.js` 匹配 `/`，`[[default]].js` 匹配其余路径）：

- `4.` → 若连接为 IPv4 返回该地址；若（开关失效时）看到 IPv6 源，返回 400 指引而非错误数据——**宁可报错不可说谎**；
- `test.` → 返回连接 IP，IPv4 连接不输出 `ipv6Preferred` 字段（无法判定，见[协议族语义笔记](../feature/2026-08-14-protocol-family-semantics.md)）；
- 其余 Host → 网页；
- `[[default]].js` 提供同逻辑路径端点 `/4` `/test` `/api/self`（本地调试与回退兜底）。

`4.` 的 IPv4 语义由『站点关 IPv6 + 双栈客户端 Happy Eyeballs 回退』保证：EdgeOne 不再为该域名提供 IPv6 接入，双栈客户端自动回退 IPv4 连接，边缘函数必然看到 IPv4 源地址。

## Alternatives considered

- **DNS 记录按协议族拆分**（`4.` 用 A 记录、`6.` 用 AAAA 记录，仿 4.ipw.cn/6.ipw.cn）——平台只提供 CNAME，无法实施；且 AAAA 直填 EdgeOne 任播地址属于非官方做法，弃用。
- **保留 `6.ip.<域名>` 作为尽力而为的 IPv6 查询**——它只是 `test.` 的子集（双栈下返回连接 IP），无法保证 IPv6 语义，与 `test.` 重复；移除后功能由 `test.` 完全覆盖，且域名绑定从 4 个减到 3 个。代码中的 `case '6'` 与 `/6` 路径端点兼容面后亦全量删除，见[移除 6. 兼容面笔记](../simplification/2026-08-26-remove-v6-compat-surface.md)。
- **全部使用路径端点**（`ip.<域名>/4` 等，不建子域）——违背原始需求（`curl 4.ip.<域名>`、`curl test.ip.<域名>`），弃用；路径端点仅作为本地调试与回退兜底存在。
- **把 `4.` 拆到第二个 Makers 项目**（项目级关 IPv6）——仅在控制台缺少按域名独立 IPv6 开关时作为兜底方案记录在案（见[部署与域名笔记](2026-08-14-deployment-area-and-domain-management.md)），不作为默认设计。

## Consequences

`curl 4.ip.<域名>` 在任意网络下必返访问者 IPv4；`test.` 返回连接 IP 并诚实表达『IPv6 访问优先 / IPv4 连接（无法判定）』；网页展示 IPv4、IPv6（派生）、判定徽章。
代价是：IPv6 地址无法独立保证获取——纯 IPv4 网络下网页与 `test.` 均无 IPv6 信息，这是平台能力边界内的最优解，与 ip.sb、test-ipv6.com 等成熟服务的取舍一致（它们有自有双栈节点才能提供 AAAA-only 主机名）。
域名绑定数量 3 个，DNS 全部 CNAME；`4.` 的 IPv4 语义依赖站点开关配置正确，配置遗漏时函数以 400 兜底而非返回错误数据。