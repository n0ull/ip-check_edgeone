---
name: ip-service-workflow
description: 'IP 查询服务（EdgeOne Makers Edge Functions）的开发、验证、部署与线上排查工作流——修改 edge-functions/ 代码、运行本地测试、部署到 overseas 区域、绑定自定义域名与站点设置、排查 curl/网页访问异常时使用，或请求如 "部署" "更新函数" "提交" "curl 无返回" "域名配置" 时。'
---

# IP 查询服务工作流

本项目为 EdgeOne Makers 边缘函数 IP 查询服务（`4.ip.<域名>` 强制 IPv4 / `test.ip.<域名>` 双栈判定 / `ip.<域名>` 网页）。
本工作流覆盖开发、验证、部署、域名与线上排查；决策依据见 [Agent Notes](../../notes/README.md)。

## 事实源（读取，不重新总结）

- [notes/README.md](../../notes/README.md) —— Agent Note 体系与格式契约；非平凡变更必须携带笔记。
- [部署与域名笔记](../../notes/implemented/process/2026-08-14-deployment-area-and-domain-management.md) —— 区域参数、CNAME、站点开关、兜底预案。
- [架构笔记](../../notes/implemented/architecture/2026-08-14-platform-constraints-and-three-domain-design.md) —— 三域名设计、6. 子域为何不存在。
- [README.md](../../../README.md) —— 部署手册与端点表。

## 变更主流程

功能/架构级改动先经 /grill-with-docs 或 /improve-codebase-architecture 定案；小改动直接实现。顺序：

1. 实现：代码 + 测试断言 + Agent Note（非平凡变更强制，见 [notes/README.md](../../notes/README.md)）。
2. 门禁全绿（语法 + `npm test`，细则见下节）。
3. **审查（提交前）**：/code-review 双轴审查（Standards + Spec）；有发现先修再提交。纯文档/注释编辑豁免。审查代理用普通子代理即可；若子代理默认模型再次失效，回退通道为 workflow 显式指定 provider/model（kimi-coding / kimi-for-coding，见[主流程笔记](../../notes/implemented/process/2026-08-26-workflow-main-flow.md)）。
4. 提交；pre-commit 钩子自动复检门禁。
5. 部署并线上验证（见『部署』『线上排查』）。

## 开发与本地验证

1. 修改 `edge-functions/` 前先阅读对应 Agent Note，确认行为变更是否需要更新笔记；共享函数集中在 `edge-functions/_shared.js`，两入口文件 import 使用，修改共享逻辑只改一处（见[客户端 IP 契约笔记](../../notes/implemented/architecture/2026-08-14-client-ip-acquisition-contract.md)）；浏览器脚本（`UI_SCRIPT` 在 `index.js`、`WEBRTC_SCRIPT` 在 `[[default]].js`）各留宿主文件。
2. 语法与逻辑验证：`node --check edge-functions/index.js`、`node --check "edge-functions/[[default]].js"` 与 `node --check edge-functions/_shared.js`，然后 `npm test`（全量本地门禁，构成以 `package.json` 的 `test` script 为权威）。
3. 本地联调可 `edgeone makers dev`（8088 端口；路径端点见 [README 端点表](../../../README.md#endpoints)；无 `eo` 时回退代理头）。

## 部署

- **生产**：`git push origin main`——控制台 Git 集成触发平台侧构建发布（本项目为 GitHub Provider，CLI 直传会被平台拒绝，见[部署路径修正笔记](../../notes/implemented/process/2026-08-27-actions-removed-console-git-integration.md)）。
- **冒烟/临时验证**（仅限 Upload Provider 的一次性项目）：`npx edgeone makers deploy -n <项目名> -a overseas`（`-a` 区域参数不持久化，必须携带）。默认域名受访问保护：先命中部署输出中的令牌 URL 种 Cookie（令牌 URL 会 302 到干净 URL），后续请求带 Cookie 访问；绑定自定义域名后无需令牌。

## 域名与站点设置

以[部署与域名笔记](../../notes/implemented/process/2026-08-14-deployment-area-and-domain-management.md)为唯一权威（DNS 全 CNAME 灰云、站点开关、HSTS/OCSP、项目级 IPv6 开关兜底预案）；操作前读取该笔记，不在此重新枚举。

## 线上排查

1. 区分服务状态与访问方式：`curl https://4.ip.<域名>/` 应返回 IPv4；`curl http://…` 会收到 301 空 body（无输出是正常的，用 `https://` 或 `-L`）；默认域名不带令牌 Cookie 会 401。
2. 验证服务本身：`node` 脚本请求 `/4` `/test` `/api/self`（带 Cookie），对照 [README 端点表](../../../README.md) 的『五、端点汇总』一节。
3. 检查 DNS：`Resolve-DnsName` 确认 `4.` 仅 A 记录、`test.`/`ip.` 双栈，最终解析到 EdgeOne 地址（`*.pages.dnsoe*.com` 的 A/AAAA）。
4. 行为变更（协议族语义、端点、响应头）更新测试断言并同步 README 与 Agent Note。