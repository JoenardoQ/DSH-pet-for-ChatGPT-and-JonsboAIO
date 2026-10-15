# DSH Pet for ChatGPT and JONSBO AIO

Based on [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（0.3.6，MIT）。原版大肥鱼的素材、动画、桌面交互和 DeepSeek Harness 插件直接复用，保留原作者版权。

双击 **install-plugins.cmd** 可把本地 ZIP、GitHub 或 Release 链接添加到 **DSH / GPT·Codex 本地插件列表**。窗口显示安装状态和错误，不依赖 agent；详见[安装方式](docs/installation.md)。默认 USB 画面顺时针旋转 **90°**，显式保存的角度设置优先。右键切换鲸鱼娘、大肥鱼、ChatGPT 娘时，名称、台词、工作状态和对话配图跟随角色。

DSH 下载仓库出现 `UND_ERR_SOCKET` 时，可直接在插件添加框使用 [Release TGZ](https://github.com/JoenardoQ/DSH-pet-for-ChatGPT-and-JonsboAIO/releases/latest/download/dsh-pet-windows-x64-lite.tgz)，或用本地 ZIP／目录安装；无需再次下载仓库。见[网络失败处理](docs/installation.md#dsh-下载报-und_err_socket--pnpm-terminated)。

## Windows 一键启动

下载并解压本仓库 ZIP 后，双击 **start-pet.cmd**。启动窗口自动完成组件下载、校验和解压，显示进度并提供重试；无需预装 Node/Python/npm，也无需让 agent 处理安装。关闭窗口会保留已启动桌宠；双击 **stop-pet.cmd** 完全退出。首次联网准备完成后复用缓存。

默认发布采用轻量 ZIP，运行组件不塞进源码包。插件启用也使用相同准备流程。详见[下载到启动说明](docs/windows-startup.md)。

## 改动和优化

`0.3.6-jonsbo.8`：启动时自动退出不兼容的旧桥接服务，避免旧接口返回 Not found；并发启动合并为一个桥接实例。右键状态页按 DSH / ChatGPT 来源隔离，DSH 投屏操作不会唤起 ChatGPT 桌宠。若以前安装过其他鲸鱼娘插件，请在宿主中停用旧插件，避免两个不同插件同时显示。

- 增加 ChatGPT / Codex 本地 MCP 入口，可唤起、收起和更新桌宠状态。
- 保留 DeepSeek Harness 的会话联动，同一份桌宠支持两个宿主。
- 将实际播放的动画同步到乔思伯 480×480 USB 屏幕，自动检测已支持的 `345F:9132` 设备和本机官方 SDK。
- 唤起后尝试接管屏幕；官方程序拒绝正常退出时提示用户接管，停止输出后恢复由本插件关闭的程序。
- 增加双宿主输出协调、掉线重连、画面方向设置和连接状态提示，修复工作动画回待机的问题。

右键桌宠可选择「连接乔思伯屏幕」「断开乔思伯屏幕」「屏幕连接状态」。ChatGPT 唤起的桌宠还提供「关闭桌宠」。在聊天中可以说“打开桌宠”“收起桌宠”或“完全关闭桌宠”，分别调用 `wake_pet`、`hide_pet`、`shutdown_pet`。

## 下载和安装

需要 Windows x64。程序会按固定版本与哈希自动准备 Electron、USB 辅助程序及运行依赖，无需另外安装 Node、npm、Python 或 Pillow。首次启用显示准备窗口；后续复用缓存。USB 屏幕仍需要对应的乔思伯官方软件/驱动，本仓库不分发厂商 DLL。其他型号暂未验证。

### Codex / 支持本地插件的 ChatGPT 桌面端

通过 GitHub 添加插件源，然后安装：

```powershell
codex plugin marketplace add https://github.com/JoenardoQ/DSH-pet-for-ChatGPT-and-JonsboAIO.git
codex plugin add dsh-pet-jonsbo@dsh-pet-jonsbo
```

也可添加源后在插件目录选择 **DSH Pet · ChatGPT & JONSBO** 安装并启用。宿主加载插件 MCP 时自动显示，无需发“打开桌宠”。支持本地插件开关的 Codex 客户端中，桌宠会跨对话保持显示，停用或卸载插件时关闭。若客户端延迟加载 MCP，需新开一次对话触发加载；插件本身无法提前于宿主运行。网页版或仅支持远程 MCP 的客户端不适用。

已安装旧版：刷新插件源并重新安装，然后重新开启插件以加载新版。

### DeepSeek Harness

在「插件」的安装入口填入：

```text
git+https://github.com/JoenardoQ/DSH-pet-for-ChatGPT-and-JonsboAIO.git
```

安装并启用后自动显示桌宠，停用后关闭；若 DSH 提示需重启，按提示重启。默认开启桌面与网页显示，桌面动画会同步到屏幕。仓库包含由源码生成的 JavaScript 运行文件，Git 安装无需临时编译 TypeScript。

### 自己 clone 测试

```powershell
git clone https://github.com/JoenardoQ/DSH-pet-for-ChatGPT-and-JonsboAIO.git
cd DSH-pet-for-ChatGPT-and-JonsboAIO
.\start-pet.cmd
.\stop-pet.cmd
```

开发时修改 TypeScript 后运行 `npm run build`（开发构建需要 Node/npm）。Windows 运行组件的打包脚本为 `scripts/bundle-windows-runtime.py`，各组件许可证随包保留。查看连接状态：<http://127.0.0.1:19390/>。若显示屏被占用，可在此页面选择接管。默认投屏数据目录为 `%LOCALAPPDATA%/DshPetJonsbo/jonsbo`；旋转等选项参考 `dsh-pet/config.jonsbo.example.json`。

## 右键切换桌宠

保留鲸鱼娘、大肥鱼和新 ChatGPT 娘。右键当前桌宠即可选择，切换后自动保存；状态联动和 JONSBO 投屏继续工作，无需 agent 参与。新角色包含透明图片动画、GIF 预览和 WebM 视频，素材与说明见[三角色资产说明](docs/characters.md)。
