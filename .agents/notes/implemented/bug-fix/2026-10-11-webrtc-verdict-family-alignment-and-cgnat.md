# Agent Note: WebRTC 判定 family 对齐与 CGNAT 假阳性修复

Status: implemented

## Problem

/webrtc 页的泄漏判定有两个未言明假设，各自产生可观测的系统性误报：

1. **「HTTP 出口与 srflx 同协议族」假设**：`run()` 以 `pubOnly.indexOf(ext)` 跨协议族做字符串比较。`ext` 来自 `/test` 端点（IPv6 优先的连接返回 IPv6），srflx 候选的协议族取决于 STUN 路径，二者无同族契约——IPv6 优先的双栈用户、无任何泄漏，srflx 为 IPv4、ext 为 IPv6，比较恒不命中 → **100% 误报「可能存在 WebRTC 泄漏」**。webrtc-dom 四分支全部构造同族地址，此场景结构性不可测。
2. **「srflx 必为真公网」假设**：`isPublicIp` 的 IPv4 私网正则缺 CGNAT 段 100.64.0.0/10（RFC 6598）。移动网普遍 CGNAT，srflx 反射内层 100.64.x.x 被判「公网」参与比对 → 假阳性泄漏。

附带发现的死代码：`onicecandidate` 的 `.local` 检查永不触发（真实守卫是 `extractIp` 的 token 校验整体——严格 `isIpv4` + IPv6 冒号门；字符集正则 `/^[0-9a-f:.]+$/i` 单独并不充分，hex 字母主机名如 `decaf.bad` 可通过，依赖冒号门拦截）；`#pub-st/#loc-st/#ext-st` 三个空 span 无任何代码写入、CSS 无 `.st` 规则——为臆想的「逐字段状态」功能预留的死 DOM。

发现方式：三代理立场评审（YAGNI / 过度自信假设 / 认知负荷）两轮交锋收敛，每条指控经独立核实代码后成立。判定机制的原始定案见[WebRTC 泄漏检查页笔记](../feature/2026-08-14-webrtc-leak-check.md)，本笔记修订其判定语义（family 对齐 + CGNAT 过滤），页面结构与纯浏览器端定位不变。

## Decision

- **family 对齐**：`run()` 以 `_shared.js` 现成的 `familyOf` 按 `ext` 的协议族过滤 `pubOnly` 得到 `sameFamilyPub` 再比对；无同族公网映射时落入现有「无法对比」warn 分支（文案补「协议族不匹配」成因），不新增第五分支、不新增 UI 状态。`familyOf` 已在 `[[default]].js` 命名 import（esbuild 改名防护免费），browserScript 按名拣选进 WEBRTC_SCRIPT。
- **CGNAT 段**：`isPublicIp` 的 IPv4 正则补 `100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.`，WHY 注释（CGNAT 成因、RFC 6598、srflx 经 CGNAT 反射内层地址误判公网必误报泄漏）写在 `isPublicIp` 定义处。
- **死代码清扫**：删 `.local` 检查与三个 `-st` span（注释标明 mDNS 排除由 extractIp 字符集承担）。
- **可读性随行**：`setVerdict(cls, text)` 局部函数收敛 4 处成对 `className`/`textContent` 赋值（仅限局部函数，不升级为配置表）。
- **测试补盲**：webrtc-dom 新增族错配（误报回归钉）、CGNAT、真实格式 IPv6 host/srflx 候选行（含 ufrag/network-id、raddr 为真实局域网地址）、mDNS `.local` 候选四类用例；simulate 的拣选断言由「familyOf 不入选」反转为「familyOf 入选 + getClientIp 不入选」。

## Alternatives considered

### Why not 族错配时新增独立文案/第五分支？
族错配与 STUN 不可达对用户是同一语义——「本次无法完成对比」；现有 warn 文案补一成因即如实。为新状态造分支违反 YAGNI（无用户可见需求区分两者）。

### Why not 判定策略表/可配置私网段/多 STUN 重试？
评审中提出并否决：无当前真实需求来源（无事故、无契约、无用户可见缺陷），多 STUN 且直接违反平台约束（stun.miwifi.com:3478 一套）。

## Consequences

买到的：IPv6 优先用户与 CGNAT 用户的系统性假阳性消除；判定逻辑的可测面覆盖真实浏览器候选格式；页面脚本读者不再被死 DOM 与不可达检查误导；`familyOf` 进 WEBRTC_SCRIPT 后拣选断言反向钉住。

付出的：`sameFamilyPub` 为空时用户看到「无法对比」而非显示异族公网映射——异族映射仍显示在「公网 IP」字段，信息无丢失；「无法对比」文案变长（补一成因）。webrtc-dom 从 14 条增至 20 条断言。
