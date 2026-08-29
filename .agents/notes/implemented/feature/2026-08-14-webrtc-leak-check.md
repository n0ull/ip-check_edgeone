# Agent Note: WebRTC 泄漏检查页

Status: implemented

## Problem

WebRTC 是浏览器内置的 P2P 能力：页面 JS 建立 `RTCPeerConnection` 时会收集 ICE 候选地址，其中经 STUN 反射的公网地址（`srflx`）会**绕过 VPN/代理暴露真实出口 IP**（经典 WebRTC 泄漏）。
现有站点只回答『当前连接出口 IP』，无法回答『浏览器是否泄漏了其他网络出口』。

## Decision

新增 `ip.<域名>/webrtc` 检查页（`edge-functions/[[default]].js` 路径路由，主页页脚提供入口）：

- **纯浏览器端检测**：Edge Functions 运行时（服务端 V8）无 `RTCPeerConnection`，WebRTC 检测必须由页面内联 JS 完成；结果仅在本机浏览器内计算，不发送到服务器；
- 收集逻辑：创建 `RTCPeerConnection`（iceServers 配置 `stun:stun.miwifi.com:3478`），`createDataChannel` 触发候选收集（Safari 兼容），`onicecandidate` 提取 `srflx`（公网映射）与 `host`（本机网卡）地址，4 秒超时；过滤 mDNS 隐藏地址（`.local`）；
- 展示三块：WebRTC 公网 IP、局域网 IP、当前出口 IP（同源抓取 `subdomainPath('test')`，见[端点路径单源化](../simplification/2026-08-29-endpoint-path-fact-single-sourcing.md)）；判定：公网映射与出口 IP 一致 →『未发现泄漏』，不一致 →『可能存在 WebRTC 泄漏（VPN/代理未覆盖）』，无公网映射（STUN 不可达）→ 明确说明无法对比；
- 页面注明隐私与局限：检测本地完成；STUN 不可达时仅显示局域网 IP；浏览器 mDNS 隐藏时显示 `.local`。

## Alternatives considered

- **服务端检测**——Edge Functions 无 WebRTC API，且 WebRTC 是浏览器运行时能力，服务端无从收集 ICE；放弃。
- **自建 STUN 服务器**——EdgeOne 边缘节点无 UDP 能力，无法托管 STUN；公共 STUN 选用 `stun.miwifi.com`（国内可达性好，规避 Google/Cloudflare 公共节点在国内网络不可达的问题）。
- **主页内联检测区块**——主页定位为极简工具站（三字段 + curl 用法），内联区块破坏克制；采用独立子页 + 页脚入口。

## Consequences

站点增加一个检查页与一个页脚链接，功能独立、主页不变。
维护要点：内嵌浏览器 JS 已改为模块顶层真实函数经 `Function.prototype.toString()` 序列化注入（见[浏览器脚本即真实函数笔记](../simplification/2026-08-26-browser-js-as-real-functions.md)），字符串转义纪律随之退役——正则直接写 `\d`、`\.`，换行字面量直接写 `'\n'`；`extractIp` 按空白分词后逐 token 校验 IP 格式（防 `candidate:1` 的 `e:1` 误匹配，`e` 是十六进制字符）；`test/webrtc-dom.mjs` 直接 `import { WEBRTC_SCRIPT }`，在共享 vm 沙箱（`test/helpers/dom-sandbox.mjs`）模拟点击全流程防回归。
局限：检测依赖公共 STUN 可达性（国内部分网络不可达时无公网映射，页面已给出说明）；局域网地址可能被浏览器 mDNS 隐藏；判定仅对比『WebRTC 公网 IP』与『本站出口 IP』，不等同于权威 VPN 泄漏审计。