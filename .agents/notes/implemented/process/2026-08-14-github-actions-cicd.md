# Agent Note: GitHub Actions 自动部署

Status: implemented

## Problem

部署依赖本地 CLI 与登录态，且 `-a overseas` 区域参数不持久化、漏带即回退 global（见[部署区域笔记](2026-08-14-deployment-area-and-domain-management.md)）。
需要推送即部署的自动化：main 分支变更自动发布生产环境，Pull Request 提供可审阅的预览链接。

## Decision

在仓库中提供两个 GitHub Actions 工作流与一个一键部署入口：

- `.github/workflows/deploy.yml`：向 `main` 推送时部署**生产环境**。步骤为 checkout → setup-node（22.11.0）→ `npx edgeone makers deploy -n ip-check -a overseas -t ${{ secrets.EDGEONE_API_TOKEN }}`；
- `.github/workflows/preview.yml`：`pull_request_target` 的 `opened` 事件触发，部署**预览环境**（`-e preview --json`）。checkout 显式指定 `ref: ${{ github.event.pull_request.head.sha }}`——`pull_request_target` 默认检出 base 分支，不指定则预览部署的是 main 而非 PR 代码；部署输出用 python3 解析 `url`/`projectId`，经 `thollander/actions-comment-pull-request` 在 PR 评论区附预览链接；
- 前置条件：GitHub 仓库 secret `EDGEONE_API_TOKEN`（Makers 控制台生成，见[API Token 文档](https://cloud.tencent.com/document/product/1552/127422)）；
- README 顶部的一键部署按钮（[部署按钮文档](https://cloud.tencent.com/document/product/1552/127397)）：`makers/new?repository-url=<仓库 URL>&project-name=ip-check`，把仓库作为部署源直接创建项目。

工作流**不执行 `npm run build`**：本项目无第三方依赖、无构建步骤，CLI 自动构建并上传当前目录。
`-a overseas` 已固化进工作流命令，避免区域漂移。

## Alternatives considered

- **Makers 控制台 Git 集成（推送触发平台侧构建）**——保留为方式 B 备选；控制台集成与 Actions 都可用时，Actions 的预览评论能力更强，且构建与部署过程完全在仓库内可审计。
- **PR 预览输出解析用文档示例的 `grep EDGEONE_DEPLOY_URL=`**——该标记依赖 CLI 特定输出格式，不如 `--json` 的机器可读输出稳定；采用 `--json` + python3 解析。
- **按文档模板保留 `npm run build` 步骤**——模板面向有构建步骤的框架项目；本项目无 build 脚本，执行会失败；跳过构建步骤，由 CLI 处理。

## Consequences

推送 main 即自动发布生产（建议配合分支保护与 PR 评审流程）；PR 预览让页面改动在合并前可见。
代价：preview 工作流检出 PR 头部代码并在持有 `EDGEONE_API_TOKEN` 的环境中部署——CLI 对仓库文件只做打包上传、不在 CI 执行函数代码，但 PR 对仓库文件的修改会随 checkout 进入 runner，评审时需留意工作流与脚本文件的改动；生产发布依赖 `EDGEONE_API_TOKEN` 的权限边界（建议使用最小权限的专用 Token）。