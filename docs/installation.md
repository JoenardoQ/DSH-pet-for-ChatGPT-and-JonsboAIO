# 安装到插件列表

哼，双击根目录 `install-plugins.cmd`，按窗口选择就好，不用派 agent 干活。

支持本地 ZIP、已解压的项目目录、本仓库 GitHub 链接、Release 页面与 Release ZIP 直链。安装器检查包清单、防止 ZIP 路径越界，并校验 Release ZIP 的 SHA256。已有本地文件时直接读取。

选择 DSH 时，首次定位 `DeepSeek Harness.exe`，由宿主自己的 `plugin --profile desktop add file:目录` 安装本地包及其依赖。选择 GPT / Codex 时，通过官方 `codex plugin marketplace add` 注册只包含分发文件的本地来源，再用 `codex plugin add` 实际安装；之后在宿主插件列表启用。缺少对应宿主时会提示，不替你另装宿主，也不直接修改宿主插件缓存。

仓库：[Deepseek-and-ChatGPT-Pet-and-JonsboAIO](https://github.com/JoenardoQ/Deepseek-and-ChatGPT-Pet-and-JonsboAIO)；[最新 Release](https://github.com/JoenardoQ/Deepseek-and-ChatGPT-Pet-and-JonsboAIO/releases/latest)。

## DSH 仓库下载中断

`UND_ERR_SOCKET` / `pnpm terminated` 发生在宿主下载源码阶段，插件尚未加载。供应链校验通过不代表下载连接一定成功。

在 DSH 添加插件时可以使用这个资产链接，绕过 codeload 源码下载：

```
https://github.com/JoenardoQ/Deepseek-and-ChatGPT-Pet-and-JonsboAIO/releases/latest/download/pet-trio-windows-x64-lite.tgz
```

也可选本地 `.tgz` 路径；本地 ZIP 或 Release 页面由安装窗口转换为可安装目录。TGZ 使用 npm 的 `package/` 布局，与轻量 ZIP 包含同一套运行文件。

网络下载最多三次尝试，45 秒无进度会中断重试，半成品不会覆盖完整文件。GitHub 网络可达性仍由本机网络决定。

升级合并版前，先在宿主中停用旧的鲸鱼娘 / 大肥鱼独立插件。合并版不会替你删除宿主配置或旧聊天记忆。默认显示位置为桌面；明确选择“两者”才会同时显示网页与桌面。

GPT 在此指支持本地执行器和插件的 ChatGPT Work / Codex。普通网页版不能运行本机 stdio MCP 或 USB；注册来源不等于上架公共目录。
