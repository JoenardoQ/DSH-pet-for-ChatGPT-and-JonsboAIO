# 三种桌宠与动画资产

右键桌宠选择鲸鱼娘、大肥鱼或 ChatGPT 娘；大肥鱼界面位于「切换桌宠」子菜单。选择保存在当前用户、当前桌宠实例中，重启继续使用。角色切换复用现有进程、状态联动和投屏，不启动 agent 或调用模型。两个独立桌宠进程共用 JONSBO 时仍保持当前投屏，另一方等待；通过菜单/设置的投屏开关手动交接。

ChatGPT 娘根据用户提供的两张 JPG，使用内置 imagegen 重新绘制相似角色；不是原画作者未提供的原版视频。保留银白长发、龙角、紫色翅膀与尾巴、白紫长裙。八种状态：待机、眨眼、思考、工作、成功、出错、睡眠、招手。动画为 8 fps、4 秒循环，包含轻微呼吸浮动与待机眨眼；并非完整骨骼动画。

资产来源与生成提示保存在 `assets/pets/chatgpt/PROMPT.txt`，原始图集为 `atlas.png`，参考图为 `reference-1.jpg` 和 `reference-2.jpg`，GIF 预览为 `preview.gif`。鲸鱼娘沿用原上游素材，大肥鱼沿用原始透明视频，两者没有被替换为新绘画。

鲸鱼娘项目：`assets/generated/` 为原始鲸鱼娘；`assets/pets/fish/*.webp` 为原视频转换的显示动画；`assets/pets/chatgpt/*.webp` 为新角色显示动画，`*.webm` 为视频导出。

大肥鱼项目：`dsh-pet/assets/webm/` 为原始大肥鱼视频；`__skin-whale-*.webm` 和 `__skin-chatgpt-*.webm` 是两个新增角色的透明 VP9 动画；`dsh-pet/assets/pets/chatgpt/` 保存新角色图集、参考图、GIF 和生成说明。两仓库各自完整分发，互不依赖另一项目的本机路径。
