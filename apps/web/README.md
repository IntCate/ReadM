# 谱间 · Web 第一阶段

React/TypeScript/Vite；五线谱用 VexFlow 5，简谱为 SVG。核心模型位于 `src/core`，浏览器音频与 IndexedDB 仓储位于 `src/platform`。

```sh
npm ci
npm run dev
```

打开终端打印的本地 URL。无需账号或业务服务器。桌面浏览器优先；应用资源加载后，打谱、试听、保存均在本机执行。完整离线启动缓存尚未实现。

## 功能

- 双手钢琴谱/简谱双向编辑；每手一个节奏声部，声部内支持和弦。
- 休止、附点、临时变音、三连音组、弱起、tie/slur、基础反复与小节速度。
- 覆盖输入、时值修改、音高修改、删除补休止、小节复制粘贴、会话撤销重做。
- 本地合成钢琴试听、变速、节拍器、小节循环、左右手静音、播放位置与光标。
- IndexedDB 自动保存、上一保存快照恢复、多标签页写者保护、项目导入导出。

选中谱面位置后选时值，点击下方琴键输入；简谱用数字 1–7，五线谱用字母 C–B。和弦模式在选中事件叠加音高；右侧属性栏可修改和弦中的单个音符。Shift 选择连续事件；复制按所涉小节及指定手别进行。输入涉及覆盖其他音符时会先确认。

## 验证

```sh
npm test
npm run build
```

本地服务器启动后运行 `npm run test:browser`。需要 Playwright Chromium；如果已有浏览器，用环境变量 `PIANO_CHROMIUM_PATH` 指定可执行文件。`PIANO_TEST_URL` 可指定预览地址。Windows 用户可通过 PowerShell 的 `$env:` 设置这些变量。

性能复测：先构建，再运行 `npm run preview -- --port 5174`，另一个终端将 `PIANO_TEST_URL` 指向该地址、`PIANO_BUILD_MODE` 设为 `production` 后运行 `npm run test:performance`。结果和截图生成到忽略的 `test-results/`。

`examples/` 包含 20 份可导入测试谱；`tests/fixtures/100-measures.pianoscore.json` 用于性能验证。生产静态资源输出至 `dist/`，部署需 HTTPS，项目数据不会随部署迁移到新域名。

## 当前边界

同手复调、多层反复/房子、移调乐器、MusicXML/MIDI 文件交换、PDF 出版输出、MIDI 硬件接入和跟谱不属于本次实现。自然小调使用关系大调记法；钢琴采用无采样下载的合成音色。页面隐藏时暂停声音，撤销记录仅保留当前会话。合成音色是可替换的音频适配实现，不是录音级钢琴采样。

依赖与字体声明见 [开源许可页面](public/credits.html)。当前验证记录在仓库根 `docs/第一阶段实现与验证.md`，真实宿主 Windows 和其他浏览器兼容性、声学同步测量仍需补充。
