# Agent Note: 移除 6. 兼容面

Status: implemented

## Problem

平台无法强制仅 IPv6（站点开关只有『IPv6 关 / 双栈』两态），`6.` 子域与 `/6` 路径端点因此永远无法兑现『返回 IPv6』的语义承诺——双栈下它只是 `test.` 的子集，IPv4 连接时只能 400。该兼容面却占据真实维护面：`handleV6` 双份内联（consistency SHARED 清单十槽之一）、三处路径 case、一处 Host 分发 case、README 端点行与『尽力而为』免责措辞、三条测试断言。删除测试：删掉它，复杂性不在任何调用方重现。

## Decision

全量删除 6. 兼容面，不留指引文案（干净删除）：

- `index.js`：`SUBDOMAINS` 移除 `'6'`，dispatch 移除 `case '6'`，删除 `handleV6`，文件头注释同步；
- `[[default]].js`：删除 `handleV6` 与 `/6` `/api/6` `/api/v6` case，404 hint 改为 `/4 /test /api/self`，文件头端点表同步；
- 测试：`simulate.mjs` 删除三条 6. 断言（Host 两条、路径一条）；`consistency.mjs` 的 SHARED 从 10 减为 9（移除 `handleV6`）；
- 文档：README 移除 `/6` 端点行与两处枚举提及。
- 假想老 `/6` 用户的落点：路径端点 404（通用 JSON hint）、`6.` Host 落入 UI 默认分支——该子域从未绑定，无真实用户面。

## Alternatives considered

- **保留兼容面**（原定案，见[三域名架构笔记](../architecture/2026-08-14-platform-constraints-and-three-domain-design.md)）——为一个平台层面不可能的语义永久支付双份内联 + 文档免责 + 测试面；按『正确性 > 稳定性』原则（同[协议族语义笔记](../feature/2026-08-14-protocol-family-semantics.md)）重新评审后推翻。原笔记已原地更新该事实并回本链接。
- **保留 410 式指引**（`/6` 返回『已移除，请改用 /test』）——为从未绑定的端点维护永久文案，属腐肉。放弃。

## Consequences

- 双份内联函数从 10 减到 9（`handleV6` 删除），dispatch 表与 README 端点表收缩；『尽力而为』免责措辞从文档消失。
- IPv6 查询的唯一答案是 `test.`（双栈判定派生），与[三域名架构笔记](../architecture/2026-08-14-platform-constraints-and-three-domain-design.md)的语义一致。
- 代价：若未来平台支持仅 IPv6 站点，恢复 IPv6 专属端点需重写 handler（git 历史中有完整实现可捞回）。
