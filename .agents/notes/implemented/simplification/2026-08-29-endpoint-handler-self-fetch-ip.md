# Agent Note: 端点 handler 自取客户端 IP（收拢 (request, ip) 穿线）

Status: implemented

## Problem

`handleV4` / `handleTest` 以 `(request, ip)` 双参数签名导出，形参携带的隐含不变式——「ip 必须来自同一 request 的 `getClientIp`」——纯靠调用方纪律维持，传错无人拦（跨 seam 传递，无 locality）。同时 `[[default]].js` 在 switch 之前无差别预计算 `ip`，五个分支中只有 `/4`、`/test`、`/api/self` 消费它，`/webrtc`、`/favicon.ico`、404 路径白算。纯函数 `getClientIp` 的契约（生产只信 `eo.clientIp`、'' 语义）已被 simulate 钉住且健康（见[客户端 IP 契约笔记](../architecture/2026-08-14-client-ip-acquisition-contract.md)）——摩擦只在参数穿线：getClientIp 测得很好，易错点在调用方式。

## Decision

handler 自取：`handleV4(request)` / `handleTest(request)` 在体内直调 `getClientIp`（与其定义同模块），签名删去 `ip` 形参。两入口残余消费点一律**消费点取用**：index.js 的 UI 首屏徽章移入 default 分支块内取 `ip`/`family`，[[default]].js 的 `/api/self` case 块内取——两入口 onRequest 统一为「每分支自取所需」，模块级 ip 穿线消失，`/webrtc`、`/favicon.ico`、404 的白算清零。`getClientIp` 的导出面与契约不变，两入口 import 线不变（`getClientIp`/`familyOf` 仍有真实消费）。

测试零改动：全部行为断言经 onRequest，签名变更不可见。线上行为零变化（4./test. 每请求 `getClientIp` 调用次数不变，400 语义与 '' 处理逐字不变）。

## Alternatives considered

### Why not 保留入口 switch 前预计算（handler 自取但入口不动）？
diff 最小，但 4./test. 请求的预计算变死代码（同请求 `getClientIp` 跑两次），且同一文件「handler 自取」与「入口预计算」两种风格并存——稳定性视角的妥协，买不到任何正确性。

### Why not /api/self 提为 handleSelf 进 shared？
shared interface 再添一员、'unknown' 语义随迁，但单调用点零杠杆（不拉重量的抽象就内联）；本候选方向是收拢不是扩张。

### Why not UI 分支一并提为 handleUi？
renderUi 已是 UI 模块唯一 interface（见[renderUi UI 模块 interface 笔记](../architecture/2026-08-29-renderui-ui-module-interface.md)），再包一层 handler 只是把三分支调用变四分支透传。

## Consequences

买到的：ip 不变式从约定变构造——跨 seam 传递消失，传错在签名上不再可能；两入口 onRequest「每分支自取所需」风格统一；三处白算清零；handler interface 各少一个参数、少一条需阅读调用方才能确认的约定。

付出的：handler 取 IP 从签名可见变为体内实现（读者需看 handler 体才知道它自取——JSDoc 已声明，同模块阅读半径小）；switch case 出现块级 `const`（标准 JS，但非所有读者熟悉的写法）。性能上 `getClientIp` 只在消费 IP 的端点被调用：`/webrtc`、`/favicon.ico`、404 由每请求 1 次降为 0，`/4`、`/test`、`/api/self` 不变。
