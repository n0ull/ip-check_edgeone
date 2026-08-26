# Agent Note: EdgeOne Makers 跨文件 import 支持现状调查

Status: proposed

## Problem

`edge-functions/index.js` 与 `edge-functions/[[default]].js` 各自内联了同一组共享函数（集合由 `test/consistency.mjs` 交集推导自动维护，当前 10 个，含 `methodGuard`），而非提取到共享模块后 import。原因是 2024-08 时「边缘构建器对跨文件 import 的支持未经验证，失败即全站不可用」——见 [客户端 IP 契约笔记](../implemented/architecture/2026-08-14-client-ip-acquisition-contract.md) 与 `edge-functions/[[default]].js:11` 注释。

双份内联的代价是同步维护负担，已由 `test/consistency.mjs` 机械兜底，但这是补救而非根除。本调研回答：**2026-08 的 EdgeOne Makers 构建器是否已支持跨文件 ESM import？** 以决定是否可以安全迁移到共享模块。

## Proposal

**结论：支持。** 当前 CLI（`edgeone` v1.6.28，2026-08 发布）的边缘函数构建器对每个 `.js/.ts` 入口文件独立调用 esbuild 并开启 `bundle: true`，且未传入 `external` 限制——esbuild 默认会解析并内联所有本地相对路径 import。因此 `index.js` 与 `[[default]].js` 各自 `import { ... } from './_shared.js'` 在构建期会被正确解析与打包，不会导致全站不可用。

建议后续在确认证据可接受后，新建一篇 `proposed/` 迁移笔记，将共享函数提取到 `edge-functions/_shared.js`（无 `onRequest` 导出，`readIndexFiles` 会跳过它不作为路由），两入口文件改为 import，并删除 `test/consistency.mjs` 的双份内联一致性校验（或降级为纯风格lint）。

## 调研发现

### A. 本地 CLI 帮助

运行 `npx edgeone makers --help` / `build --help` / `deploy --help`，输出中**没有任何**关于「不支持跨文件 import」「单文件限制」的警告或说明。`build --help` 仅暴露 `--external`（外部化 npm 包）与 `--mode` 两个选项，未涉及文件间 import 限制。

- 来源：`npx edgeone makers build --help` 输出（2026-08-26 本地执行）

### B. CLI 包反编译（一手源码证据）

`edgeone` npm 包 v1.6.28（发布者 `tencent-player <vincentlli@tencent.com>`，Tencent 官方）是理解构建行为的最直接一手来源。包已完全 bundle/minify，但关键构建逻辑可从 `edgeone-dist/cli.js` 中提取：

**边缘函数构建器（类 `sj`）流程：**

1. `readIndexFiles(e)` 递归扫描 `edge-functions/` 下所有匹配 `/\.(ts|js|cjs|tsx|jsx)$/` 的文件：
   ```js
   async readIndexFiles(e){
     let r=Kb.readdirSync(e);
     for(let n of r){
       let o=TGr.join(e,n);
       if(Kb.statSync(o).isDirectory()) this.readIndexFiles(o);
       else if(/\.(ts|js|cjs|tsx|jsx)$/.test(n)){
         let c=Kb.readFileSync(o,"utf-8");
         if(this.isPagesFunction(c)){        // 含 "onRequest" 才视为 Pages Function
           let u=this.bundleAndGetString(o); // ← 关键：esbuild 单文件 bundle
           u&&this.isPagesFunction(u.text)&&this.arrangeText(u)
         }
       }
     }
   }
   ```
   共享文件（如 `_shared.js`）不含 `onRequest`，会被 `isPagesFunction` 过滤掉，**不会**被注册为路由——行为正确。

2. `bundleAndGetString(e)` 对每个入口文件调用 esbuild：
   ```js
   BGr.buildSync({
     entryPoints:[e],
     bundle:!0,          // ← bundle: true，解析并内联所有依赖
     write:!1,
     outfile:"./.tef_dist/assets.js",
     define:r
   })
   ```
   **没有传入 `external` 数组**（与 cloud-functions / agent-node 的构建不同，后者显式 external 了 `@prisma/client`、`sharp` 等）。esbuild `bundle: true` 的默认行为是解析所有本地相对路径 import（`./shared.js`、`../helpers/x.js` 等）并内联其代码。

   `resolveExtensions`（在 cloud-functions 的同包构建中可见）为 `[".ts",".tsx",".js",".jsx",".mjs",".cjs",".mts",".cts"]`，边缘函数构建共享同一 esbuild 实例，行为一致。

3. 构建产物是单个 bundle 文本，经 `addLogicSnippet` 按优先级/特异性排序后拼接为最终运行时 bundle（`./.edgeone/edge-functions/index.js`）。

- 来源：`/tmp/package/edgeone-dist/cli.js`（`npm pack edgeone@1.6.28` 提取，2026-08-26），关键片段：`readIndexFiles`、`bundleAndGetString`、`isPagesFunction`、`addLogicSnippet`、`async build()`

**重要区分：边缘函数 vs 云函数构建模型不同。** 云函数（`cloud-functions/`）由另一构建器（`AGr` 函数）处理，同样用 esbuild `bundle: true`，但它暴露 `externalNodeModules` / `includeFiles` 配置项（通过 `edgeone.json`）。边缘函数构建器没有暴露这些配置——它直接 bundle 每个文件，本地 import 天然被解析。

**未发现任何 import 限制。** 在 cli.js 中搜索 `import`、`跨文件`、`multi-file`、`not support` 等关键词，仅命中 esbuild 内部代码与 mime-type 表，无任何针对边缘函数跨文件 import 的禁止或警告逻辑。

### C. 官方文档

- **edgeone.ai（国际站）**：首页描述 Makers 为「A Full-Stack Dev Platform for Web and AI Agents」，列出「Edge Functions」「Serverless Functions」能力，但**没有**公开的「项目结构」「多文件 import」「依赖管理」专门文档页。尝试 `https://edgeone.ai/docs/makers`、`https://edgeone.ai/docs`、`https://www.edgeone.ai/docs/makers/overview` 均返回 404。文档入口似乎 gated 在控制台内。
  - 来源：`https://edgeone.ai/pages`（2026-08-26 WebFetch），`https://edgeone.ai/docs/makers`（404）

- **cloud.tencent.com（中国站）**：产品文档首页 `https://cloud.tencent.com/document/product/1552` 可访问，列出「边缘函数」「通过 Makers 快速部署网站」等目录项，但具体「边缘函数 → 函数规范/项目结构/依赖管理」子页的文档 ID 未知且尝试 `64779`、`64781` 均 404。WebSearch 对中国站文档无索引（geo 限制）。
  - 来源：`https://cloud.tencent.com/document/product/1552`（2026-08-26 WebFetch）

- **结论**：官方文档未能提供关于跨文件 import 的显式声明（无论支持或不支持）。文档缺失本身不是证据，但结合 CLI 源码可推断：没有显式禁止 = esbuild 默认行为生效 = 支持。

### D. npm 包

- 包名：`edgeone`（非 scoped），当前 latest v1.6.28，一周前发布。
- 关键词：`tencent, edgeone, edgefunctions, edgeone, cli, typescript`。
- 构建依赖：`esbuild ^0.19.2`（bundle 引擎）。
- 无 `@edgeone/makers` 或 `@edgeone/cli` scoped 包（npm 404）。
- 来源：`npm view edgeone@1.6.28`（2026-08-26）

### E. GitHub

GitHub 搜索被 robots.txt 阻止（`User-agent: * Disallow: /search$`），无法直接抓取仓库。npm 包的 `gitHead: 8d1157e9ff21acc854dd172cd057b8bf35696655` 暗示存在内部 git 仓库，但未公开指向。无法从 GitHub issues/discussions 获取社区讨论作为佐证。
- 来源：`https://github.com/search?q=edgeone+makers`（robots.txt 阻止，2026-08-26）

### F. 项目既有笔记（历史基线）

2024-08 定案的原始理由记录在三处：

1. `.agents/notes/implemented/architecture/2026-08-14-client-ip-acquisition-contract.md:21`：「抽公共模块 `_lib.js` 供两文件 import——**边缘构建器对跨文件 import 的支持未经验证，失败即全站不可用**；为确定性牺牲少量重复，两文件各内联约 20 行。」
2. `edge-functions/[[default]].js:11`：「为保证边缘构建器兼容性，本文件与 index.js 各自内联了相同的工具函数，**不跨文件 import**」
3. `test/consistency.mjs:2-3`：「双文件内联一致性校验……背景：index.js 与 [[default]].js 各自内联同一组工具函数（**边缘构建器兼容性约束，不跨文件 import**）」

这三处是本次调研要 revisit 的基线。

## Alternatives considered

### 继续双份内联（维持现状）
零迁移风险，但持续支付同步维护成本。`test/consistency.mjs` 已机械兜底，但兜底本身也是代码要维护。仅当对调研结论不够确信时选此。

### 提取 `_shared.js` 供两文件 import（推荐）
一次性消除重复，根除同步负担，`test/consistency.mjs` 的相关断言可删除或降级。需要一次受控迁移 + 线上冒烟验证（见 Acceptance criteria）。

### 使用 `_shared.js` 但继续内联（混合）
无意义，跳过。

### 其他模块方案（`require`、动态 `import()`）
边缘函数运行时是 V8 ESM（`"type": "module"`），`require` 不可用；动态 `import()` 在 bundle 后仍可工作但不必要——静态 import 已被 esbuild 解析。跳过。

## Acceptance criteria

满足以下任一则认为调研结论成立：

1. **构建产物验证**：在本地 `edge-functions/` 下新建 `_shared.js`（导出一个工具函数），让 `index.js` 改为 `import`，运行 `edgeone makers build`（或 `dev`），检查 `.edgeone/edge-functions/index.js` 产物中包含 `_shared.js` 的代码且无 `Could not resolve` 错误。
2. **部署冒烟**：将上述改动部署到 preview 环境，访问 `4.ip.*` 与 `test.ip.*` 子域，确认响应与改前一致（现有 `test/simulate.mjs` 断言全绿）。
3. **CLI 源码**：本笔记已提供的 `bundleAndGetString` esbuild 调用证据（`bundle:!0`，无 `external`）即为静态证明。

## Risks

1. **推断而非显式声明**：结论来自 CLI 包反编译推断，非官方文档的明确「支持跨文件 import」声明。若 Tencent 在运行时（非构建时）对 bundle 做二次处理（如按文件切割下发），理论上可能引入差异——但 `readIndexFiles` 将所有文件拼入单一 bundle 的设计降低了这种风险。
2. **文档不可达**：中国站官方文档与 GitHub 源码均无法访问（geo / robots.txt），缺少社区讨论与官方 FAQ 的旁证。若后续能访问控制台内文档，应复核。
3. **版本差异**：证据基于 v1.6.28（2026-08 发布）。若团队锁定旧版 CLI，行为可能不同——但 `package.json` 未锁定 `edgeone` 版本（通过 npx 获取 latest），实际使用的就是 latest。
4. **bundle 重复**：`index.js` 与 `[[default]].js` 各自独立 bundle，共享代码会在两个产物中各出现一份。对当前 ~20 行工具函数可忽略；若共享模块增长到 KB 级，需评估 bundle 体积（边缘函数有大小限制）。这是体积问题，不是正确性问题。
5. **`_shared.js` 被误注册为路由的风险**：`readIndexFiles` 递归扫描所有 `.js` 文件，但 `isPagesFunction`（检查 `onRequest`）会过滤掉纯工具模块。只要 `_shared.js` 不导出 `onRequest`，就不会被注册为路由——迁移时需确保这一点（可通过不 export `onRequest` 保证）。
