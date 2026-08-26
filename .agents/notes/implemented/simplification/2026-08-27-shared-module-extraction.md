# Agent Note: 共享模块提取（_shared.js）

Status: implemented

## Problem

`edge-functions/index.js` 与 `edge-functions/[[default]].js` 各自内联了同一组共享函数（`isIpv4`、`isIpv6`、`familyOf`、`getClientIp`、`baseHeaders`、`textResponse`、`jsonResponse`、`wantsJson`、`methodGuard`、`handleV4`、`handleTest`，共 11 个，~130 行），而非提取到共享模块后 import。原因是 2024-08 时「边缘构建器对跨文件 import 的支持未经验证，失败即全站不可用」——见 [客户端 IP 契约笔记](../architecture/2026-08-14-client-ip-acquisition-contract.md)。

双份内联的同步维护负担已由 `test/consistency.mjs` 机械兜底（交集推导 + 逐字比对），但兜底本身也是代码要维护，且共享逻辑无法被独立单元测试——`simulate.mjs` 只能通过 `onRequest` 的响应间接验证它们。这是补救而非根除。

2026-08 调研（[import 调研笔记](../proposed/process/2026-08-27-edgeone-makers-import-support-investigation.md)）以 CLI 包反编译一手证据证实：当前 CLI（`edgeone` v1.6.28）的边缘函数构建器对每个入口独立调用 esbuild 并开启 `bundle: true`，未传入 `external` 限制，本地相对路径 import 在构建期被解析并内联。原始「未经验证」前提失效，迁移条件成熟。

## Decision

将 11 个共享函数提取到 `edge-functions/_shared.js`（全部 `export`），`index.js` 与 `[[default]].js` 改为 `import { ... } from './_shared.js'`，各自保留仅自身使用的代码：

- `index.js` 保留：`hostInfo`、浏览器函数（`setStatus`/`showHint`/`looksLikeIp`/`grab`/`init`）、`verdictFor`、`UI_SCRIPT`、`UI_TEMPLATE`、`renderUi`、`onRequest`（Host 分发）。
- `[[default]].js` 保留：浏览器函数（`$`/`addIp`/`isPublicIp`/`extractIp`/`detect`/`fetchIp`/`run`）、`WEBRTC_SCRIPT`、`WEBRTC_HTML`、`onRequest`（路径分发）。

`_shared.js` 不导出 `onRequest`，构建器的 `isPagesFunction`（检查 `onRequest` 字符串）会将其过滤，不会注册为路由——与调研笔记的推断一致。

浏览器脚本序列化（`UI_SCRIPT`）依赖 `isIpv6` 与 `familyOf` 在序列化字符串中可用，因此将两者加入 `UI_SCRIPT` 数组（经 `Function.prototype.toString()` 序列化注入页面）。

`test/consistency.mjs`（双份内联一致性校验）随之退役并删除；`npm test` 链移除其条目。

## Alternatives considered

### 继续双份内联 + consistency.mjs 兜底（原定案）
零迁移风险，但持续支付同步维护成本，且共享逻辑始终无法被独立单元测试。原始理由（构建器不支持跨文件 import）已被 2026-08 调研证伪；按「正确性 > 稳定性」原则迁移。

### 仅导出部分共享函数，其余保留内联
无意义——要么全部共享（根除重复），要么全部内联（维持现状）。混合方案同时承担两种代价，跳过。

### 保留 consistency.mjs 作为风格 lint
共享模块提取后两文件不再有共享函数副本，consistency.mjs 的比对对象消失，保留无意义。跳过。

## Consequences

共享函数实现唯一化，「改一必改二」的同步纪律消失；`consistency.mjs` 及其 ~70 行校验代码退役。`simulate.mjs` 的 `familyOf` 纯函数断言改为直接 import `_shared.js`，测试与被测契约的 seam 对齐。

边缘构建 bundle 时共享代码在两个入口产物中各出现一份（esbuild 独立 bundle 每个入口），对当前 ~130 行工具函数可忽略；若共享模块增长到 KB 级需评估 bundle 体积（边缘函数有大小限制）。

`[[]default].js` 的 404 响应由 `jsonResponse` 提供（content-type: application/json），与 `/api/self` 一致；`baseHeaders`/`jsonResponse` 作为共享导出供入口文件直接使用。

[客户端 IP 契约笔记](../architecture/2026-08-14-client-ip-acquisition-contract.md)与 [Agent Note 约定笔记](../process/2026-08-14-agent-note-conventions.md)已原地更新事实；[双文件一致性校验笔记](../../archived/testing/2026-08-15-dual-inline-consistency-and-test-gates.md)归档冻结。
