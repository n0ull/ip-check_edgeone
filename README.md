# IP 查询服务（EdgeOne Makers · Edge Functions）

基于腾讯云 [EdgeOne Makers](https://cloud.tencent.com/document/product/1552/127423)（原 EdgeOne Pages）的
**Edge Functions（边缘函数）** 实现的轻量 IP 查询服务，无后端、无数据库、免费额度即可运行：

- `curl 4.ip.<域名>` → 直接返回访问者的 **IPv4** 地址（纯文本）
- `curl test.ip.<域名>` → 返回本次双栈连接实际使用的 IP：**返回 IPv6 地址即代表 IPv6 访问优先**（该 IPv6 即你的 IPv6 地址）
- 浏览器访问 `https://ip.<域名>` → 查询网页（UI），展示 IPv4、IPv6（经双栈测试派生）、是否 IPv6 优先
- 仅返回 IP 地址，不包含 IP 属地、ASN 信息

## 工作原理

```text
                        ┌──────────────────────────────┐
 curl 4.ip.example.com │ EdgeOne 全球边缘节点           │
 curl test.ip...       │  ├─ Edge Functions (index.js)  │
 浏览器 ip.example.com │  │   按 Host 子域名分发：       │
                        │  │   4.   → 返回 IPv4           │
                        │  │   test → 返回连接 IP（IPv6  │
                        │  │          即 IPv6 访问优先） │
                        │  │   ip.  → 返回查询网页        │
                        │  └──────────────────────────────┘
                        └──────────────────────────────┘
客户端 IP 由边缘节点通过 request.eo.clientIp 注入，不依赖任何第三方服务。
```

### 如何保证 4. 返回 IPv4？

EdgeOne 自定义域名只提供 **CNAME** 解析；Makers 控制台支持对**每个站点（自定义域名）单独设置 IPv6 访问与 HTTP/2**。
站点开关只有两个状态：IPv6 关（仅 IPv4）与 IPv6 开（双栈）——**不存在“仅 IPv6”状态**。
因此 `4.` 可以强制，`6.` 无法强制，设计为三个域名：

| 主机记录 | 记录类型 | 站点设置 | 效果 |
| --- | --- | --- | --- |
| `ip.example.com` | CNAME | IPv6 访问：开 · HTTP/2：开 | 查询网页（双栈） |
| `4.ip.example.com` | CNAME | **IPv6 访问：关** · HTTP/2：开 | **仅 IPv4 可达**，curl 必然返回 IPv4 |
| `test.ip.example.com` | CNAME | IPv6 访问：开 · HTTP/2：开 | 双栈测试端点 |

原理：`4.` 站点关闭 IPv6 访问后，EdgeOne 不再为该域名提供 IPv6 接入，双栈客户端（如 curl 的 Happy Eyeballs）
自动回退到 IPv4 连接，边缘函数必然看到 IPv4 源地址并返回它。

不提供 `6.` 子域：平台无法强制仅 IPv6，其行为与 `test.` 重复。IPv6 地址由 `test.` 的双栈结果派生。决策记录见[架构笔记](.agents/notes/implemented/architecture/2026-08-14-platform-constraints-and-three-domain-design.md)。

网页抓取策略：卡片优先请求 `4.`、`test.` 子域，IPv6 卡片由双栈测试结果派生；未绑定自定义域名时自动回退到 `/4`、`/test` 路径端点并显示提示条，绑定后自动切换为精确结果。

## 项目结构

```text
ip-check/
├── edgeone.json            # Makers 项目配置（默认空即可）
├── package.json
├── edge-functions/
│   ├── index.js            # 匹配 "/"：查询网页 + 按 Host 分发 4./test.
│   └── [[default]].js      # 匹配其余路径：/4 /6 /test /api/* 等路径式端点
└── test/
    └── simulate.mjs        # 本地逻辑验证（无需部署即可运行：npm test）
```

## 一、部署前准备

1. 腾讯云账号并完成实名认证；
2. 在 [EdgeOne Makers 控制台](https://console.cloud.tencent.com/edgeone/makers) 一键开通 Makers（免费版即可，见[限制与配额](https://cloud.tencent.com/document/product/1552/132789)：Edge Functions 300 万次/月）；
3. 一个域名（本项目部署在“全球可用区（不含中国大陆）”，**无需 ICP 备案**；仅当加速区域含中国大陆时才要求备案）；
4. Node.js 18+。

## 二、项目结构与部署前准备

本项目是**完整的可部署项目**，无需创建项目、拉取官方模板或执行 `init`——项目 `ip-check` 已存在于 Makers 控制台，本目录即项目根：

- `edge-functions/` —— Edge Functions 函数：`index.js` 匹配 `/`（网页 + Host 分发），`[[default]].js` 匹配其余路径（路径式端点）；
- `edgeone.json`、`package.json`、`test/` —— 项目配置、npm 脚本与本地验证。

目录结构参考了官方模板 [functions-fetch](https://github.com/TencentEdgeOne/pages-templates)（纯 Edge Functions + 静态托管），去掉了框架部分。
完整模板列表见 [TencentEdgeOne/pages-templates](https://github.com/TencentEdgeOne/pages-templates) 或模板页 pages.edgeone.ai/templates。

部署前只需完成 CLI 安装与登录：

```bash
# 1) 安装 EdgeOne CLI
npm install -g edgeone
edgeone -v        # 验证安装
edgeone -h        # 查看全部命令

# 2) 登录（按提示选择 China 国内站，浏览器弹窗完成授权）
edgeone login
edgeone whoami    # 查看当前账号
```

> 提示：`edgeone makers create`（拉取官方模板）与 `edgeone makers init`（生成函数骨架）仅用于从零新建平行项目，本项目不需要执行。
> 旧版命令 `edgeone pages xxx` 过渡期内仍完全可用，与 `edgeone makers xxx` 等价。

## 三、本地调试

```bash
npm install        # 可选：本项目无第三方依赖，不执行亦可
edgeone makers dev
```

本地服务默认运行在 **8088** 端口：

- `http://localhost:8088/` → 查询网页
- `http://localhost:8088/4` → IPv4（本地调试无 `request.eo`，回退读取 `X-Forwarded-For`）
- `http://localhost:8088/6` → IPv6
- `http://localhost:8088/test` → 双栈测试

也可以先运行纯逻辑验证（无需任何环境）：

```bash
npm test
```

## 四、部署

### 方式 A：本地 CLI 部署

```bash
edgeone makers deploy -n ip-check -a overseas          # 生产环境（全球可用区，不含中国大陆）
edgeone makers deploy -n ip-check -e preview -a overseas   # 预览环境
```

> ⚠️ **注意：`-a` 区域参数不会持久化**，每次部署都必须带上（默认是 `global` 含中国大陆）。
> 已同步到 `package.json` 的 `npm run deploy`、`npm run deploy:preview`，直接使用脚本即可。

> **项目与区域**：项目名 `ip-check`，部署区域为全球可用区（不含中国大陆），无需 ICP 备案即可绑定自定义域名。控制台：Makers 控制台 → 项目 `ip-check`。
> 区域是部署时绑定属性：`-a` 参数每次部署需显式携带，默认会回退为 global；区域切换会导致 CLI 另建同名项目（见[部署管理笔记](.agents/notes/implemented/process/2026-08-14-deployment-area-and-domain-management.md)）。
> 更新代码后重新执行 `edgeone makers deploy -n ip-check` 即可增量发布。

**默认域名访问保护说明**：CLI 直传创建的项目，其默认域名（形如 `<项目名>-<随机串>.<区域后缀>`，后缀随区域分配）默认开启访问保护，
直接访问会返回 401；使用部署输出中的 URL（携带 `eo_token`/`eo_time` 参数）访问时浏览器会种下授权 Cookie。
绑定**自定义域名**（见第五节）后无需任何令牌即可公开访问，建议正式使用一律走自定义域名。

### 方式 B：Git 推送触发 CI 构建部署

```bash
git init && git add . && git commit -m "init ip-check"
git remote add origin <你的仓库地址>
git push -u origin main      # Makers 控制台关联仓库后自动构建部署
```

### 方式 C：CI/CD（无 Git 依赖）

```bash
edgeone makers deploy ./dist -n ip-check -a overseas -t $EDGEONE_API_TOKEN
```

API Token 在 Makers 控制台生成（文档：[API Token](https://cloud.tencent.com/document/product/1552/127422)）。

## 五、域名与 DNS 配置（关键步骤）

### 1. 添加自定义域名

进入 Makers 项目 → **域名管理** → 添加自定义域名，依次添加 3 个域名（免费版支持 200 个）：

```text
ip.example.com
4.ip.example.com
test.ip.example.com
```

按弹窗指引完成归属权验证；域名添加后平台会自动签发免费 SSL 证书。

### 2. 配置 DNS 记录（以 DNSPod 为例）

每个自定义域名添加后，平台会给出一个 CNAME 目标（形如 `a4285573.xxx.example.com.dns.edgeone.site.`），
**所有记录统一使用 CNAME**（EdgeOne 只提供 CNAME 接入），按下表配置：

| 主机记录 | 类型 | 记录值 | 说明 |
| --- | --- | --- | --- |
| `ip` | CNAME | Makers 分配的 CNAME | 查询网页入口 |
| `4.ip` | CNAME | Makers 分配的 CNAME | 配合站点关闭 IPv6 → 仅 IPv4 |
| `test.ip` | CNAME | Makers 分配的 CNAME | 双栈测试端点 |

### 3. 站点设置（IPv6 访问与 HTTP/2）

在 Makers 控制台进入**每个自定义域名**的设置（域名管理 → 对应域名 → 编辑/设置），按下表配置：

| 域名 | IPv6 访问 | HTTP/2 | 说明 |
| --- | --- | --- | --- |
| `ip.example.com` | 开 | 开 | 双栈网页 |
| `4.ip.example.com` | **关** | 开 | **强制仅 IPv4 可达**，curl 必然返回 IPv4 |
| `test.ip.example.com` | 开 | 开 | 双栈测试 |

> 原理：`4.` 关闭 IPv6 访问后 EdgeOne 不再提供该域名的 IPv6 接入，双栈客户端（Happy Eyeballs）自动回退 IPv4 连接，
> 边缘函数看到的就是 IPv4 源地址，从而返回访问者的 IPv4。
> 若控制台某域名没有独立的 IPv6 开关（仅项目级开关），关闭项目 IPv6 会使 ip./4./test. 全部变为仅 IPv4，此时 `test.` 将失去 IPv6 能力。
> 原则：`4.` 的 IPv4 语义优先保证，`test.` 的 IPv6 判定能力次之。

### 4. 验证

> 在绑定自定义域名之前，可先用默认域名 + 部署输出的令牌 URL 验证（浏览器打开该 URL 后，路径端点 `/4` `/6` `/test` 均可用；
> 网页上的 IPv4/IPv6 卡片需绑定自定义域名后才可抓取到对应子域）。

```bash
curl https://4.ip.example.com/       # 期望：你的 IPv4 地址（4. 站点已关 IPv6，仅 IPv4 可达）
curl https://test.ip.example.com/    # 期望：本次连接 IP；若为 IPv6 地址则 IPv6 访问优先（该地址即你的 IPv6）

curl "https://test.ip.example.com/?format=json"   # JSON 形式：{"ip":"...","family":"IPv6","ipv6Preferred":true}

# 浏览器打开
open https://ip.example.com/          # 网页：同时展示 IPv4 / IPv6 / IPv6 优先状态
```

## 六、端点汇总 <a id="endpoints"></a>

| 端点 | 返回 | 说明 |
| --- | --- | --- |
| `https://ip.<域名>/` | HTML 网页 | 展示 IPv4、IPv6、是否 IPv6 优先 |
| `https://4.ip.<域名>/` | 纯文本 IPv4 | 站点关闭 IPv6 访问后仅 IPv4 可达，必返 IPv4 |
| `https://test.ip.<域名>/` | 纯文本连接 IP | IPv6 即 IPv6 访问优先 |
| `https://ip.<域名>/4` | 纯文本 IPv4 | 路径式（本地调试用） |
| `https://ip.<域名>/6` | 纯文本 IPv6 | 路径式；仅 IPv6 连接时返回（尽力而为，同源调试用） |
| `https://ip.<域名>/test` | 纯文本连接 IP | 路径式（本地调试用） |
| `https://ip.<域名>/api/self` | JSON | `{"ip": "...", "family": "IPv4\|IPv6"}` |

所有端点均支持 `?format=json` 输出 JSON（Accept: application/json 亦可）。
响应头包含 `Access-Control-Allow-Origin: *`（网页跨子域请求需要）与 `Cache-Control: no-store`（IP 回显不能被缓存）。

## 常见问题

- **免费额度够吗？** 免费版 Edge Functions 300 万次/月、Cloud Functions 100 万次/月（见[限制与配额](https://cloud.tencent.com/document/product/1552/132789)），个人使用绰绰有余。
- **需要备案吗？** 本项目已切换为“全球可用区（不含中国大陆）”，绑定自定义域名**无需 ICP 备案**；如将来改回含中国大陆区域则需备案。
- **旧命令还能用吗？** 可以，`edgeone pages dev/deploy` 过渡期内与 `edgeone makers` 完全等价（执行时有 deprecation 提示），新功能（如 `edgeone makers create`）仅在新命名空间提供。
- **不想要 Makers、CLI，可以用控制台版边缘函数吗？** 可以。在 EdgeOne 控制台创建边缘函数，添加 3 条触发规则，分别绑定 `4.ip.<域名>/*`、`test.ip.<域名>/*`、`ip.<域名>/*`。
  函数体使用 `addEventListener('fetch')` 形式，读取 `request.eo.clientIp`，逻辑与本项目一致。同样无法强制仅 IPv6，故无 `6.` 子域。
- **换域名？** 函数按 Host 自动识别子域名，只需改 DNS 记录，无需改代码。

## 文档体系

项目文档分为三层，各司其职：

- **[AGENTS.md](AGENTS.md)** —— 站立命令：代理每次会话都需要的规则（三域名定案、IP 契约、部署参数、措辞纪律），每条一行并链接依据。
- **[.agents/notes/](.agents/notes/README.md)** —— Agent Note 决策记录。路径格式为 `notes/{生命周期}/{分类}/yyyy-mm-dd-主题.md`，统一格式为 `# Agent Note:` + `Status:` + `Problem`/`Decision`/`Alternatives considered`/`Consequences`，由 `npm run verify:notes` 机械校验。
  已记录五篇决策：平台约束、IP 契约、UI 回退、语义措辞、部署管理。`implemented/` 与 `archived/` 目录各有 AGENTS.md 定义维护边界与冻结规则。`skills/` 下为可复用工作流 [ip-service-workflow](.agents/skills/ip-service-workflow/SKILL.md)。
- **本文档** —— 部署参考手册：端到端操作步骤、DNS/站点配置表、端点与验证命令，不承载决策史。

规则：非平凡变更（行为、架构、契约、流程、测试策略、配置格式）必须同变更携带或更新 Agent Note；修改函数行为后同步更新测试断言与本表。

## 参考文档

- [EdgeOne CLI](https://cloud.tencent.com/document/product/1552/127423)
- [Makers Functions 概览](https://cloud.tencent.com/document/product/1552/127415)
- [Edge Functions](https://cloud.tencent.com/document/product/1552/127416)
- [Cloud Functions · Node.js](https://cloud.tencent.com/document/product/1552/127419)
- [获取客户端 IP（示例）](https://cloud.tencent.com/document/product/1552/101774)
- [edgeone.json 配置](https://cloud.tencent.com/document/product/1552/127389)
- [自定义域名](https://cloud.tencent.com/document/product/1552/127404) · [CNAME 配置](https://cloud.tencent.com/document/product/1552/127409)
- 官方模板：[TencentEdgeOne/pages-templates](https://github.com/TencentEdgeOne/pages-templates)