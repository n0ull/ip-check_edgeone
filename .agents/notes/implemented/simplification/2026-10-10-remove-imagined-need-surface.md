# Agent Note: 删除臆想需求表面（/api 别名、hostInfo 死分支、『未知』兜底）

Status: implemented

## Problem

三处代码为臆想中的需求而非当前需求所写，持续占用维护面与测试面：

1. `/api/4` `/api/v4` `/api/test` 别名路由：存在理由仅为 `[[default]].js` 头注释的「习惯用法」，无页面消费方、未进 README 端点表，是未公开却要永久维护的影子 API，并独占 3 条测试断言；
2. `hostInfo` 的 Host 头回退分支：生产恒为绝对 URL，该分支不可达且无法构造测试输入（原注释自证「此分支测试不可达」），是为未验证平台行为写的死防御；
3. `index.js` onRequest 的 `familyOf(ip) || '未知'`：`verdictFor` 只认 IPv4/IPv6，`'未知'` 传入即返回 null、被 renderUi 的『检测中…』兜底接管——可证明永不生效的死代码。

## Decision

三处全部删除：

- 别名路由从 `[[default]].js` switch 移除；其承载的 `?format=json` 与 Accept 协商断言迁移到 `/4` 载体（契约本身保留），并新增「/api/* 别名已移除 → 404」钉防回归；头注释端点清单与 README 项目结构行同步。原别名作为字面量随附于路径 fact 决策（见[端点路径事实单源化笔记](./2026-08-29-endpoint-path-fact-single-sourcing.md)），本笔记反转该随附决定，fact 单源决策本身不受影响。
- `hostInfo` 只认 `request.url` 的 hostname；解析失败 hostname 落空串 → sub/base 均空 → 落查询网页分支，页面卡片经 grab 同源回退兜底（失败路径 fetch `https://4./` 必抛 → catch → 回退同源 `/4`），失败方向保持保守。
- `|| '未知'` 移除，family 允许为 null，由 renderUi 的『检测中…』兜底接管第三态。

同变更携带三项可读性改动（零行为变更）：`init` 的 `results[1]` 具名 `testIp`；`isPublicIp`/`extractIp` 补协议依据注释（ULA fc00::/7、链路本地 fe80::/10、IPv6 启发式）；`grab` 的中文错误体探测抽为 `isServerErrorText` 谓词。

教训：页面脚本作用域内的**注释**提及共享符号名也会被 browserScript 按名拣选（`\b` 词边界，注释与代码同文本）——`isServerErrorText` 注释初版举例 `handleV4` 导致服务端 handler 被打进页面脚本，simulate 的「不含未引用助手」断言当场拦下；页面脚本内的注释举例须避开导出符号名。

## Alternatives considered

### Why not 保留别名作为未公开便利？
无消费方的公开路由是永久维护负债：路由表、测试、心智清单各一份。「可能有用户习惯用 /api/v4」是臆想需求；本项目定位为小工具且明确允许破坏性变更，删除成本（未知外部脚本 404）可接受。

### Why not hostInfo 回退分支留作防御？
不可达且不可验证的防御代码不提供安全，只提供错觉；它防护的平台行为（`request.url` 解析失败）从未被观察到。删除后失败方向仍保守（见 Decision）。

### Why not browserScript 解构参数禁令加运行期断言？
该约束从未被违反、无事故记录；违反后的断壳脚本会被 bundle-gate / DOM 沙箱当场拦下，失败类别已被现有门禁覆盖。为想象中的未来误用提前写防御代码，正是本笔记要消除的形态。

## Consequences

买到的：路由表与 README 契约一一对应，影子 API 消失；hostInfo 不再含不可验证分支；`onRequest` 第三态语义单点归于 renderUi。模拟测试断言总数净变化为 0（删 3 条别名断言、迁移 2 条契约断言到 `/4`、新增 1 条 404 钉），别名专属断言从 3 条收敛为 1 条 404 钉。

付出的：`/api/*` 别名若有未知外部使用者将收到 404（服务无遥测可查，接受为已授权破坏性变更）；`family` 为 null 的语义依赖 renderUi 兜底契约——若未来 `verdictFor` 扩值域，null 路径行为需在那时重评；「注释提及共享符号会被打进页面脚本」成为维护者须知（已由测试钉住，方向保守）。
