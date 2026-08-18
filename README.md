# dsh-deepseek-web

[English](./README.en.md) · [中文](./README.md)

<p align="center">
  <img src="docs/assets/overview.png" alt="dsh-deepseek-web：将 DeepSeek Web 网页端接入 DeepSeek Harness" width="100%">
</p>

将 **DeepSeek Web** 网页端接入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的非官方 Provider。

本仓库开放的是 Harness 集成层与传输层。Provider 协议兼容由随包分发的**预编译 WebAssembly** 组件提供。

本项目与 DeepSeek **无隶属或背书关系**。

## 能做什么

- **浏览器登录**：在独立浏览器窗口完成 chat.deepseek.com 登录，凭证写入 DSH，不读取你日常浏览器配置
- **DSH 原生工具调用**：把 Harness 的工具契约转成文本协议；真正执行 FS / Shell / MCP / 审批的是 DSH，不是本插件
- **会话回放**：在 DSH 会话里续聊、重建远端上下文
- **预构建 WASM 核心**：安装时不需要 Rust / wasm-pack

用户使用自己的 DeepSeek 账号。插件不会绕过 CAPTCHA、WAF 或账号访问控制。交互式验证在用户的真实浏览器里完成。

## 架构

| 层 | 职责 |
|---|---|
| TypeScript 开源层 | HTTP、SSE、浏览器登录、凭证、DSH 适配器、工具桥、回放 |
| 预编译 WASM 核心 | 协议兼容与 PoW；**token / cookie 不进入 WASM** |

DeepSeek Web 没有官方 function calling。插件只把模型输出解析成 DSH 的 `ToolCallBlock`，由 Harness 调度工具。适配器**从不**执行 shell、读盘或 MCP。

## 安装

需要 DeepSeek Harness **0.1.0-rc.7**（或兼容版本），Node `^22.19.0 || >=24.0.0`。

### Web

```bash
dsh plugin --profile web add dsh-deepseek-web
dsh plugin --profile web peers check
dsh web
```

打开：设置 → DeepSeek Web → Sign in with DeepSeek。登录成功后，确认：

- Provider `deepseek-web` 已出现
- 模型 `default` / `expert` 可见
- 登录状态接口只返回公开状态，不含 token

DSH / Cordis / React 由 DSH 运行时通过 `$DSH_HOME/profiles/node_modules` 提供，不会在插件目录下再装一份。

### TUI

```bash
dsh plugin --profile dsh-tui add dsh-deepseek-web
dsh-tui
```

### CLI

```bash
dsh plugin --profile web exec dsh-deepseek-web status
dsh plugin --profile web exec dsh-deepseek-web login
```

无界面回退（不能替代浏览器登录）：

```bash
dsh plugin --profile web exec dsh-deepseek-web login --token-stdin
```

### 更新

```bash
dsh plugin --profile web update dsh-deepseek-web
```

更细的安装与安全说明见 [INSTALL.md](./INSTALL.md)。

## 模型

- `deepseek-web/default` — DeepSeek Web
- `deepseek-web/expert` — DeepSeek Web Expert

思考为 `on` / `off`。网页原生搜索默认关闭。输入模态目前是**纯文本**（不支持把图片当模型理解输入）。

## 安全

- 不要打印 `.credentials.yaml`、Bearer token、CDP 地址或浏览器配置目录的绝对路径
- 浏览器登录只使用插件自己的隔离 profile，不碰你平时的 Chrome / Edge 用户数据
- 凭证只保存在 DSH 凭证存储里

安全披露见 [SECURITY.md](./SECURITY.md)。

## 文档

- [安装](./INSTALL.md)
- [浏览器登录](./docs/browser-auth.md)
- [贡献](./CONTRIBUTING.md)
- [English README](./README.en.md)

## 许可证

TypeScript 集成层为 MIT。预编译核心见 [LICENSE](./LICENSE) 与
[LICENSES/PROTOCOL_CORE.txt](./LICENSES/PROTOCOL_CORE.txt)。
第三方声明：[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
