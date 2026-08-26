# IP 查询服务（EdgeOne Makers · Edge Functions）

[![使用 EdgeOne Makers 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/makers/new?repository-url=https%3A%2F%2Fgithub.com%2Fn0ull%2Fip-check_edgeone&project-name=ip-check)

> 一键部署按钮：指向仓库 [n0ull/ip-check_edgeone](https://github.com/n0ull/ip-check_edgeone)，点击后以该仓库为部署源在 Makers 创建项目。其他仓库可自行替换链接中的 `repository-url`（`encodeURIComponent` 编码），见[部署按钮文档](https://cloud.tencent.com/document/product/1552/127397)。

基于腾讯云 [EdgeOne Makers](https://cloud.tencent.com/document/product/1552/127423)（原 EdgeOne Pages）的 **Edge Functions（边缘函数）** 实现的轻量 IP 查询服务，无后端、无数据库、免费额度即可运行：

- `curl 4.ip.<域名>` → 直接返回访问者的 **IPv4** 地址（纯文本）
- `curl test.ip.<域名>` → 返回本次双栈连接实际使用的 IP：**返回 IPv6 地址即代表 IPv6 访问优先**（该 IPv6 即你的 IPv6 地址）
- 浏览器访问 `https://ip.<域名>` → 查询网页（UI），展示 IPv4、IPv6（经双栈测试派生）、是否 IPv6 优先
- 浏览器访问 `https://ip.<域名>/webrtc` → WebRTC 泄漏检查（公网/局域网 IP 与泄漏判定，纯浏览器端）
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

**`4.` 如何强制 IPv4**：EdgeOne 自定义域名只提供 **CNAME** 解析，Makers 控制台支持对每个站点（自定义域名）单独设置 IPv6 访问——开关只有『关（仅 IPv4）』与『开（双栈）』两个状态，**不存在『仅 IPv6』**。 `4.` 站点关闭 IPv6 后，平台不再提供该域名的 IPv6 接入，双栈客户端（Happy Eyeballs）自动回退 IPv4 连接，函数必然看到 IPv4 源地址。
同理平台无法强制仅 IPv6，故**不提供 `6.` 子域**（行为与 `test.` 重复），IPv6 地址由 `test.` 的双栈结果派生。决策记录见[架构笔记](.agents/notes/implemented/architecture/2026-08-14-platform-constraints-and-three-domain-design.md)。

**网页抓取策略**：卡片优先请求 `4.`、`test.` 子域，IPv6 卡片由双栈测试结果派生；未绑定自定义域名时自动回退到 `/4`、`/test` 路径端点并显示提示条，绑定后自动切换为精确结果。

## 项目结构

```text
ip-check/
├── edgeone.json            # Makers 项目配置（默认空即可）
├── package.json
├── edge-functions/
│   ├── index.js            # 匹配 "/"：查询网页 + 按 Host 分发 4./test.
│   └── [[default]].js      # 匹配其余路径：/4 /6 /test /api/* 等路径式端点
├── .githooks/
│   └── pre-commit          # 提交前预检（npm install 自动启用，见「二、本地调试」）
├── scripts/
│   ├── verify-agent-notes.mjs  # Agent Note 格式校验
│   └── install-hooks.mjs       # 启用 .githooks（npm prepare 触发）
└── test/
    ├── simulate.mjs        # Host 分发与路径端点逻辑断言
    ├── ui-dom.mjs          # 主页脚本（UI_SCRIPT）的 DOM 沙箱测试
    ├── webrtc-dom.mjs      # WebRTC 页脚本（WEBRTC_SCRIPT）的 DOM 沙箱测试
    ├── helpers/
    │   └── dom-sandbox.mjs # 两个 DOM 沙箱测试共享的 mock/vm 助手
    └── consistency.mjs     # 双文件内联函数一致性校验
```

本项目是**完整的可部署项目**：`ip-check` 已存在于 Makers 控制台，本目录即项目根，无需执行 `create`/`init`。目录结构参考官方模板 [functions-fetch](https://github.com/TencentEdgeOne/pages-templates)（纯 Edge Functions + 静态托管），去掉了框架部分。

## 一、部署前准备

1. 腾讯云账号并完成实名认证，在 [EdgeOne Makers 控制台](https://console.cloud.tencent.com/edgeone/makers) 一键开通（免费版即可）；
2. 一个域名（本项目部署在『全球可用区（不含中国大陆）』，**无需 ICP 备案**）；
3. Node.js 18+，安装并登录 CLI：

```bash
npm install -g edgeone
edgeone login       # 按提示选择 China 国内站，浏览器弹窗完成授权
```

## 二、本地调试

```bash
npm install        # 可选：无第三方依赖，但会自动启用 pre-commit 钩子
edgeone makers dev
```

本地服务默认运行在 **8088** 端口：`/` → 查询网页，`/4` `/6` `/test` → 路径式端点（本地无 `request.eo`，回退读取 `X-Forwarded-For`）。

也可以先运行纯逻辑验证（无需任何环境）：

```bash
npm test
```

> `npm test` 一次跑完五道校验：逻辑断言（`test/simulate.mjs`）、主页脚本 DOM 沙箱（`test/ui-dom.mjs`）、WebRTC 页 DOM 沙箱（`test/webrtc-dom.mjs`）、双文件内联一致性（`test/consistency.mjs`）、Agent Note 格式（`scripts/verify-agent-notes.mjs`）。
> 仓库内置 pre-commit 钩子（`.githooks/pre-commit`）：`npm install` 时自动执行 `git config core.hooksPath .githooks` 启用，提交前自动执行语法检查与 `npm test`；未跑过 `npm install` 可手工执行该命令。

## 三、部署

### 方式 A：本地 CLI 部署（主路径）

```bash
edgeone makers deploy -n ip-check -a overseas              # 生产环境（全球可用区，不含中国大陆）
edgeone makers deploy -n ip-check -e preview -a overseas   # 预览环境
```

> ⚠️ **`-a` 区域参数不会持久化**，每次部署都必须携带（漏带回退 `global` 含中国大陆）；区域是部署时绑定属性，换区域会导致 CLI 另建同名项目（见[部署管理笔记](.agents/notes/implemented/process/2026-08-14-deployment-area-and-domain-management.md)）。已固化到 `npm run deploy` / `npm run deploy:preview`，更新代码后重新执行同一命令即增量发布。

**默认域名访问保护**：CLI 直传项目的默认域名（`<项目名>-<随机串>.<区域后缀>`）默认开启访问保护，直接访问返回 401；用部署输出中携带 `eo_token`/`eo_time` 参数的 URL 访问一次，浏览器种下授权 Cookie 后即可正常访问。绑定自定义域名（第四节）后无需令牌，正式使用一律走自定义域名。

### 方式 B：GitHub Actions 自动部署

仓库已含两个工作流：`.github/workflows/deploy.yml`（push main → 部署生产环境）与 `.github/workflows/preview.yml`（开 PR → 检出 PR 头部代码部署预览环境，并在评论区附预览链接）。前置条件：仓库 secret `EDGEONE_API_TOKEN`（Makers 控制台生成，见 [API Token 文档](https://cloud.tencent.com/document/product/1552/127422)）。
工作流不执行 `npm run build`：本项目无第三方依赖、无构建步骤，CLI 直接构建上传当前目录；`-a overseas` 已固化进工作流命令。决策记录见[CI/CD 笔记](.agents/notes/implemented/process/2026-08-14-github-actions-cicd.md)。

### 其他方式

- **Makers 控制台 Git 集成**（推送触发平台侧构建）与 **Token 直传**（`edgeone makers deploy ./dist -n ip-check -a overseas -t $EDGEONE_API_TOKEN`）均可用，步骤见[官方 CI 文档](https://cloud.tencent.com/document/product/1552/127398)。
- ⚠️ **Provider 冲突**：CLI 直传只支持 Provider 为 Upload 的项目；同名项目若经一键部署按钮或控制台以 GitHub 仓库创建（Provider: Github），CLI 部署会报 `Project ip-check exists but has Provider 'Github'`。两种方式互斥：使用 Actions 时在控制台删除多余的 GitHub 集成项目；改用 Git 集成则删除 Actions 工作流并把自定义域名迁移到新项目。

## 四、域名与 DNS 配置（关键步骤）

### 1. 添加自定义域名

Makers 项目 → **域名管理**，依次添加 3 个域名（免费版支持 200 个），按弹窗指引完成归属权验证，平台自动签发免费 SSL 证书：

```text
ip.example.com
4.ip.example.com
test.ip.example.com
```

### 2. 配置 DNS 记录

每个域名添加后，平台给出 CNAME 目标（形如 `a4285573.xxx.example.com.dns.edgeone.site.`）。**所有记录统一 CNAME**（EdgeOne 只提供 CNAME 接入）：`ip`、`4.ip`、`test.ip` 三条记录分别指向各自分配的 CNAME。
若 DNS 托管在 Cloudflare，必须 **DNS only（灰云）**——橙云代理会使 `request.eo.clientIp` 拿到 CF 节点地址，IP 回显失真。

### 3. 站点设置（IPv6 访问与 HTTP/2）

在控制台进入**每个自定义域名**的设置（域名管理 → 对应域名 → 编辑/设置）：

| 域名 | IPv6 访问 | HTTP/2 | 效果 |
| --- | --- | --- | --- |
| `ip.example.com` | 开 | 开 | 双栈网页 |
| `4.ip.example.com` | **关** | 开 | **强制仅 IPv4 可达**，curl 必返 IPv4 |
| `test.ip.example.com` | 开 | 开 | 双栈测试 |

> 若控制台只有项目级 IPv6 开关：关闭项目 IPv6 会使三个域名全部变为仅 IPv4，`test.` 失去 IPv6 能力。原则：`4.` 的 IPv4 语义优先保证，`test.` 的 IPv6 判定能力次之（可将 `4.` 拆到第二个 Makers 项目）。

### 4. 验证

```bash
curl https://4.ip.example.com/       # 期望：你的 IPv4 地址（4. 站点已关 IPv6，仅 IPv4 可达）
curl https://test.ip.example.com/    # 期望：本次连接 IP；若为 IPv6 地址则 IPv6 访问优先（该地址即你的 IPv6）
curl "https://test.ip.example.com/?format=json"   # JSON：{"ip":"...","family":"IPv6","ipv6Preferred":true}
```

浏览器打开 `https://ip.example.com/`：同时展示 IPv4 / IPv6 / 是否 IPv6 优先。
绑定自定义域名前，可用默认域名 + 部署输出的令牌 URL 验证路径端点（网页的 IPv4/IPv6 卡片需绑定域名后才能抓到对应子域）。

## 五、端点汇总 <a id="endpoints"></a>

| 端点 | 返回 | 说明 |
| --- | --- | --- |
| `https://ip.<域名>/` | HTML 网页 | 展示 IPv4、IPv6、是否 IPv6 优先 |
| `https://4.ip.<域名>/` | 纯文本 IPv4 | 站点关闭 IPv6 访问后仅 IPv4 可达，必返 IPv4 |
| `https://test.ip.<域名>/` | 纯文本连接 IP | IPv6 即 IPv6 访问优先 |
| `https://ip.<域名>/4` | 纯文本 IPv4 | 路径式（本地调试用） |
| `https://ip.<域名>/6` | 纯文本 IPv6 | 路径式；仅 IPv6 连接时返回（尽力而为，同源调试用） |
| `https://ip.<域名>/test` | 纯文本连接 IP | 路径式（本地调试用） |
| `https://ip.<域名>/api/self` | JSON | `{"ip": "...", "family": "IPv4\|IPv6"}` |
| `https://ip.<域名>/webrtc` | HTML 检查页 | WebRTC 公网/局域网 IP 检测与泄漏判定（浏览器端） |

所有端点均支持 `?format=json` 输出 JSON（Accept: application/json 亦可）。
响应头包含 `Access-Control-Allow-Origin: *`（网页跨子域请求需要）与 `Cache-Control: no-store`（IP 回显不能被缓存）。
仅接受 GET/HEAD 请求，其他方法一律返回 405（`Allow: GET, HEAD`）。
`test.` 端点的 `x-ip-preferred` 响应头仅在 IPv6 连接时输出（与 JSON 的 `ipv6Preferred` 同一规则：IPv4 连接无法判定『优先』，不输出该头）；`x-ip-family` 两种协议族均输出。

## 常见问题

- **换域名？** 函数按 Host 自动识别子域名，只需改 DNS 记录，无需改代码。
- **需要备案吗？** 本项目在『全球可用区（不含中国大陆）』，绑定自定义域名**无需 ICP 备案**；如将来改回含中国大陆区域则需备案。
- **不想要 Makers/CLI，可以用控制台版边缘函数吗？** 可以。在 EdgeOne 控制台创建边缘函数，添加 3 条触发规则分别绑定 `4.ip.<域名>/*`、`test.ip.<域名>/*`、`ip.<域名>/*`，函数体用 `addEventListener('fetch')` 形式读取 `request.eo.clientIp`，逻辑与本项目一致；同样无法强制仅 IPv6，故无 `6.` 子域。

## 文档体系

- **[AGENTS.md](AGENTS.md)** —— 站立命令（每会话必读规则）；**[.agents/notes/](.agents/notes/README.md)** —— 决策记录（Agent Note，`npm run verify:notes` 机械校验）；**本文档** —— 部署手册，不承载决策史。
- 规则：非平凡变更（行为、架构、契约、流程、测试策略、配置格式）必须同变更携带或更新 Agent Note；修改函数行为后同步更新测试断言与上方端点表。

## 参考文档

- [EdgeOne CLI](https://cloud.tencent.com/document/product/1552/127423) · [Makers Functions 概览](https://cloud.tencent.com/document/product/1552/127415) · [Edge Functions](https://cloud.tencent.com/document/product/1552/127416) · [Cloud Functions · Node.js](https://cloud.tencent.com/document/product/1552/127419)
- [获取客户端 IP（示例）](https://cloud.tencent.com/document/product/1552/101774) · [edgeone.json 配置](https://cloud.tencent.com/document/product/1552/127389) · [限制与配额](https://cloud.tencent.com/document/product/1552/132789)
- [自定义域名](https://cloud.tencent.com/document/product/1552/127404) · [CNAME 配置](https://cloud.tencent.com/document/product/1552/127409) · [使用 GitHub Action](https://cloud.tencent.com/document/product/1552/127398) · [部署按钮](https://cloud.tencent.com/document/product/1552/127397)
- 官方模板：[TencentEdgeOne/pages-templates](https://github.com/TencentEdgeOne/pages-templates)
