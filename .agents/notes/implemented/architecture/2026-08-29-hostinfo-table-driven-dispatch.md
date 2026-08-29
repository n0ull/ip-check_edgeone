# Agent Note: Host 分发表驱动与 hostInfo 直接表征

Status: implemented

## Problem

子域集合在 `index.js` 内有两份相距约 180 行的清单：`SUBDOMAINS` 数组（hostInfo 的成员判断）与 onRequest 的 switch case。双向漂移都静默——表加 `'6'` 而 switch 不加，`6.` 子域静默吐查询网页；反向亦然（sub 提不出来同样落网页）——且无任何门禁。hostInfo 未导出，只能经 onRequest 以三种 host 形状间接测：三标签域（`4.example.com`）、非子域前缀（`foo.4.ip.example.com`，[查询网页与同源回退笔记](../feature/2026-08-14-web-ui-and-same-origin-fallback.md)文档化的「由同源回退兜底」行为）、端口剥离、大小写归一均无表征。hostInfo 的 host→(sub, base) 与页面 grab 的 (sub, base)→`https://sub.base/` 互逆，round-trip 仅靠 simulate 与 ui-dom 各自字面量的巧合一致。

YAGNI 前提：子域集合被平台约束冻结（三域名定案，见[平台约束与三域名设计笔记](2026-08-14-platform-constraints-and-three-domain-design.md)），「新增子域只改一处」是假想收益；本变更的买入是漂移危害的构造性消除、hostInfo 成为 interface=测试面、互逆 round-trip 钉住、文档化意图行为入测。

## Decision

- **分发表唯一化**：`SUBDOMAIN_HANDLERS = { '4': handleV4, 'test': handleTest }` 是 Host 分发的唯一子域命名点——hostInfo 成员判断与 onRequest 处理器分发共用同一实现（switch 消失），双向漂移在构造上不可能。成员判断用 `Object.prototype.hasOwnProperty.call`（防原型键 `'constructor'` 经 labels[0] 误命中；不用 ES2022 的 `Object.hasOwn`——边缘运行时支持未验证，不把全站分发押在未证内建上）。表导出，测试从表键派生 round-trip（表加行自动多一条断言）。
- **hostInfo 导出 + 形状矩阵**：interface 即测试面。矩阵钉住：四标签现役形状、三标签域、`foo.4.ip.` 非子域前缀不剥、URL 路径端口剥离与自动小写，及对表全键的互逆 round-trip。
- **header 回退路径统一小写化**：URL 解析路径由 WHATWG URL 自动小写、header 路径原样——同一函数两条解析路径规则分裂；header 路径补 `toLowerCase()` 统一。该分支测试不可达（无法构造 URL 解析失败的 Request），为已知不可达边界，行为修正仅存在于防御路径。
- 页面 init 的 `'4'`/`'test'` 字面量不动：子域集合冻结（平台约束），为冻结集合把子域清单函数化进页面属为不存在的需求付认知税。

## Alternatives considered

### Why not 保留 switch + 一致性测试钉？
钉是门禁不是构造——「红 → 机械更新钉 → 全绿」恰是[端点路径单源化](../simplification/2026-08-29-endpoint-path-fact-single-sourcing.md)要杀的陷阱本身；正确性 > 稳定性标准下漂移应在构造上不可能。

### Why not 删除 header 回退分支？
赌平台恒给绝对 URL——本地 dev 行为未验证，风险不对称；2 行防御代码的存留成本低于赌错的全站代价。

### Why not header 路径保持不小写化？
不可达分支的一致性修正确是边际收益，保留原样的判断同样成立；按「同一函数同一规则」取齐。若未来证实该分支永不可达而成为纯噪音，归档评估时一并裁决。

### Why not 子域清单函数化进页面（subdomains() 共享函数）？
grab 的两张卡片 label 语义不同（v4/test 各自独立调用），循环化不贴合；且集合冻结，机器不值。

## Consequences

买到的：子域命名 2→1（表加行即完成分发接入）；hostInfo 从「经 onRequest 间接推断」变为直接测试面；互逆 round-trip 对每个表键自动成立；`foo.4.ip.` 形状等文档化意图行为获得测试载体；两条 hostname 解析路径大小写规则统一。

付出的：index.js 导出面 +2（`SUBDOMAIN_HANDLERS`、`hostInfo`——对平台惰性，仅测试消费）；`hasOwnProperty.call` 较 `indexOf` 冗长（注释说明防原型键）；onRequest 分发从 switch 语句变查找+早返回（不熟悉表分发的读者需一次适应，但「哪些 host 被分发」的回答从两处收敛一处）。
