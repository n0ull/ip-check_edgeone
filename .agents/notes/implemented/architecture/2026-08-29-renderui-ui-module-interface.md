# Agent Note: renderUi 成为 UI 模块唯一 interface（uiScriptFor 与输出契约重整）

Status: implemented

## Problem

`__BASE__` 实例化知识散落三处：`renderUi`（生产替换）、`ui-dom.mjs`（`.split('__BASE__').join(BASE)` 复刻）、`simulate.mjs` 胶水断言（同款复刻）——测试复刻实现机制，占位符格式一变行为不变而测试碎。同时 simulate 的输出断言里混有纯 markup 钉住（`class="field"`/`class="lbl"`/`class="card"`）：用户对类名零感知，排版微调白白碎测试，且类名一改即绕过检查（假精度——防不住它声称要防的回归）。此为架构评审候选 2（2026-08-29）的摩擦诊断。

## Decision

- **`uiScriptFor(base)` 导出为 UI 模块 interface 成员**（index.js）：脚本值按生产同管线实例化（`__BASE__` → `sanitizeBase(base)`）；`sanitizeBase` 提取为 base 净化的唯一实现，`renderUi` 与 `uiScriptFor` 共用。净化后字符集（`[a-zA-Z0-9.-]`）内 HTML 转义为恒等，故 `uiScriptFor` 产物与 `renderUi` 输出中的脚本子串逐字一致——一致性可证而非靠约定。
- **测试只从这一个 seam 进入**：ui-dom 改调 `uiScriptFor(BASE)`；simulate 胶水断言改比对 `uiScriptFor('ip.example.com')`——实例化知识 3→1，复刻清零（断言仍证明模板确实嵌入了实例化脚本，机制变化不再碎测试）。
- **输出断言按「用户可见契约」重整**（判别法：断言失败时用户会察觉什么）：删除 `class="field"`/`class="lbl"` 布局钉住与 `class="card"` 检查（用户零感知 + 假精度，web-ui 笔记记录的是布局语义而非类名）；保留文本/措辞/导航/BASE 注入等用户可见契约。
- **`id="hint"` 存在性断言保留且为承重墙**：dom-sandbox 的 `makeDom` 自动补建元素，ui-dom 无法发现模板缺元素——simulate 这条文本断言是「模板真的包含提示条元素」的守卫；2026-08-29 起该承重断言模式推广到 webrtc 页五元素 id（pub/loc/ext/run/verdict，simulate `/webrtc` 段），两页结构守卫对齐。
- **元素 ID 三处同步接受现状**（模板 ids / 浏览器字面量 / 测试断言）：浏览器函数不可引用模块常量（序列化后成自由引用，恰是[页面脚本作用域笔记](2026-08-29-page-script-scope-and-browserscript.md)的 Proxy 陷阱所拦的泄漏类），共享常量最多统一 2/3 且造成全覆盖错觉；三个漂移方向均已功能性把守（浏览器字面量拼错 → 沙箱内 getElementById 得 null → TypeError 门禁红；模板改名 → ui-dom 行为断言红）。此裁决记录在案，防止未来架构评审重提。

线上行为零变化：`renderUi` 输出逐字不变（esc∘sanitize ≡ sanitize），端点语义不变；66+17+14 断言全绿。

## Alternatives considered

### renderUi 加模式参数（如 scriptOnly: true 返回纯脚本）
布尔旗标是 shallow interface：调用方要懂内部模式，interface 复杂度随实现细节增长。独立成员 `uiScriptFor` 各自单一职责。放弃。

### 测试从渲染 HTML 抠 `<script>` 内容
刮取式断言——[浏览器脚本即真实函数笔记](../simplification/2026-08-26-browser-js-as-real-functions.md)已明确退役的路径（模块内部值应成为测试面而非被正则切除）。放弃。

### 共享 IDS 常量统一元素 ID 词汇表
浏览器侧闭不上圈（见 Decision 末条），只能造出「已统一」的错觉。按认知负荷原则：正确抽象闭不上圈时，重复比错误抽象便宜。放弃。

## Consequences

实例化知识单点化；排版与类名可自由重构而测试不碎；simulate 的 UI 断言全部落在用户/调用方真实所得上。`uiScriptFor` 成为新导出面（EdgeOne 仅消费 `onRequest`，额外导出惰性——同 `UI_SCRIPT`/`WEBRTC_SCRIPT` 先例，见[浏览器脚本笔记](../simplification/2026-08-26-browser-js-as-real-functions.md)）。
代价：布局回归的机器检测变弱——被删的类名检查本就是假精度（改类名即绕过），真防视觉回归需要渲染级测试，超出本仓库「逻辑断言 + DOM 沙箱」的测试哲学；该取舍在此记录。
[浏览器脚本笔记](../simplification/2026-08-26-browser-js-as-real-functions.md)中 simulate 胶水/结构断言的事实已同步。
