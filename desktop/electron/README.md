# 定途 Electron 桌面客户端

桌面端是当前主交付方向：Windows、macOS、Linux，Linux 目标为 AppImage 与 deb。手机端放在独立 App 阶段。

## 当前边界

- `main.mjs` 使用 `contextIsolation`、`sandbox`、`nodeIntegration:false`，只允许目录合同中的 HTTPS 外链。
- `preload.cjs` 是独立 CommonJS 文件，仅使用沙箱允许的 `require('electron')`；沙箱 preload 不支持 ESM import。它只注入不可变的 `NoyaDesktop` 公共能力描述，不暴露 cookie、令牌、文件系统、shell 或任意 IPC。
- 配置先由主进程 `runtime-contract.mjs` 校验，再通过 `additionalArguments` 传给 preload。preload 不读取 `process.env`，并拒绝缺失、重复、格式不符或含额外字段的配置；代理端口唯一来源为主进程的 `LOCAL_PROXY` 合同。
- Noya 数据面端口固定为 `127.0.0.1:17899`；它只给已验证 Agent 提供本地 HTTP/SOCKS 入站。控制 API 与本地代理严格分离，不能把 17899 当作公网管理 API。
- 当前加载主站 `/assistant/` 页面；主进程已注册固定 `noya:desktop` IPC，renderer 只可调用 `auth.status/login/cancel/logout` 和固定只读数据类型。登录通过系统浏览器 PKCE 完成，不能把网站 HttpOnly Cookie 当桌面登录方案。
- `control-client.mjs` 已把授权 URL、设备会话、设备列表、隧道状态、心跳和只读权益路径收敛为主进程客户端；`client-projection.mjs` 在 IPC 返回 renderer 前丢弃令牌、凭据、出口 IP、内部身份和未允许的字段。它要求 HTTPS、设备会话令牌和固定路径；不接受客户、出口、线路或上游参数，也不会把响应当作真实连接状态，直到运营端 facade 合入并完成端到端验收。
- `heartbeat` 严格发送设备编号、客户端版本、配置版本、固定 `127.0.0.1:17899` 状态和脱敏错误码；`electron/contract-smoke.test.mjs` 会在临时 loopback HTTP 服务上验证真实序列化和 `request_id` 错误边界。该 smoke 不是三端真实联调证据。
- `pkce.mjs` 负责主进程侧 PKCE verifier/challenge/state 和本地回调校验；授权码不进入 renderer，也不接受非 loopback 回调、query/hash 注入或状态不匹配。
- `app-launcher.mjs` 只接受客户端内置适配器产生的已验证 `env-launch` 或 `electron-launch` 注入计划，用 `spawn(..., {shell:false})` 启动并只注入本机 17899 的白名单代理变量；桌面适配器可声明受控的 `--proxy-server={{local.http}}`，用户不需要手动修改应用配置。适配边界见 [`AGENT-ADAPTER-CONTRACT.md`](../AGENT-ADAPTER-CONTRACT.md)。
- `agent-profiles.mjs` 把客户端适配器和用户实例分开：用户可从同一个 Claude Code/Codex 适配器创建 `cc1`、`cc2` 等多个实例。实例只保存别名、适配器版本、代理注入计划、接力策略和本地凭据槽位引用，不保存原始凭据、完整命令行或出口参数。
- 桌面页面通过固定 `agent.create/list/start/stop` IPC 管理实例；当前入口只支持客户端点击启动，命令行和 PowerShell 入口暂不纳入交付范围。
- `agent-supervisor.mjs` 在主进程维护应用检测/启动状态和 `immediate/restart-required` 语义；它只接受内置适配器生成的计划，不写应用配置，不保存凭据。`app-server` 或 `electron-profile` 在生命周期验证完成前保持失败关闭。
- `local-proxy.mjs` 是本机 sing-box 生命周期 supervisor，只允许主进程用服务端配置启动/停止 `127.0.0.1:17899`，拒绝 7890、外部监听、换端口、TUN/redirect 入站和 shell 参数；配置临时文件在进程结束后清理，真实生产配置仍需运营端/生产端联调。
- `diagnostics.mjs` 只检查固定 loopback、17899、localhost DNS 和本地进程状态，报告标记为 `dataSource: local`，不收集公网 IP、账号、令牌、Cookie 或上游地址。
- 原始订阅/API 凭据使用客户端 native secure-store 模块，不能进入 renderer、localStorage 或诊断。凭据槽位的 Windows Credential Manager 与 Linux Secret Service 适配骨架已通过隔离测试；设备会话已由 `electron-device-session-store.mjs` 接入 Electron `safeStorage`，通过 Windows DPAPI、macOS Keychain 或 Linux Secret Service 加密固定文件，Linux `basic_text` 会被拒绝。macOS 的企业凭据槽位 Keychain 适配仍需单独完成。
- Codex/Claude Code 的 `env-launch` 接入与额度耗尽后的请求边界串行调度只完成本地元数据和安全边界；真实上游额度判定、订阅槽位凭据读取、请求重放与运营端策略仍未接通。Codex Desktop、Claude Desktop、Antigravity 的 `electron-launch` 仍按“已验证模板 + 重启生效”运行，不能把 CLI 的通过误报成桌面端已验证。

## 本地运行

在安装 Electron 依赖后，开发环境可设置 `NOYA_PORTAL_URL` 指向本机 `/assistant/` 页面，再运行 `npm start`。打包目标由 `electron-builder` 配置为 NSIS、DMG、AppImage 和 deb。正式包只允许 `https://noyapi.cn/assistant/`（或 www 主机）作为页面来源；任意远程 URL、查询参数、凭据和其他路径都会被拒绝。正式控制面地址通过 `NOYA_API_BASE` 注入；生产必须是 HTTPS 且主机只能是 `noyapi.cn` 或 `www.noyapi.cn`。`NOYA_LOCAL_PROXY_PORT` 只能保持 `17899`，其他值会被拒绝。

`npm test` 执行配置合同和真实 preload 文件的受限加载测试：只允许加载 Electron，禁止读取环境变量或加载本地文件，并检查配置筛选和桥接对象不可变性。这是加载器级验证；不代替装有 Electron 后的原生窗口验收。

实现依据：[Electron ESM 限制](https://www.electronjs.org/docs/latest/tutorial/esm#sandboxed-preload-scripts-cant-use-esm-imports)、[沙箱 preload](https://www.electronjs.org/docs/latest/tutorial/sandbox#preload-scripts)、[`additionalArguments`](https://www.electronjs.org/docs/latest/api/structures/web-preferences)。

## 下一步

1. 主站增加 PKCE 授权码和可撤销设备会话，Electron 主进程通过系统浏览器登录。
2. 完成独立的设备会话 OS 密钥库接入（Windows Credential Manager、macOS Keychain、Linux Secret Service），renderer 只调用窄 API。
3. 单平台先跑通客户端内置的 Linux `env-launch` 适配器：检测本机应用、创建 `cc1` 实例、启动 Claude Code、核验服务端绑定出口。
4. 再验证 Codex/Claude Desktop/Claude Dot 的客户端适配器，完成多实例创建、重启提示和应用列表 UI。
5. 接入多订阅槽位的真实请求调度；额度耗尽仅在请求未被上游接受时串行切换，另一个网站的 API 额度作为后续独立上游。
6. 再扩展 Windows/macOS 签名、公证、更新和原生网络扩展。
