# Agent Note: 部署、区域与域名管理

Status: implemented

## Problem

部署与接入环节存在多个平台事实，操作错误会导致项目错乱或服务失效：区域与项目在部署时绑定且**同项目不可变**（换区域只能删项目重建）；`-a` 区域参数**不持久化**（漏带即回退 global）；自定义域名只给 CNAME；域名在 Cloudflare 托管且无 ICP 备案；默认域名有令牌访问保护。

## Decision

- **部署命令固定携带 `-a overseas`**：`package.json` 的 `npm run deploy` / `deploy:preview` 已内嵌该参数，CLI 手输命令同样必须带；区域切换会造成 CLI 另建同名项目，旧项目需在控制台删除。当前活跃项目为 overseas 区域 Production 部署（项目 ID 见 Makers 控制台）。
- **DNS 全部 CNAME**：`ip.`/`4.ip.`/`test.ip.` 三条记录指向 Makers 分配的 CNAME（形如 `*.pages.dnsoe*.com`）；Cloudflare 侧必须为 **DNS only（灰云）**——代理模式下 EdgeOne 看到的源地址是 CF 节点而非真实用户，IP 回显失真且多一跳。
- **站点设置**：`4.` 关闭 IPv6 访问（强制仅 IPv4）、`ip.`/`test.` 开启；HTTP/2 全部开启；HTTPS 强制跳转 301；HSTS `max-age=31536000` 且 `includeSubDomains`（`preload` 关闭——提交 hstspreload 后极难撤回）；OCSP 装订开启。
- **兜底预案**：若控制台只有项目级 IPv6 开关（无按域名独立开关），把 `4.` 拆到第二个 Makers 项目（项目级关 IPv6），`ip.`/`test.` 留原项目——CNAME 接入下跨项目零成本。
- **默认域名访问保护**：CLI 直传项目的默认域名（形如 `<项目名>-<随机串>.<区域后缀>`）需令牌 Cookie 访问，绑定自定义域名后公开。

## Alternatives considered

- **A/AAAA 记录强制协议族**——平台只给 CNAME；放弃（详见[架构笔记](../architecture/2026-08-14-platform-constraints-and-three-domain-design.md)）。
- **切换到 DNSPod NS**——用户域名为 Cloudflare 托管；NS 迁移非必需（灰云解析已足够快），且用户对切换有顾虑；保留 CF，仅要求灰云。
- **HTTP 强制跳转 302**——http→https 是永久迁移，301 语义正确且可被 curl -L/浏览器缓存；同时向用户说明 `curl http://…` 不带 `-L` 会收到 301 空 body（无返回），curl 用法以 `https://` 为准。

## Consequences

服务在无备案约束下达到 EdgeOne 海外节点的最优路径（CF 灰云 → 直连 EdgeOne 亚太节点）。
代价：`-a overseas` 漏带会导致项目回到 global 区域（需重新部署修正）；`4.` 的 IPv4 语义依赖站点开关配置正确；国内访问延迟为海外节点水平（30~100ms），备案后切回含大陆区域需删项目重建。