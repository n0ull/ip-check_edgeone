# Agent Note: esbuild 打包门禁

Status: implemented

## Problem

`npm test` 全部消费本地未打包源码：simulate 断言模块逻辑，双 DOM 沙箱执行 `browserScript` 在 node 直跑产出的序列化值。平台真实构建（esbuild 对每入口独立 bundle，见[import 调研笔记](../process/2026-08-27-edgeone-makers-import-support-investigation.md)）对源码的转换——AST 重印、符号改名——不在任何门禁覆盖内。2026-08-29 线上事故（[WebRTC 自由标识符改名笔记](../bug-fix/2026-08-29-webrtc-free-identifier-esbuild-rename.md)）暴露该盲区：本地 97 断言全绿，线上 webrtc 页 ReferenceError。既有回评条件（升级 CLI 后人工重跑部署冒烟）粒度粗且不进提交链。

## Decision

`test/bundle-gate.mjs` 进 `npm test` 链（ui-dom/webrtc-dom 之后、verify:notes 之前）：

1. **打包**：esbuild API（`bundle: true, format: 'esm'`，其余默认）把两入口打进临时目录——选项经实测与线上产物一致（同一缺陷在同选项下复现、修复后消失）。
2. **导入打包产物**：`[[default]].mjs` 的 `WEBRTC_SCRIPT`、`index.mjs` 的 `uiScriptFor`——测试消费平台构建后的真实序列化值，与线上同管线（含 `uiScriptFor` 的 BASE 实例化）。
3. **行为断言**：复用 dom-sandbox（mock + Proxy 陷阱）跑三条用户可见契约——webrtc 泄漏一致分支（覆盖 `extractIp` 对 host/srflx 候选的提取、`isPublicIp` 过滤实调、判定链）、ui 双栈分支（覆盖 `grab`/`setStatus`/`looksLikeIp` 局部链与 `familyOf`→`verdictFor` 共享链）与 ui 同源回退分支（路由键取端点路径 fact、响应体从打包 `[[default]].js` onRequest 派生，见[端点路径单源化笔记](../simplification/2026-08-29-endpoint-path-fact-single-sourcing.md)），共 13 断言。ICE 处理器错误捕获器把处理器内异常收进断言而非进程崩溃。

打包门禁断「打包后行为」，与既有测试断「源码行为」互补；序列化机制本体（剥壳不变式、拣选）仍由 simulate 钉住，不在门禁中复刻。

## Alternatives considered

### 打包产物与本地序列化字节一致断言
esbuild AST 重印（引号、缩进、`\uXXXX` 转义、注释剥离）使两侧文本必然不同，断言永不成立。放弃（该差异是[import 调研笔记](../process/2026-08-27-edgeone-makers-import-support-investigation.md)记载的已知事实）。

### 打包产物复跑全部既有场景（webrtc 四分支 + ui 四路径）
改名类断裂在关键路径（任何一次共享符号实调）即现，全量复跑只翻倍时长与断言数。放弃，保留最小关键路径集（按同类盲区增量扩充，不追求场景全量）。

### 静态标识符自洽检查（不做打包）
不经平台转换即检查，拦不住打包期改名，且复刻 `browserScript` 内部知识。放弃——与[改名笔记](../bug-fix/2026-08-29-webrtc-free-identifier-esbuild-rename.md)同款备选。

## Consequences

买到的：平台构建转换进入提交链门禁，「本地绿、线上废」盲区结构性封堵；页面脚本新增共享符号引用而忘 import 时 `npm test` 即红并点名缺失符号。
付出的：`npm test` 依赖 esbuild（项目首个 devDependency，仅本地/CI，不进边缘产物）；门禁复刻基于 CLI v1.6.28 反编译与线上实测——平台构建器选项变更时复刻可能失真，回评条件并入 import 调研笔记既有条款。
