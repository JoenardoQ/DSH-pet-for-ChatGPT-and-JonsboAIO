# 集成入口

这是一个同时支持 DeepSeek Harness 与 ChatGPT / Codex 本地插件的桌宠包。安装方式见 README.md 与 docs/installation.md；第三方来源见 THIRD_PARTY_NOTICES.md。

DSH 与 GPT 共用桥接，角色资源和对话记忆隔离。保留 dsh-pet 包名、用户数据目录、19390 端口与 /dsh-pet-7340 路由以兼容已有配置；这些不是失效的本机路径。旧独立插件应停用，避免重复启动。
