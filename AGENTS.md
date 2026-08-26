# AGENTS.md — IP 查询服务站立命令

本项目是 EdgeOne Makers 边缘函数 IP 查询服务：`4.ip.<域名>` 强制 IPv4、`test.ip.<域名>` 双栈判定、`ip.<域名>` 网页。

- **三域名设计是平台约束下的定案**：无 `6.` 子域（平台无法强制仅 IPv6，与 `test.` 重复）；IPv6 地址由双栈结果派生。[理由](.agents/notes/implemented/architecture/2026-08-14-platform-constraints-and-three-domain-design.md)
- **生产环境 IP 只信 `request.eo.clientIp`**，不回退可伪造的代理头；共享函数集中在 `edge-functions/_shared.js`，两入口文件 import 使用。[契约](.agents/notes/implemented/architecture/2026-08-14-client-ip-acquisition-contract.md)
- **部署必须带 `-a overseas`**（区域参数不持久化，漏带回退 global；区域不可变，换区域须删项目重建）；DNS 全 CNAME 且 Cloudflare 灰云；`4.` 站点关 IPv6。[管理](.agents/notes/implemented/process/2026-08-14-deployment-area-and-domain-management.md)
- **语义措辞严谨**：IPv4 连接只称『连接』不称『优先』；`ipv6Preferred` 仅在 IPv6 时输出。[语义](.agents/notes/implemented/feature/2026-08-14-protocol-family-semantics.md)
- **非平凡变更必须携带 Agent Note**（格式契约见 [.agents/notes/README.md](.agents/notes/README.md)，机械校验 `npm run verify:notes`）；修改函数行为后同步更新测试断言与 [README.md](README.md)。
- **开发验证**：`npm test`（simulate 逻辑断言 + ui-dom/webrtc-dom 沙箱 + verify:notes）+ `node --check` 两个函数文件与 `_shared.js`；**提交前 /code-review 双轴审查**（纯文档编辑豁免）；pre-commit 钩子自动执行（`npm install` 启用）；部署用 `npm run deploy`。[工作流](.agents/skills/ip-service-workflow/SKILL.md)

## Agent skills

### Issue tracker

Issues 与 spec 存放于本仓库的 GitHub Issues，通过 `gh` CLI 操作。详见 `docs/agents/issue-tracker.md`。

### Triage labels

使用五个标准 triage 标签原名：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。详见 `docs/agents/triage-labels.md`。

### Domain docs

决策与 ADR 一律写 `.agents/notes/`（本仓库不用 `docs/adr/`）；`CONTEXT.md` 术语表按需惰性创建。详见 `docs/agents/domain.md`。
