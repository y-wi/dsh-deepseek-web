<div align="center">

# dsh-deepseek-web

**将 DeepSeek 网页端接入 DeepSeek Harness**

[English](./README.en.md) · [中文](./README.md) · [安装](./INSTALL.md) · [npm](https://www.npmjs.com/package/dsh-deepseek-web)

[![npm](https://img.shields.io/npm/v/dsh-deepseek-web?color=1d4ed8&label=npm)](https://www.npmjs.com/package/dsh-deepseek-web)
[![release](https://img.shields.io/github/v/release/y-wi/dsh-deepseek-web?color=0f172a)](https://github.com/y-wi/dsh-deepseek-web/releases)
[![license](https://img.shields.io/github/license/y-wi/dsh-deepseek-web?color=334155)](./LICENSE)
[![node](https://img.shields.io/node/v/dsh-deepseek-web?color=1e293b)](https://nodejs.org)

<p>
  <img src="docs/assets/overview.png" alt="dsh-deepseek-web 架构总览：浏览器登录、DSH 工具调用、会话回放与预构建 WASM 核心" width="920">
</p>

**开源 TypeScript 集成层** · 预编译 WASM 协议核心  

<h3>
请严格遵循相关使用政策，禁止将此项目用于反代等破坏系统正常运行的行为，仅限个人学习使用
  
</h3>

<h3>
<em>想快速构建一个属于你的智能体？试试 <a href="https://github.com/aifluxon/aifluxon">AIFLUXON</a>：可嵌入的 Agent runtime，支持 Rust二次开发并提供 Python API，快速将AI接入现有程序，统一处理流式输出、工具、审批、会话、取消与预算，适合 AI 应用、Coding Agent、CLI 与自定义 Host。</em>
</h3>

</div>


非官方 Provider。本仓库开放 Harness **集成层与传输层**；协议兼容由随包分发的预编译 WebAssembly 提供。

本项目与 DeepSeek **无隶属或背书关系**。使用你自己的 DeepSeek 账号。插件不会绕过 CAPTCHA、WAF 或账号访问控制；交互式验证在隔离浏览器窗口中完成。

## 安装

需要 DeepSeek Harness **0.1.0-rc.7**（或兼容版本），Node `^22.19.0 || >=24.0.0`。

```bash
dsh plugin --profile web add dsh-deepseek-web
dsh plugin --profile web peers check
dsh web
```

设置 → DeepSeek Web → Sign in with DeepSeek。确认 Provider `deepseek-web` 出现，模型 `default` / `expert` 可见。

DSH / Cordis / React 由运行时 `$DSH_HOME/profiles/node_modules` 提供，不会在插件目录再装一份。

<details>
<summary>TUI、CLI 与更新</summary>

```bash
dsh plugin --profile dsh-tui add dsh-deepseek-web
dsh-tui
```

```bash
dsh plugin --profile web exec dsh-deepseek-web status
dsh plugin --profile web exec dsh-deepseek-web login
dsh plugin --profile web update dsh-deepseek-web
```

无界面回退（不能替代浏览器登录）：

```bash
dsh plugin --profile web exec dsh-deepseek-web login --token-stdin
```

完整说明见 [INSTALL.md](./INSTALL.md)。

</details>

## 能力

<table>
<tr>
<td>
<img src="docs/assets/showcase-login.gif" alt="设置中用隔离浏览器登录 DeepSeek Web" width="720">
<p><b>隔离浏览器登录。</b> 用独立浏览器登录 <code>chat.deepseek.com</code>，不读取日常 Chrome / Edge 配置。凭证只保存在 DSH 存储中。</p>
</td>
</tr>
<tr>
<td>
<img src="docs/assets/showcase-switch.gif" alt="在输入栏切换 DeepSeek Web 模型与 DeepThink 推理等级" width="720">
<p><b>切换模型。</b> 可在 <code>DeepSeek Web</code> 与 <code>DeepSeek Web Expert</code> 之间切换，并选择 DeepThink 推理等级。底部显示当轮耗时与首 token 延迟。</p>
</td>
</tr>
<tr>
<td>
<img src="docs/assets/showcase-list.gif" alt="侧栏浮层列出 DeepSeek Web 网页会话" width="720">
<p><b>网页会话列表。</b> 侧栏底部打开浮层，列出 DeepSeek 网页端上的会话，可刷新与滚动加载。</p>
</td>
</tr>
<tr>
<td>
<img src="docs/assets/showcase-load.gif" alt="从浮层打开网页会话并在 Harness 中接续" width="720">
<p><b>接续网页会话。</b> 点选一条会话后在 Harness 里打开；replay 有效时续写原来的网页会话。导入时只保留用户原文。</p>
</td>
</tr>
<tr>
<td>
<img src="docs/assets/showcase-fork.gif" alt="把助手消息派生到选定工作区后独立续聊" width="720">
<p><b>派生到工作区。</b> 把 DeepSeek 网页端的会话派生到你选择的工作区。派生后的会话不写回原来的网页会话。</p>
</td>
</tr>
<tr>
<td>
<img src="docs/assets/showcase-clean.gif" alt="使用斜杠命令 /clean 只发送用户原文" width="720">
<p><b><code>/clean</code>。</b> 会话开关。打开后后续每一轮只发送你的原文（不含系统提示、工具、skills），可配合接续聊天接近网页端效果。再执行一次关闭。</p>
</td>
</tr>
</table>

| 能力 | 说明 |
| --- | --- |
| DSH 原生工具 | 将 DeepSeek 网页端接入 Harness；插件把模型输出转成工具请求。FS / Shell / MCP / 审批由 Harness 执行 |
| 网页搜索 | 始终开启官方网页端 Web Search；Expert 不能搜；不是 DSH `web_search` |
| 预构建 WASM | 安装无需 Rust / wasm-pack；token 与 cookie **不进入** WASM |

详见 [docs/remote-sessions.md](./docs/remote-sessions.md)。

## 架构

| 层 | 职责 |
| --- | --- |
| TypeScript 开源层 | HTTP、SSE、浏览器登录、凭证、DSH 适配器、工具桥、回放 |
| 预编译 WASM 核心 | 协议兼容与 PoW |

DeepSeek Web 没有官方 function calling。插件只解析模型输出；适配器**从不**执行 shell、读盘或 MCP。

## 模型

| ID | 说明 |
| --- | --- |
| `deepseek-web/default` | DeepSeek Web |
| `deepseek-web/expert` | DeepSeek Web Expert |

思考为 `on` / `off`。网页原生搜索跟随官方 Web Search 开关。`default` 的每一轮（含续写和 `/clean`）都会打开，插件设置里不能关掉。Expert 在协议上不能搜索。引用来源会出现在时间线上；不会注册 DSH `web_search` 提供方。输入模态目前为**纯文本**。

## 命令

斜杠命令不会把 `/…` 原文发给模型。

- `/deepseek-web [status|login|logout|doctor]` — 账号相关
- `/clean [message]` — 当前会话开关。打开后后续每一轮只发送你的原文（不含系统提示、工具、skills）。再执行一次 `/clean` 关闭。

## 安全

- 不要打印 `.credentials.yaml`、Bearer token、CDP 地址或浏览器配置目录的绝对路径
- 登录只使用插件隔离 profile
- 凭证只写入 DSH 凭证存储

披露流程见 [SECURITY.md](./SECURITY.md)。浏览器登录细节见 [docs/browser-auth.md](./docs/browser-auth.md)。

## 文档

- [安装](./INSTALL.md)
- [贡献](./CONTRIBUTING.md)
- [Releases](https://github.com/y-wi/dsh-deepseek-web/releases)
- [English README](./README.en.md)

## 许可证

TypeScript 集成层为 MIT。预编译核心见 [LICENSE](./LICENSE) 与 [LICENSES/PROTOCOL_CORE.txt](./LICENSES/PROTOCOL_CORE.txt)。第三方声明：[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
