# Agent Note: isIpv4 严格化与正则三重消除

Status: implemented

## Problem

`isIpv4` 的正则 `/^(\d{1,3}\.){3}\d{1,3}$/` 只校验「四段数字」结构，不校验每段 0-255 范围，因此 `256.1.1.1`、`999.999.999.999` 等非法地址会被判为 IPv4。这会在 `getClientIp` 的代理头回退路径（`isIpv4(first) || isIpv6(first)` 才返回首个候选）传导错误判定；`handleV4` 的 IPv6 排斥分支只用 `isIpv6`，不受此缺陷影响。

同时，同一 IPv4 结构正则在代码库中出现了三次：`_shared.js:isIpv4`（已导出）、`[[default]].js:isPublicIp` 内联、`[[default]].js:extractIp` 内联。后两处未复用已导出的 `isIpv4`，构成 locality 失效——正则语义变更需改三处，且行为可能漂移。

边界：浏览器端 `looksLikeIp`（`UI_SCRIPT`）只需宽松「看起来像 IP」（有点号或冒号），不在本次严格化范围内——严格正则在「看起来像」判定中是过度判定，`UI_SCRIPT` 序列化数组本就不含 `isIpv4`。

## Decision

### 1. isIpv4 严格化（破坏性变更）

将 `isIpv4` 实现从正则改为逐段 0-255 数值校验：

- 类型非 string → false
- `split('.')` 段数不为 4 → false
- 每段：长度 1-3、全数字字符、`parseInt` 后 0-255 → 否则 false

`256.1.1.1` 等越界输入现返回 false。这是破坏性变更：此前被宽松正则接受的越界输入，现在会被 `getClientIp` 跳过（继续尝试下一代理头或返回空串），进而触发 400「无法获取客户端 IP」。真实公网 IP 不受影响（合法 IPv4 每段必在 0-255）。

### 2. 消除三重重现

`[[default]].js` 的 `isPublicIp` 与 `extractIp` 改为 import 并调用 `isIpv4`，删除两处内联正则。`isIpv4` 成为代码库 IPv4 结构判定的唯一来源。

### 3. isIpv4 加入 WEBRTC_SCRIPT 序列化数组

`extractIp` 的函数体引用 `isIpv4`，因此将 `isIpv4` 加入 `WEBRTC_SCRIPT` 序列化数组（`isIpv4` 无外部依赖，`toString()` 序列化后在 vm 沙箱中自包含可执行）。注意：当时未把 `isIpv4` 加入 `[[default]].js` 的命名 import——该自由标识符缺口在平台构建的改名避让下于 2026-08-29 演化为线上 webrtc 事故，已修复并加打包门禁（见[改名笔记](2026-08-29-webrtc-free-identifier-esbuild-rename.md)）。`UI_SCRIPT` 不受影响——其序列化数组本就不含 `isIpv4`，`looksLikeIp` 继续用自身的 `indexOf('.')` 宽松检测（不依赖严格正则），两者职责分离。

### 4. 测试

在 `test/simulate.mjs` 新增 `isIpv4 严格判定` 节，覆盖：合法 IPv4、全 255、全 0、首段 256 越界、全 999 越界、段数不足/过多、非 IP 文本、空串、null、IPv6 地址，共 11 条边界断言。

## Alternatives considered

### 保留宽松正则，仅消除重现（不严格化）
改动最小，但继承原有正确性缺陷。按「正确性 > 兼容性」原则否决。

### 改用严格 IPv4 正则（如 `(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)` 四段）
正则方案可行，但可读性差于逐段数值校验，且 JavaScript 正则无「捕获组内数值比较」能力，0-255 范围必须枚举。逐段 `parseInt` 更直白，选之。

### 从 WEBRTC_SCRIPT 移除 isIpv4，浏览器端全用宽松检测
`extractIp` 解析 WebRTC ICE candidate 字符串时需要区分 IPv4/IPv6 候选，宽松检测不足以分辨（`fe80::1` 含点号的情况虽罕见但存在）。`extractIp` 必须用严格 `isIpv4`，因此序列化数组必须包含它。否决移除方案。

## Consequences

`isIpv4` 成为代码库 IPv4 结构判定的唯一来源——被 `getClientIp` 的代理头回退、`isPublicIp`、`extractIp` 多处调用。IPv4 判定语义收紧后，越界输入不再被误判为 IPv4。影响面：`getClientIp` 跳过越界候选（继续尝试下一代理头或返回空串，进而触发 400「无法获取客户端 IP」）；`isPublicIp`/`extractIp` 的 WebRTC 判定精度提升。`familyOf` 不受影响——其二元判定走 `isIpv6`（含冒号即 true）做分支，越界串（含点号不含冒号）归为 IPv4，逻辑不变。

`WEBRTC_SCRIPT` 序列化数组新增 `isIpv4` 一项，部署产物脚本体积微增（`isIpv4` 函数体 ~200 字符）。
