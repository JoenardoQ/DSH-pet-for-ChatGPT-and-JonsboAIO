# 三位女仆桌宠 · DeepSeek / ChatGPT / JONSBO

哼，鲸鱼娘、大肥鱼和 ChatGPT 娘都替你收进一个家里了。选谁陪你工作，右键就能换；才没有要你指挥 agent 折腾安装呢。

| 桌宠 | 长什么样 | 动作与配图 |
| --- | --- | --- |
| 大肥鱼 | 圆脸、圆润 Q 版蓝发女仆。昵称叫“大肥鱼”，她是人形女仆哦 | 保留原版 106 段透明动作和 27 张配图 |
| 鲸鱼娘 | 海洋风蓝发女仆、鲸尾与白围裙 | 独立动作、27 张配图和原项目插图 |
| ChatGPT 娘 | 银白长发、象牙龙角、淡紫翼尾、白紫玫瑰裙 | 8 种多帧 GIF、27 张配图；嘴硬心软的专属台词 |

## 下载后怎么用

1. 从 [最新 Release](https://github.com/JoenardoQ/Deepseek-and-ChatGPT-Pet-and-JonsboAIO/releases/latest) 下载 `pet-trio-windows-x64-lite.zip`，解压到固定目录。已有源码目录也能直接用，编译产物已随仓库保存。
2. 双击 **install-plugins.cmd**，选 DSH 或 GPT / Codex，再选本地 ZIP、解压目录，或粘贴本仓库的 GitHub / Release 链接。
3. 在对应宿主的插件列表中安装、启用。DSH 默认是大肥鱼，GPT 独立桌宠首次启动默认是 ChatGPT 娘；**右键 → 切换桌宠**可以随时改，偏好会保存。

普通用户不用装 Node、Python、Git，也不用让 agent 执行安装命令。Windows 首次启动会通过可视化窗口准备并校验运行组件；轻量包不塞入整套 Electron。已经准备好的组件会复用。安装到插件列表与开启桌宠是两步，别把安装窗口当召唤按钮啦。

只想独立看看？双击 **start-pet.cmd**。结束时双击 **stop-pet.cmd**，或在 GPT 桌宠右键选择关闭。DSH 桌宠由 DSH 插件开关管理。

DSH 默认只在桌面显示一只。希望显示在 DSH 内部时，到宠物设置改为“网页”；“两者”会在网页和桌面各显示一只，这是明确选择后的效果。

DSH 如果报 `UND_ERR_SOCKET` / `pnpm terminated`，可以在添加插件时使用 [Release TGZ](https://github.com/JoenardoQ/Deepseek-and-ChatGPT-Pet-and-JonsboAIO/releases/latest/download/pet-trio-windows-x64-lite.tgz)，或让安装窗口读取你已经下载的本地 ZIP。具体见 [安装说明](docs/installation.md)。

## 两个宿主一起陪你

同时开启 **DSH 的大肥鱼**与 **GPT / Codex 的 ChatGPT 娘**桌宠后，会出现双人互动。右键 **双人互动**可选自动轮换、固定动作或关闭：拳击、排球、赛跑、逛街、看日落、浇花、格斗游戏比赛、咖啡厅看书。八组都是真正参与播放的多帧 GIF。

双人场景由 GPT 桌宠窗口呈现，DSH 的单人窗口暂时隐藏；任一方退出、隐藏或切成其他角色，就恢复单人显示。仅安装插件、仅连接两个 GPT agent，都不会凭空多出一个搭档。

同一 GPT / Codex 插件可以连接多个 agent。每个连接独立报状态和保持在线，工作中的连接优先；关闭一个连接不会关掉另一个正在用的桌宠。

| GPT 工作动作 | 双人动作示例 |
| --- | --- |
| ![认真工作](dsh-pet/assets/pets/chatgpt/gif/working.gif) | ![一起拳击](dsh-pet/assets/pets/duo/gif/boxing.gif) |

## 乔思伯小屏幕

右键 **连接乔思伯屏幕**，在 **屏幕连接状态**页面查看预览与连接结果。默认画面整体**顺时针旋转 90°**，角色、文字、对话配图随同一帧一起旋转；已有明确保存的旋转设置会保留。

同一块屏幕保持当前桌宠投屏，后来的桌宠等待。想换人，到状态页点击 **切换到 DSH 桌宠 / 切换到 GPT 桌宠**。双人 GIF 由 GPT 窗口输出，想在屏幕上看双人场景时手动切换到 GPT 即可。

屏幕需要兼容的 JONSBO USB 设备与官方 SDK。被官方程序占用时，状态页会提示；是否接管由你点击决定。桌宠只导出自己的画面，不截取整个桌面。

## 素材、隐私与升级

三位桌宠共用一套引擎和安装入口，角色动画、对话配图和记忆分别归属。字体、窗口控制、物理效果、下载器和 USB 桥接共用。动画与台词不需要模型生成；主动对话或开启 AI 碎碎念时，才使用宿主已配置的模型。

ChatGPT 娘按用户提供的两张参考图重新制作，并非原作者完整动画包的逐像素复刻。新 GIF 的源图、提示词和导出记录见 [art-source](art-source)；运行包只带实际播放资源。固定工作台词逐句保留原字数，用户输入与 agent 任务文本不会改成傲娇台词。

升级前先停用旧的两个独立桌宠插件，再启用这个合并版，免得旧插件还在各自启动窗口。安装器不会擅自删除旧插件、宿主配置或聊天记忆。

需要开发与验证时，请看 [源码结构与检查记录](docs/source-audit.md)。测试可以在无桌宠窗口、不下载运行组件的模式下执行。

## 致敬与版权

这份陪伴建立在社区的劳动上，致谢可不会省略：

- [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)：蓝发女仆动作、桌宠引擎、桌面物理与 DSH 集成。
- [Sutera-Diffusus/dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume)：鲸鱼娘形象、插图与原项目设计。
- [codehz/msdisplay](https://github.com/codehz/msdisplay)：屏幕协议相关参考；设备 SDK 归其原作者所有。
- JoenardoQ / Qiao, Yanning：ChatGPT、Codex、乔思伯适配及合并维护。ChatGPT / OpenAI Codex 辅助代码、文案与动画素材制作。

保留原作者与适配作者的版权声明，代码按 [MIT License](LICENSE) 提供。ChatGPT / Codex 的协作署名不构成独立版权主体，也不代表 OpenAI 官方发行；参考图及第三方素材的权利仍归其权利人。详见 [第三方致谢](THIRD_PARTY_NOTICES.md)。

哼，说明都写清楚了。挑位女仆陪你认真干活吧。


### 1.0.1 · 屏幕与动作修复

右键打开「屏幕连接状态」，在统一的放映室里选择上屏角色、连接或断开、切换双人互动。未同步的角色会标明原因，页面不会额外唤起一只 GPT 桌宠。

如果官方 JONSBO-AIO 以管理员身份运行，点击「以管理员权限接管屏幕」，再允许 Windows 权限请求。取消后不会反复弹窗；下一次点击才会重试。桌宠释放屏幕后恢复本次实际退出的官方程序。哼，权限弹窗还是要你自己点啦。

GPT 娘与双人 GIF 改为每帧 300 毫秒，通常一轮 4.8 秒。台词更新不再打断相同动作；桌面气泡按内容扩大留白，屏幕完整换行绘出台词并等比例显示插图。修复对话插图导致画布无法导出、影响 DSH 在线同步的问题。

已安装用户请在两个宿主中更新至同一修复版并重新启用插件；源码变化不会自动替换宿主的旧插件缓存。新版启动会自动退出本项目的 1.0.0 桥接进程，再连接修复版。
