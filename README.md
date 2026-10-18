# 双谱钢琴工作台

第一阶段 Web 应用已实现：双手五线谱/简谱编辑与播放、本地项目保存和文件交换。应用位于 [apps/web](apps/web/README.md)，当前验证结果与边界见 [实现记录](docs/第一阶段实现与验证.md)。

三个阶段先交付 Web：双手钢琴谱与双手简谱编辑/播放 → MIDI 键盘录入与弹奏 → MIDI 跟谱练习。未来支持移动端和桌面客户端。

从 [项目文档入口](docs/README.md) 阅读范围、规格、架构、验收和开发计划。确认需求、建议基线及候选增强分别登记，不把调研建议当成既定范围。

从仓库根目录检查文档：

```sh
python3 scripts/check_docs.py
```

修改需求登记后生成追踪表并重新检查：

```sh
python3 scripts/check_docs.py --write
python3 scripts/check_docs.py
```

本地运行：

```sh
cd apps/web
npm ci
npm run dev
```
