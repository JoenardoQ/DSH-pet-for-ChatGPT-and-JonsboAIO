# Windows 下载到启动工作流

适用于 大肥鱼，与另一个桌宠仓库独立发布、独立配置。

## 用户操作

1. 从本仓库下载源码 ZIP，或下载 Windows lite ZIP，解压到可写文件夹。
2. 双击 start-pet.cmd。无需预装 Node、Python、npm，无需向 agent 发送启动命令。
3. 原生窗口显示检查、下载、校验、解压、启动阶段；中断可取消，失败可直接点重试。下载失败会自动重试一次；GitHub raw 域名不可达时自动切换官方 API 通道，仍校验同一 SHA-256。
4. 桌面出现后，可从“连接设置”处理屏幕接管、驱动和旋转；Windows 管理员确认仍由用户在本机完成。关闭启动窗口不关闭已启动桌宠；双击 stop-pet.cmd 完全停止。

插件用户也可在宿主内安装并启用；本地 MCP 使用相同准备入口，DSH 在缺少桌面组件时显示准备窗口。宿主尚未加载本地服务时程序无法提前运行。

## GitHub clone 后运行

使用 `git clone --depth 1 https://github.com/JoenardoQ/DSH-pet-for-ChatGPT-and-JonsboAIO.git`，进入下载目录，双击 start-pet.cmd。无需 npm install、构建或 agent 操作；首次启动需要联网下载并校验组件。普通 clone 同样可用，但会额外下载历史版本中保存的旧二进制。

源码 ZIP 从本仓库 main 下载即可。CI 验证通过后在 Actions 的 windows-x64-lite artifact 中提供轻量包；推送 v* tag 时自动附到对应 Release。

## 运行约束

- 程序使用按版本隔离的用户缓存；组件由固定 HTTPS 地址和 SHA-256 清单锁定。
- 大肥鱼的 Electron 分片以流方式合并；在临时目录中解压、验证后才发布到正式目录，半安装不会作为新安装完成状态使用。Electron 自带 Node 被复用，不再额外分发独立 Node。
- 不修改系统 PATH，不创建系统服务或开机自启。依赖、工作进程和下载都有等待上限。
- 本机配置、密钥、日志、开发用 node_modules 和运行缓存不进入 lite 发布包。
- 正常使用不需要 agent 执行命令、读日志或修复安装；agent 的工具只用于可选状态联动。

## 自动验收与发布

Windows CI 运行没有 Node/Python PATH 的准备和 MCP 握手测试、现有回归测试，再从 lite ZIP 解压到干净目录、全新下载运行组件并验证实际桌面帧，最后生成带 SHA-256 和文件清单的 lite ZIP。发版 tag 或手动触发打包，无需 agent 拼包。完整历史中的旧二进制不会被重写；安装推荐下载 ZIP 或 shallow clone，首次再按需准备运行组件。

开发者执行 node scripts/build-windows-lite.mjs，产物位于 dist/。用户不需要安装开发工具。
