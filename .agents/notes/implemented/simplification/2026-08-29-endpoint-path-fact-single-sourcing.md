# Agent Note: 端点路径事实单源化（subdomainPath）

Status: implemented

## Problem

「子域 X 的路径端点是 /X」这份事实在代码里有五份独立维护的副本，中间没有任何断言钉住衔接：

1. `index.js` grab 的回退请求 `fetch('/' + sub)`（Makers 默认域名上这是主页卡片的唯一通路，见[查询网页与同源回退笔记](../feature/2026-08-14-web-ui-and-same-origin-fallback.md)）；
2. `[[default]].js` 路由 switch 的 `case '/4'` / `case '/test'`；
3. `[[default]].js` 404 hint 的 `'可用端点: /4 /test /api/self'`；
4. 测试侧手写副本：ui-dom 路径 2 的 mock 路由键 `'/4'` `'/test'`、simulate 以字面量 `'/4'` 断言服务端；
5. `[[default]].js` webrtcScriptScope 的 `run()` 出口 IP fetch `fetchIp('/test')`（初版单源化漏计，同日架构评审三轮补全，见 Decision）。

推演一次断裂：路由 `/4` 改名 `/v4` → simulate 字面量断言红 → 机械更新该字面量 → 全绿；grab 仍 fetch `/4` → 线上 404 JSON → `looksLikeIp` 判假 → 主页卡片静默「请求失败」。webrtc 页第 5 副本病症不同：出口 fetch 落 404 → `ext` 为空 → 泄漏判定误报「无法获取当前出口 IP」，而两个 webrtc fetch mock 均不校验 URL，四分支用例全绿。这与同日 esbuild 改名事故（[改名笔记](../bug-fix/2026-08-29-webrtc-free-identifier-esbuild-rename.md)）是同一「本地全绿、线上废」失败类别，且 bundle-gate 的 UI 段只测子域直达路径，对回退路径免疫。

## Decision

`_shared.js` 导出端点路径 fact `subdomainPath(sub)`（`'4'` → `'/4'`、`'test'` → `'/test'`、未知 → `null`），以**函数**形态进 shared 命名空间——页面可经 browserScript 按名拣选、服务端可直接调用（verdictFor 先例）。五方消费：

- **页面**：grab 回退改 `fetch(subdomainPath(sub))`；index.js 幽灵命名 import 该符号使 esbuild 保留原符号名（与 [[default]].js 的 isIpv4 同一契约，见改名笔记 Decision 1）。
- **webrtc 页**：`run()` 的出口 IP fetch 改 `fetchIp(subdomainPath('test'))`（2026-08-29 三轮评审补全第 5 副本；符号已在入口命名 import——switch/hint 消费中，esbuild 改名防护免费，browserScript 自动拣选进 WEBRTC_SCRIPT）。
- **服务端**：`[[default]].js` 路由 switch 以 `case subdomainPath('4'):` / `case subdomainPath('test'):` 结构性消费——case 标签就是 fact，页面回退与服务端路由的漂移在构造上不可能。`/api/*` 别名是纯服务端同义词（页面永不使用），保持字面量。
- **404 hint**：子域段拼接 fact，/4 /test 部分在任何 fact 变更下自动保持真实（回退若改走别的路径，列出该路径的 hint 依然正确）；`/api/self` 与回退无关，保持字面量。
- **测试三侧派生**（钉来源，不钉副本）：simulate 页面侧路径断言改从 fact 派生，并新增 fact 纯函数断言节与 404 hint 内容钉；ui-dom 路径 2 的路由键取 fact、响应体从真实 `[[default]].js` onRequest 派生（ui-dom 路径 4 先例）；bundle-gate UI 段新增同源回退分支块，响应体从打包 `[[default]].js` onRequest 派生——复刻真实拓扑（index 打包页 → 同源路径 → [[default]] 打包服务端），见[打包门禁笔记](../testing/2026-08-29-bundle-gate.md)。

fact 函数自包含（无传递依赖）；未知子域返回 null 方向保守：服务端 case 永不匹配落 404，页面侧响应判非 IP、卡片不填充（生产不可达——grab 仅以 '4'/'test' 调用）。线上行为零变化（grab 请求的 URL、路由响应、hint 文本逐字不变）。

## Alternatives considered

### Why not switch 保留字面量 + 行为级测试钉？
架构评审初版推荐：simulate 加一条「onRequest 在 fact 路径上返回 IP」的行为钉，switch 不动。落选：钉是门禁不是构造——「红 → 机械更新钉 → 全绿」恰是本候选要杀的陷阱本身。[页面脚本作用域定案](../architecture/2026-08-29-page-script-scope-and-browserscript.md)确立的标准是正确性 > 稳定性：漂移应在构造上不可能，而非被测试拦住后靠人判断修正方向。

### Why not 全路由映射（routeTarget(path) + primaryPath(target)）？
别名一并单源、switch 改写为映射驱动，单源最彻底。落选：别名无法对页面漂移（页面不用它们），为它们引入第二层间接是零正确性收益的认知税；`/api/4` 等别名从路由表一眼可见变为藏进实现。回评条件：别名数量增长到路由表不可读。

### Why not 仅测试侧派生（不动生产代码）？
ui-dom/simulate 全部改派生即可消测试副本。落选：grab 的 `'/' + sub` 字面量仍在，页面↔服务端一致性只靠测试纪律维持，fact 在生产代码里仍是两份。

### Why not hint 保持字面量、交给测试钉内容？
hint 的 /4 /test 与回退 fact 是同一事实（回退路径必须服务端可用，否则回退本身是坏的），不是仅共享相似文本的不相关组件；派生成本一次拼接，收益是 hint 永真、少一份副本。

### Why not 常量形态（`SUBDOMAIN_PATHS` 映射表）？
[renderUi interface 笔记](../architecture/2026-08-29-renderui-ui-module-interface.md)裁决「浏览器函数不可引用模块常量」——序列化后成自由引用，恰是沙箱陷阱所拦的泄漏类。函数形态是该裁决留出的正解缝隙。

## Consequences

买到的：路径改名只动 fact 一处，switch、grab、webrtc 页出口 fetch、hint、三侧测试全部自动跟随；bundle-gate 补上回退路径盲区（10→13 断言）；404 hint 在 fact 变更下永真；「本地绿线上废」类别在端点路径维度被构造性关闭；「同源回退」进入 CONTEXT.md 术语表。

付出的：`case subdomainPath('4'):` 的 case 标签函数调用是非传统样式（标准 JS 语义，但读者可能首次见）；bundle-gate 多一个场景块；`subdomainPath` 进入跨文件契约（shared 命名空间 + 幽灵 import 清单）；测试侧新增派生链（ui-dom 依赖 [[default]].js 与 `_shared.js` 导出），失败归因从「看断言」变为「看派生源」——与 ui-dom 路径 4 先例一致；每请求两次字符串比较的 case 求值开销（可忽略）。
