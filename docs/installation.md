# 安装到插件列表

两个项目都提供相同的 `install-plugins.cmd`。双击打开窗口，选择本地 ZIP、解压目录，或粘贴本项目的 GitHub 仓库 / Release 页面 / Release ZIP 链接，再选择宿主。无需 agent，不会在安装窗口中唤起桌宠。

- **DSH**：首次选择 `DeepSeek Harness.exe`。脚本调用宿主自身的 `plugin --profile desktop add`，由宿主登记到插件列表并管理 bundle。默认只显示一只桌面宠物；需要内嵌显示时在宠物设置中选择，`both` 仅用于明确希望双位置显示的用户。
- **GPT / Codex 本地插件列表**：脚本调用官方 `codex plugin marketplace add` 注册来源；在宿主插件列表中安装并启用。需已安装带 `codex.exe` CLI 的本地宿主，缺少 CLI 时给出明确说明，不下载安装另一个宿主。不直接改宿主配置或插件缓存。
- **ZIP / Release**：脚本检查路径与包清单后解压到 `%LOCALAPPDATA%/DesktopPetPackages/`，Release ZIP 同时核验 SHA256。不要移动此目录，否则本地来源无法刷新。普通 ZIP 支持根目录直接包含清单或仅一层包目录。
- **GitHub**：仓库链接先解析到当前提交再下载源码 ZIP，无需 Git；该提交已含编译产物。只接受本项目仓库，防止把两个项目装混。已有下载目录直接使用，不重复下载。

本项目：[大肥鱼仓库](https://github.com/JoenardoQ/DSH-pet-for-ChatGPT-and-JonsboAIO) · [Release](https://github.com/JoenardoQ/DSH-pet-for-ChatGPT-and-JonsboAIO/releases/latest)。

DSH 插件界面可直接添加仓库链接，但这会让宿主 pnpm 从 codeload.github.com 下载源码。网络不稳定时优先使用下方 Release TGZ；已解压 ZIP 也可使用其完整目录路径。DSH 的链接输入不直接接受 ZIP / Release 网页，因此由此安装窗口完成转换。Codex 可直接通过 `codex plugin marketplace add https://github.com/JoenardoQ/DSH-pet-for-ChatGPT-and-JonsboAIO.git` 添加 Git 源。

GPT 此处指支持本地执行的 ChatGPT 桌面 Work / Codex。普通网页版无法运行 stdio MCP 或本机 USB。此安装器注册本地源，不等于上架 OpenAI 公共插件目录；桌面插件公开提交另有审核和资格要求。参考 [OpenAI 本地插件文档](https://developers.openai.com/plugins/build/plugins) 和[桌面插件发布说明](https://developers.openai.com/plugins/deploy/desktop-only)。

开发验证（仅生成计划，不下载、不修改宿主、不启动桌宠）：

```powershell
powershell -NoProfile -File scripts/install-plugins.ps1 -Target DSH -Source . -Plan
powershell -NoProfile -File scripts/install-plugins.ps1 -Target Codex -Source "https://github.com/JoenardoQ/DSH-pet-for-ChatGPT-and-JonsboAIO/releases/latest" -Plan
```

## DSH 下载报 UND_ERR_SOCKET / pnpm terminated

这表示下载连接被中断，不是供应链策略拒绝，也不表示插件已加载后崩溃。DSH 原生仓库安装发生在插件代码加载之前，桌宠无法接管宿主 pnpm 的网络重试。

优先在 **DSH 插件列表 → 添加** 中粘贴这个 Release tarball 链接：

```
https://github.com/JoenardoQ/DSH-pet-for-ChatGPT-and-JonsboAIO/releases/latest/download/dsh-pet-windows-x64-lite.tgz
```

`.tgz` 使用 npm 的 `package/` 布局，与轻量 ZIP 含相同运行文件，并附 SHA256 和文件清单。此地址经过 GitHub Release 资产分发，不访问 codeload；并不保证所有 GitHub 域名在每个网络都可达。也可选择自己已下载的 `.tgz` 文件完整路径。

若已有源码目录或 ZIP，双击 `install-plugins.cmd` 并选择本地目录 / ZIP，添加到 DSH。该方式不重新下载仓库。安装器联网下载有三次尝试上限、45 秒无进度超时，失败不留下半成品，也不覆盖已有完整文件；Release ZIP 直接使用资产地址，不再依赖 GitHub API。

CI 验证发行包内容与干净启动，不能保证用户当前网络能够下载 GitHub 源码。
