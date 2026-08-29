# Agent Note: WebRTC 检查线上失效——自由标识符触发 esbuild 改名

Status: implemented

## Problem

2026-08-29 线上 `https://ip.n0ull140.top/webrtc` 检查全废：公网 IP 显示「—（未获取到公网映射）」、局域网 IP 显示「—（未发现或已被 mDNS 隐藏）」、判定误报「STUN 不可达或网络限制，无法对比」——实际 STUN 反射正常，`/test` 出口 IP 正常。真实原因：每个 ICE 候选到达时 `onicecandidate` 处理器抛 `Uncaught ReferenceError: isIpv4 is not defined`（真实浏览器实测连抛 15 次），IP 提取在 `extractIp` 的 `isIpv4(t)` 处即死，pub/loc 全空。

根因链（三环缺一不发）：

1. [isIpv4 严格化笔记](2026-08-27-isipv4-strict-and-regex-dedup.md)使 `webrtcScriptScope` 内的 `isPublicIp`/`extractIp` 引用共享 `isIpv4`，但该文件命名 import 列表没有它（服务端代码不直接调用，页面脚本靠 `browserScript` 名字注入）——`isIpv4` 在 `[[default]].js` 中是**未解析的自由标识符**；
2. 平台构建（esbuild bundle）为阻止自由标识符经作用域链意外捕获模块符号，把 `_shared.js` 顶层符号 `isIpv4` 改名为 `isIpv42`（本地 `esbuild --bundle --format=esm` 复现，与线上下发脚本逐字一致；对照实验：加入命名 import 即不改名）；
3. 运行时 `browserScript` 从 shared 命名空间序列化的是改名后源码（声明 `isIpv42`），页面局部函数体仍调用 `isIpv4`——`\b` 拣选照常命中（局部代码含该字样）、函数照常注入，但名字对不上。

本地门禁全绿的原因：`npm test` 消费未打包源码（`browserScript` 在 node 直跑，符号名原样保留）。「本地绿、线上废」盲区由打包门禁封堵（见[打包门禁笔记](../testing/2026-08-29-bundle-gate.md)）。主页不受影响——`familyOf`/`verdictFor` 被服务端真实使用而 import，index.js bundle 无自由标识符改名（线上主页脚本实测未改名）。

## Decision

1. **`[[default]].js` 命名 import 加入 `isIpv4`**——入口诚实声明页面脚本作用域引用的跨模块符号，esbuild 保留原符号名，序列化产物自洽。代码变更仅此一处（附注释说明约束），线上 webrtc 页恢复设计行为。
2. **打包门禁进 `npm test`**（esbuild 打包两入口后断言页面脚本行为，详见[打包门禁笔记](../testing/2026-08-29-bundle-gate.md)）。

## Alternatives considered

### browserScript 把序列化函数绑定回规范导出名（`var isIpv4 = (function isIpv42…)`）
机制层免疫任何改名，但变更序列化契约：波及 `uiScriptFor ≡ renderUi 脚本子串` 逐字断言（[renderUi interface 笔记](../architecture/2026-08-29-renderui-ui-module-interface.md)）与传递闭包拣选逻辑，复杂度落进 serializer。打包门禁已把改名漂移变成测试期必现，冗余防御不值其价。放弃；门禁若被未来构建器变更击穿再评估。

### 只修 import，不加门禁
一行改动即恢复线上，但盲区原样保留——未来页面脚本新增共享符号引用而忘 import 时，同类事故照常上线。放弃。

### 静态自洽断言（脚本中被调用标识符皆有声明，不做打包）
不经平台转换即检查：既复刻 `browserScript` 机制内部知识（违反「测试断言用户可见契约」），又拦不住改名——改名恰恰发生在打包转换时。放弃，改行为级断言。

## Consequences

买到的：线上 webrtc 检查恢复（公网/局域网提取与泄漏判定正常，误报文案消失）；「页面脚本引用的共享符号必须在入口命名 import」成为显式契约，由门禁把守；改名类漂移本地必现且错误信息点名缺失符号。
付出的：`package.json` 首次出现 devDependencies（esbuild，仅测试用，不进边缘产物）；打包产物文本与本地序列化存在 esbuild 重印格式差异（引号/缩进/`\uXXXX` 转义、注释剥离），字节级一致不可能，行为等价由门禁断言。
