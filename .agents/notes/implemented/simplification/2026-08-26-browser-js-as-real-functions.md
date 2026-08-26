# Agent Note: 浏览器脚本即真实函数（toString 序列化注入）

Status: implemented

## Problem

两个页面的浏览器端 JS 此前手写于服务端字符串字面量（`rows.push('…')`）。这层 quoting 是纯粹的透传危害层：外层字符串会消化 `\d`、`\.`、`\n` 等序列，迫使浏览器代码以残缺方言（`[0-9]`、`[.]`、双写反斜杠）书写，且已实际引发两次线上修复（b8db903 正则与换行被消化、e06815e IP 提取逻辑）。转义纪律被固化为永久维护知识，但纪律防不住下一个写 `\d` 的人；`new Function` 冒烟断言只能事后检测，不能事前预防。

## Decision

浏览器脚本改写为模块顶层的真实具名函数（服务端从不调用），模块加载时经 `Function.prototype.toString()` 序列化拼接为脚本字符串注入页面（本项目无构建步骤，源码即部署物，序列化保真）：

- `index.js`：`setStatus` / `showHint` / `looksLikeIp` / `grab(base, sub, label)` / `init(base)` → `export const UI_SCRIPT`；`BASE` 由全局前缀行（`var BASE = '__BASE__'`）改为参数化传递，尾行 `init('__BASE__')` 仍由 renderUi 渲染时替换。
- `[[default]].js`：`$` / `addIp` / `isPublicIp` / `extractIp` / `detect` / `fetchIp` / `run` → `export const WEBRTC_SCRIPT`；正则还原正常写法（`[0-9]`→`\d`、`[.]`→`\.`，严格等价），`join('\n')` 恢复字面换行；转义纪律注释删除。
- 测试在 seam 处消费值：新增 `test/helpers/dom-sandbox.mjs` 共享 mock DOM/vm 沙箱；新增 `test/ui-dom.mjs` 直接执行 `UI_SCRIPT` 覆盖四条路径（双栈成功 / 同源回退 / IPv4 连接判定 / 中文错误原因），并断言抓取日志无 `6.` 子域请求；`webrtc-dom.mjs` 改为 `import { WEBRTC_SCRIPT }`，删除 HTML 正则切除。
- `simulate.mjs` 退役刮取式断言：脚本源码子串断言、`new Function` 语法冒烟两条（语法改由模块 import 与 `node --check` 保证）、『正则未丢失转义』断言（方言已亡）；保留两条胶水断言——渲染 HTML 包含（替换占位符后的）`UI_SCRIPT` 与 `WEBRTC_SCRIPT`；HTML 结构与措辞断言不动。
- 决策原则（同[协议族语义笔记](../feature/2026-08-14-protocol-family-semantics.md)）：正确性 > 稳定性，允许破坏性更改。

## Alternatives considered

- **保留字符串字面量 + 书写纪律 + 检测测试**（原状）——检测不是预防：下一个维护者写 `\d` 仍只会在测试期发现；且方言让正则永久不可读。放弃。
- **单 IIFE 整体序列化**——内部函数（`extractIp` 等）无法被测试单独触达，堆栈失去具名。放弃。
- **不导出 SCRIPT，测试继续从 HTML 正则切除**——刮取残留，模块内部值无法成为测试面；额外 export 对边缘构建器是惰性的（只认 `onRequest` 入口），导出无平台代价。放弃。
- **`BASE` 保留 `var` 前缀行**——全局可变状态游离于函数签名之外；参数化使 `grab`/`init` 数据流显式。放弃。
- **HTML/CSS 的 `rows.push` 一并改模板字面量**——HTML/CSS 无反斜杠消化危害类，属风格而非正确性；本变更不动。

## Consequences

- 转义方言 bug 类在构造上消失：浏览器代码按正常 JS 书写，语法由 `node --check` 与模块 import 直接把关；[WebRTC 笔记](../feature/2026-08-14-webrtc-leak-check.md)的转义维护要点与[一致性笔记](../testing/2026-08-15-dual-inline-consistency-and-test-gates.md)中主页 `new Function` 冒烟断言随之退役（两篇均已原地更新事实并回本链接）。
- 主页回退/判定逻辑首次获得执行级测试（此前仅有语法冒烟，从未运行）；测试与实现在 seam（SCRIPT 值）处对接，不再刮取 HTML 字符串。
- 代价与回评条件：两文件模块顶层出现『服务端不执行』的函数（已有注释标明）；`UI_SCRIPT`/`WEBRTC_SCRIPT` 成为新导出面（EdgeOne 仅消费 `onRequest`，额外导出惰性——若平台未来校验导出白名单需回评）；`toString()` 序列化依赖『无构建步骤』定案，引入打包器/压缩器即需回评。
- `6.` 兼容面已由[移除 6. 兼容面笔记](2026-08-26-remove-v6-compat-surface.md)删除；`/webrtc` 判定分支仍只覆盖『无泄漏』单路径。
