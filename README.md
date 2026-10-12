# DSH Pet for ChatGPT and JONSBO AIO

Based on [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（0.3.6，MIT）。原版大肥鱼的素材、动画、桌面交互和 DeepSeek Harness 插件直接复用，保留原作者版权。

## 改动和优化

- 增加 ChatGPT / Codex 本地 MCP 入口，可唤起、收起和更新桌宠状态。
- 保留 DeepSeek Harness 的会话联动，同一份桌宠支持两个宿主。
- 将实际播放的动画同步到乔思伯 480×480 USB 屏幕，自动检测已支持的 `345F:9132` 设备和本机官方 SDK。
- 唤起后尝试接管屏幕；官方程序拒绝正常退出时提示用户接管，停止输出后恢复由本插件关闭的程序。
- 增加双宿主输出协调、掉线重连、画面方向设置和连接状态提示，修复工作动画回待机的问题。

## 下载和安装

需要 Windows x64、Git、Node.js 22.12+（含 npm）、Python 3.10+。USB 屏幕需要先安装对应的乔思伯官方软件/驱动；本仓库不分发厂商 DLL。其他型号暂未验证。

先安装 USB 图像依赖：

```powershell
python -m pip install "Pillow>=10.1,<13"
```

### Codex / 支持本地插件的 ChatGPT 桌面端

通过 GitHub 添加插件源，然后安装：

```powershell
codex plugin marketplace add https://github.com/JoenardoQ/DSH-pet-for-ChatGPT-and-JonsboAIO.git
codex plugin add dsh-pet-jonsbo@dsh-pet-jonsbo
```

也可添加源后在插件目录选择 **DSH Pet · ChatGPT & JONSBO** 安装。新开一个对话，说“唤起大肥鱼并显示到乔思伯屏幕”。首次唤起会安装缺失的 Node 运行依赖并下载 Electron，需要联网，耗时较长时可稍后重试。此方式依赖本地 stdio MCP 支持，网页版或仅支持远程 MCP 的客户端不能直接控制本机 USB。

### DeepSeek Harness

在「插件」的安装入口填入：

```text
git+https://github.com/JoenardoQ/DSH-pet-for-ChatGPT-and-JonsboAIO.git
```

安装完成后重启 DSH，在大肥鱼设置中启用「桌面」或「两者」显示；桌面动画会同步到屏幕。仓库包含由源码生成的 JavaScript 运行文件，Git 安装无需临时编译 TypeScript。

### 自己 clone 测试

```powershell
git clone https://github.com/JoenardoQ/DSH-pet-for-ChatGPT-and-JonsboAIO.git
cd DSH-pet-for-ChatGPT-and-JonsboAIO
npm install --omit=peer --ignore-scripts
python -m pip install -r dsh-pet/desktop/requirements.txt
npm run pet -- wake
npm run pet -- stop
```

修改 TypeScript 后运行 `npm run build`。查看连接状态：<http://127.0.0.1:19390/>。若显示屏被占用，可在此页面选择接管。默认数据目录为 `%LOCALAPPDATA%/DshPetJonsbo`；旋转等选项参考 `dsh-pet/config.jonsbo.example.json`。
