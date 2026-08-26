# Agent Note: 协议族语义与措辞

Status: implemented

## Problem

`test.<域名>` 只能回答『**本次连接**实际走了哪个协议族』，无法区分『网络无 IPv6』与『双栈下 IPv4 竞速胜出』（Happy Eyeballs 中 IPv4 连接成功 ≠ 策略上 IPv4 优先）。
早期版本在 IPv4 连接时输出『IPv4 访问优先』并在 JSON 中输出 `ipv6Preferred: false`，把连接事实夸大成策略判定，误导纯 IPv4 用户。

## Decision

语义严谨化（允许破坏性变更，正确性优先）：

- **UI 徽章**：IPv6 连接 →『IPv6 访问优先』（事实成立）；IPv4 连接 →『IPv4 连接』，双栈测试行状态补充『本次连接为 IPv4，无法判定 IPv6 是否存在』；服务端初始徽章同文案（两态徽章文案与样式的唯一承载点为 `verdictFor`，服务端 renderUi 与浏览器 init 共用同一实现，见[判定表收敛笔记](../simplification/2026-08-27-verdict-single-source.md)）；
- **JSON**：`ipv6Preferred` 字段**仅在 `family === 'IPv6'` 时输出 `true`**；IPv4 连接不输出该字段（字段缺失即『无法判定』，而非 `false`）；
- **响应头**：`x-ip-preferred` 按同一规则仅 IPv6 连接时输出，IPv4 连接不输出该头（见[响应头对齐与方法门禁笔记](2026-08-15-preferred-header-and-method-guard.md)）；`x-ip-family` 两种协议族均输出；
- 措辞检查进入测试套件：断言 UI 不含『IPv4 访问优先』、IPv4 JSON 不含 `ipv6Preferred`。

## Alternatives considered

- **保留 `ipv6Preferred: false` 并解释为『IPv4 优先』**——纯 IPv4 网络下这是错误归因（网络根本没有 IPv6 可选），且破坏 API 语义；放弃。
- **JSON 增加 `note` 字段解释**——字段缺失本身就是最简洁的『无法判定』表达，多余字段增加解析负担；放弃。

## Consequences

API 消费者与 UI 不再把『IPv4 连接』误读为『IPv4 策略优先』；`ipv6Preferred` 只在可为真的场景出现。
代价是客户端需按字段缺失处理『无法判定』分支——这是 API 语义的破坏性变更，已在 README 端点表与测试中断言。