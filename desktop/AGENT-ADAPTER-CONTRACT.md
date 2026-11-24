# Agent 无感接入与多订阅接力合同

核对日期：2026-10-27

本文只定义用户端 Agent 的一次性接入和本地多订阅凭据池。另一个网站提供的 API 额度属于后续独立上游，本阶段不写入 Noya 的 sing-box、出口或设备会话合同。

## 目标

用户完成一次登录和授权后，在连接助手中点击“接入应用”，由桌面主进程完成安装检测、适配模板校验和受控启动。用户不需要手动编辑环境变量、JSON、TOML、快捷方式或系统代理。

应用以后每次启动都通过 Noya 的固定本地入口 `127.0.0.1:17899`，不再重复配置。

```text
用户登录 Noya
  → 设备会话就绪
  → 本地 sing-box 17899 就绪
  → 从客户端内置适配器选择应用
  → 创建本机应用实例（例如 cc1、cc2）
  → 主进程按内置适配器生成受控注入
  → Agent 只看到本机入口，不看到出口 IP、订阅令牌或线路参数
```

## 分层边界

| 层 | 负责内容 | 不负责内容 |
| --- | --- | --- |
| 客户端内置适配器 | 应用 ID、平台、检测方式、启动方式、验证状态 | 下载或提供第三方应用、用户凭据、出口地址 |
| 运营端权益接口 | 客户/成员是否有设备、流量和账号接力权益 | 第三方应用清单、应用安装、应用版本 |
| Electron 主进程 | 模板校验、绝对路径启动、环境/参数注入、应用状态 | 修改系统全局代理、上传第三方凭据 |
| 本地 Agent Supervisor | 17899 生命周期、会话粘性、订阅槽位串行调度、状态回报 | 自主选择服务端出口 |
| sing-box 数据面 | 本机入口、加密转发、服务端下发的出口策略 | 判断 API 额度、切换模型供应商 |
| 外部 API 网站 | 后续 API 额度、API 计费和 API fallback | 本阶段实现范围 |

## 应用适配策略

Claude Code、Codex、Claude Desktop、Claude Dot 等是用户自己的第三方应用。Noya 不分发这些软件，也不要求运营端维护它们的版本。客户端只提供适配器：检测本机安装、生成 `127.0.0.1:17899` 注入、绑定本地实例名称和按权限启动。应用本体不存在或版本未验证时，实例可以保存为“待验证”，但启动必须失败关闭。

### 本机应用实例

应用适配器和用户实例必须分开：

- 适配器由客户端版本提供，例如 `claude-code`、`codex-cli`、`claude-desktop`、`claude-dot`；
- 实例由用户创建，例如 `cc1`、`cc2`，保存 `appId`、平台、适配器版本、代理注入计划、接力策略和本地凭据槽位引用；
- 实例不保存完整命令行、第三方 token、Cookie、API Key、出口地址或用户可编辑的可执行路径；
- 适配器升级后只标记“模板需要更新”，不静默修改正在使用的实例；
- 运营端只下发 Noya 权益和接力策略，不控制第三方软件安装或启动。

### Claude Code CLI

- 适配：`env-launch`。
- 启动时由主进程注入 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY` 到 `127.0.0.1:17899`。
- 不写入 `~/.claude/settings.json`、凭据或项目配置。
- CLI 运行中的请求由本地 Supervisor 按当前 session 选择订阅槽位。

### Codex CLI

- 适配：`env-launch`，必要时补充 Codex 官方 app-server 的环境模板。
- 不覆盖 `auth.json`，不改变官方登录状态。
- CLI 与桌面版分开验证；CLI 可用不代表桌面版已完成。
- 2026-10-27 本机实测：官方 Codex CLI `0.164.0` 的直接二进制在隔离 `CODEX_HOME` 下由 Noya 启动器拉起，退出码为 `0`；启动计划只注入 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY`，值固定指向 Noya 本机代理入口（v1.16 已统一迁移至 `127.0.0.1:17899`）。实测没有读取现有登录目录，也没有修改本机 `codex.ps1`。
- 本机 `codex.ps1`/`.cmd` 包装脚本当前固定写入 `127.0.0.1:7897`，不属于 Noya 启动路径；生产模板必须使用运营目录下已验证的绝对二进制路径或经检测绑定的路径。

### Codex Desktop、Claude Desktop、Antigravity

- 适配：`electron-launch`。
- 主进程使用已验证的绝对可执行文件路径启动，并传入受控 `--proxy-server={{local.http}}` 和 `--proxy-bypass-list=<-loopback>`。
- 同时注入子进程可识别的代理环境变量。
- 适配器只允许客户端声明的固定参数，用户不能填写可执行文件、启动参数或代理地址。
- 应用已运行时显示“请退出并重新接入”，不能重复启动或伪造即时切换。

### 移动端

- 使用独立 App 的系统 VPN/网络扩展方案。
- 不把桌面 Electron 的启动模板复制到 iOS/Android。
- 应用选择只影响本机显示和深链，网络出口仍由服务端绑定。

## 一次性接入流程

1. 从客户端内置适配器选择 `appId`、平台和当前适配器版本。
2. 检测应用是否安装；检测失败只显示安装指引，不执行任意 shell。
3. 主进程获取本机 17899 状态和设备会话，确认数据面已就绪。
4. 对 `verified` 模板创建受控启动入口；`beta` 必须明确提示测试状态；`unverified` 不允许自动启动。
5. 启动后检查目标进程、代理参数和本地探活结果。
6. 保存本机适配版本和最近一次验证结果；不保存第三方凭据或完整命令行。

一次性接入成功后，实例卡片显示“已接入”。后续点击实例只调用同一个受控入口，不要求用户再次填写配置；同一个适配器可以创建多个实例。

## 多订阅号接力

每个 Noya 客户或企业成员拥有独立的本地凭据池。企业等级只决定可用槽位数量、流量权益和管理员策略，不代表企业成员之间共享原始凭据。

每个槽位只保存以下元数据：

- `slotId`、提供商、显示名称；
- 系统安全存储引用 `credentialRef`；
- 优先级、状态、剩余额度摘要、重置时间、冷却时间；
- 最近一次切换原因和脱敏错误码。

原始订阅凭据只进入 Windows Credential Manager、macOS Keychain 或 Linux Secret Service。浏览器存储、日志、诊断包和服务端均不得出现原文。

调度规则：

1. 一个 Agent session 固定一个槽位。
2. 额度耗尽在请求边界切换到下一个可用槽位。
3. 短期 RPM/TPM 限制按 `Retry-After` 冷却；不把所有 429 都视为额度耗尽。
4. 流式响应开始后不切换；当前请求失败时只有服务端/适配器确认“请求尚未被上游接受且可安全重试”才允许重试。
5. 认证失败、403、地区限制、安全策略拒绝和账号停用不自动换号。
6. 所有槽位都不可用时，返回明确的 `credential_pool_exhausted` 和最早恢复时间。
7. 应用重启后 session 粘性可以重新建立；不能假设旧进程仍持有有效租约。

## 事件和状态回报

本地回报只发送脱敏事件：

- `agent_attach_started`、`agent_attach_succeeded`、`agent_attach_failed`；
- `credential_slot_selected`、`credential_slot_cooldown`、`credential_slot_exhausted`；
- `credential_failover`、`credential_pool_exhausted`；
- `agent_process_started`、`agent_process_stopped`；
- `local_proxy_ready`、`local_proxy_degraded`。

事件必须包含 `deviceId`、`appId`、`platform`、`sessionHash`、`slotIdHash`、时间、脱敏原因和客户端版本；不得包含 token、Cookie、API Key、完整路径、提示词或请求正文。

## 外部 API 网站的后续扩展

另一个网站的 API 额度作为独立 `external-api` 上游接入，不改变 Agent 的一次性本地配置。未来的开关只控制：

```text
订阅槽位耗尽后是否允许使用外部 API 网站额度
```

该开关不允许用户填写 API 地址或 API Key。外部 API 网站的余额、计费、模型映射和 fallback 由其自身服务负责；Noya 只保存用户授权引用和脱敏状态，并按后续三方接口契约接入。

## 当前实现状态

- `electron/app-launcher.mjs`：已支持安全的 `env-launch` 和 `electron-launch` 注入计划，允许受控的 `{{local.http}}` 等本地占位符；不调用 shell；父进程环境只保留跨平台运行所需白名单，`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、内部 token 等不会继承给 Agent。
- 客户端可以声明未来的 `app-server`、`electron-profile` 和 `WS_PROXY/WSS_PROXY` 适配能力；当前启动器对未实现的 app-server/profile supervisor 返回 `APP_ADAPTER_UNSUPPORTED`，不把它们当作普通 shell/exec 模板执行。
- 启动器提供只读 `plan()`：可在启动前完成绝对路径检测、参数解析和 `immediate/restart-required` 判定；Windows `Program Files` 路径中的空格不会被误判为 shell 命令。
- `electron/agent-supervisor.mjs`：主进程侧维护每个应用的检测、启动、运行、退出和失败状态；重复启动会拒绝，状态不进入 renderer 之外的秘密范围。
- `local-tools.js`：已有本地槽位状态、session 粘性、冷却、额度耗尽和请求边界串行切换骨架。
- `native/*secret-store*`：Windows/Linux 安全存储适配骨架已有；macOS Keychain helper 仍待完成。
- 尚未完成：设备会话 facade 的真实联调、真实 Agent 请求接管、17899 生产配置签发、设备租约、Claude/Codex Desktop 适配器验证和生产事件回报。上述本机 CLI smoke 只证明进程启动和环境注入，不证明请求已经经过 17899 或生产出口。

本合同不把外部 API 额度当作 Noya API，也不允许在本阶段为了实现 fallback 而修改 sing-box 出口合同。
