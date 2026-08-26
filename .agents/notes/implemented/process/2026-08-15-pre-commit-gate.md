# Agent Note: Git 提交前预检钩子

Status: implemented

## Problem

本地验证（语法检查、逻辑断言、双文件一致性、Agent Note 格式）此前全靠提交者自觉执行 `npm test`，漏跑则缺陷直达 push 甚至生产部署；GitHub Actions 工作流只部署、不含测试步骤，本地是最后一道可拦截的环节。

## Decision

仓库内置 `.githooks/pre-commit`（POSIX sh）：依次执行 `node --check` 两个函数文件与 `npm test` 全量门禁（构成以 `package.json` 的 `test` script 为权威，机制见[测试门禁笔记](../testing/2026-08-15-dual-inline-consistency-and-test-gates.md)），任一失败即阻断提交。
启用方式为 `git config core.hooksPath .githooks`，由 `scripts/install-hooks.mjs`（挂在 npm `prepare` 钩子）在 `npm install` 时自动执行；无 git 或非仓库环境（CI 纯部署、Makers 一键部署）静默跳过、不阻断安装。手工启用命令记录在 README 的本地调试一节。

## Alternatives considered

- **husky 等钩子管理器**——项目无第三方依赖，为一个 `git config` 命令引入依赖与安装生命周期不划算；`core.hooksPath` 是 git 原生能力；放弃。
- **依赖 CI 做测试门替代本地钩子**——Actions 工作流当前不含测试步骤，且本地拦截反馈更快、成本更低；两者互补，本笔记解决本地侧。

## Consequences

提交即触发完整本地验证：漏跑测试、双文件漂移、漏写或写错 Agent Note 在 commit 时被拦截；钩子脚本随仓库版本管理，克隆后 `npm install` 自动生效。
代价：`prepare` 钩子在无 git 环境打印一行跳过提示（无害）；`--no-verify` 仍可绕过——预检定位为防疏忽，不防故意。
