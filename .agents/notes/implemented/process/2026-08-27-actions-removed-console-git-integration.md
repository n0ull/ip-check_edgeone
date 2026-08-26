# Agent Note: 部署路径修正——移除 GitHub Actions，控制台 Git 集成为唯一自动部署

Status: implemented

## Problem

仓库曾内置两个 GitHub Actions 工作流（`deploy.yml` push 部署生产、`preview.yml` PR 部署预览，见原 [CI/CD 笔记](../../archived/process/2026-08-14-github-actions-cicd.md)），但项目 `ip-check` 的 Provider 为 Github（经一键部署按钮以仓库为源创建），**CLI 直传被平台拒绝**：`Project ip-check exists but has Provider 'Github'`。Actions 历史运行全部失败，每次 push 产生失败噪音；真实生产部署一直由 Makers 控制台 Git 集成承担（push main → 平台侧构建发布，2026-08-27 经用户控制台确认）。

## Decision

删除 `.github/workflows/deploy.yml` 与 `.github/workflows/preview.yml`；README「方式 B」改写为控制台 Git 集成的真实描述；原 CI/CD 笔记按归档机制归档冻结。自动部署完全依赖平台侧 Git 集成，仓库内不再保留任何 CI 工作流。

## Alternatives considered

- **修复 Actions 使其可用**——CLI 无「触发平台构建」命令，Github Provider 项目不接受直传，无可修路径；放弃。
- **删项目重建为 Upload Provider**——自定义域名与站点配置需迁移，为 CI 偏好付出迁移成本不划算；Git 集成已满足推送即部署；放弃。
- **保留工作流容忍失败**——每次 push 的红色失败噪音会稀释真实信号；放弃。

## Consequences

推送 main 即生产发布的体验不变（平台侧构建），仓库不再产生 Actions 失败噪音；PR 预览评论能力随之移除（平台 Git 集成若提供预览部署，以其为准）。
代价：部署过程不再在仓库内可审计（构建日志在 Makers 控制台）；仓库 secret `EDGEONE_API_TOKEN` 失去用途（可在 GitHub 仓库设置中删除）。
