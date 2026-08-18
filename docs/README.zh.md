# dsh-deepseek-web

非官方的 DeepSeek Web DeepSeek Harness Provider。

本仓库包含开放的 DeepSeek Harness 集成层与传输层。Provider 协议兼容由随包分发的预编译 WebAssembly 组件提供。

本项目与 DeepSeek 无隶属或背书关系。

用户使用自己的 DeepSeek 账号。插件不会绕过 CAPTCHA / WAF 或账号访问控制。

## 安装

```bash
dsh plugin --profile web add dsh-deepseek-web
dsh plugin --profile web peers check
dsh web
```

然后：设置 → DeepSeek Web → Sign in with DeepSeek。

详见 [INSTALL.md](./INSTALL.md) 与英文 [README.md](./README.md)。
