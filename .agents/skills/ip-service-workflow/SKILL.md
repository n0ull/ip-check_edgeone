---
name: ip-service-workflow
description: 'IP 查询服务（EdgeOne Makers Edge Functions）的开发、验证、部署与线上排查工作流——修改 edge-functions/ 代码、运行本地测试、部署到 overseas 区域、绑定自定义域名与站点设置、排查 curl/网页访问异常时使用，或请求如 "部署" "更新函数" "curl 无返回" "域名配置" 时。'
---

# IP 查询服务工作流

本项目为 EdgeOne Makers 边缘函数 IP 查询服务（`4.ip.<域名>` 强制 IPv4 / `test.ip.<域名>` 双栈判定 / `ip.<域名>` 网页）。
本工作流覆盖开发、验证、部署、域名与线上排查；决策依据见 [Agent Notes](../../notes/README.md)。

## 事实源（读取，不重新总结）

- [notes/README.md](../../notes/README.md) —— Agent Note 体系与格式契约；非平凡变更必须携带笔记。
- [部署与域名笔记](../../notes/implemented/process/2026-08-14-deployment-area-and-domain-management.md) —— 区域参数、CNAME、站点开关、兜底预案。
- [架构笔记](../../notes/implemented/architecture/2026-08-14-platform-constraints-and-three-domain-design.md) —— 三域名设计、6. 子域为何不存在。
- [README.md](../../../README.md) —— 部署手册与端点表。

## 开发与本地验证

1. 修改 `edge-functions/` 前先阅读对应 Agent Note，确认行为变更是否需要更新笔记；`getClientIp` 与响应工具函数在 `index.js` 与 `[[default]].js` 双份内联，改一必改二。
2. 语法与逻辑验证：`node --check edge-functions/index.js` 与 `node --check "edge-functions/[[default]].js"`，然后 `npm test`（`test/simulate.mjs`，覆盖 Host 分发、路径端点、防伪造、UI 注入与措辞断言）。
3. 本地联调可 `edgeone makers dev`（8088 端口，`/4` `/6` `/test` 路径端点；无 `eo` 时回退代理头）。

## 部署

```sh
npm run deploy          # = edgeone makers deploy -a overseas（区域参数不持久化，必须携带）
npm run deploy:preview  # 预览环境
```

部署输出包含默认域名与令牌 URL（默认域名受访问保护，浏览器打开后种 Cookie 方可访问）；绑定自定义域名后无需令牌。

## 域名与站点设置

- DNS（Cloudflare）：`ip.`/`4.ip.`/`test.ip.` 全部 **CNAME** 且 **DNS only（灰云）**——橙云代理会使 `request.eo.clientIp` 拿到 CF 节点地址，IP 回显失真。
- 站点设置：`4.` 关 IPv6 访问（强制仅 IPv4）、`ip.`/`test.` 开；HTTP/2 开；HTTPS 跳转 301；HSTS `max-age=31536000` + `includeSubDomains`（preload 关）；OCSP 装订开。
- 若控制台只有项目级 IPv6 开关：`4.` 拆第二个 Makers 项目，`ip.`/`test.` 留原项目。

## 线上排查

1. 区分服务状态与访问方式：`curl https://4.ip.<域名>/` 应返回 IPv4；`curl http://…` 会收到 301 空 body（无输出是正常的，用 `https://` 或 `-L`）；默认域名不带令牌 Cookie 会 401。
2. 验证服务本身：`node` 脚本请求 `/4` `/test` `/api/self`（带 Cookie），对照 [README 端点表](../../../README.md) 的『六、端点汇总』一节。
3. 检查 DNS：`Resolve-DnsName` 确认 `4.` 仅 A 记录、`test.`/`ip.` 双栈，最终解析到 EdgeOne 地址（`*.pages.dnsoe*.com` 的 A/AAAA）。
4. 行为变更（协议族语义、端点、响应头）更新测试断言并同步 README 与 Agent Note。