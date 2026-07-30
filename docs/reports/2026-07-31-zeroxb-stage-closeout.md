# zeroxB 阶段收尾报告

**日期：** 2026-07-31

**代码基线：** `0a4be0e06e6a947059cdaaa84bbf13e5ca47fb65`

**阶段版本：** `c4f00f6362d67f41dce055d8aa7d1b2b7218adbe`

**最终分支：** `main` / `origin/main`

## 结论

本阶段的 Canvas 交互优化已经完成实现、自动化门禁、Windows 打包、覆盖安装、三次冷启动、远端推送与分支收口。功能分支已纯 fast-forward 合入 `main`，本地和远端功能分支均已删除；产品源码在收尾阶段没有再次改动。

本次续作还完成了数据库备份外部归档、npm 缓存迁移、临时构建产物和 Task 9 基线工作树清理。另一个 `F:\huabu-worktrees\foundation` 工作树包含未提交的后续 Task 18/19–21 状态，已按用户资产保留，未做任何清理。

## 交付内容

- 外部粘贴文本统一规范化，保留段落、Tab、连续空格和选区插入语义。
- 左键空白框选、右键拖动创建文本块、双击文本进入编辑。
- 关系支持四向来源与四边目标锚点，方向在激活后锁定。
- 高倍缩放下采用平滑文本块软下限，预览与落地一致。
- 节点具有受限、碰撞安全、单次撤销语义的轻量惯性。
- 图片支持工作区标签目录、名称/评论/标签编辑、悬停元数据和当前画布 OR 筛选及顺序定位。

## Git 结果

- 基线到阶段版本共 15 个提交、29 个文件，`2628 insertions / 109 deletions`。
- `main` 从 `0a4be0e0` 纯 fast-forward 到 `c4f00f63`，无冲突、无历史重写。
- `origin/main` 已包含 `c4f00f63`。
- 本地与远端 `codex/canvas-interaction-physics-image-tags` 已在远端安全落主干后删除。
- 未触碰 `origin/dev`、`origin/feat/*`、`origin/release` 等无关远端分支。

提交列表：

1. `c70d3504` — 交互与图片标签设计规格。
2. `0d56e24c` — 分任务实施计划。
3. `c1c83d83` — 外部文本粘贴规范化。
4. `4aed1da0` — Node 环境 HTML 回退测试注入。
5. `296856b0` — 空剪贴板粘贴保持 no-op。
6. `19ed6ca5` — 左右键职责与文本编辑模式。
7. `0f6d9f32` — 四向关系手势与锚点。
8. `d308dcce` — 缩放感知文本创建尺寸。
9. `54cc09f6` — 碰撞安全节点惯性。
10. `9c845f5c` — 惯性策略覆盖测试。
11. `8b4e7f40` — 工作区图片标签模型。
12. `83b9b2a5` — 图片元数据按需显示与编辑。
13. `1f010630` — 保留未保存图片信息草稿。
14. `6482b7c5` — 图片信息草稿生命周期测试。
15. `c4f00f63` — 图片标签筛选与视口定位。

## 验证与 Windows 交付

- Canvas 全量测试：296/296 通过。
- TypeScript：`tsc --noEmit` 通过。
- Rust：lib 与 bin 两个测试目标均 44/44 通过，`cargo check --locked` 通过。
- NSIS 覆盖安装：退出码 0，安装位置 `F:\zeroxBApp`。
- 安装后主程序：41,059,840 字节。
- 三次冷启动：前两次创建主窗口后正常关闭并退出 0；第三次成功启动并加载画布工作区与图片标签入口。
- 数据库在安装与冷启动后保持存在。

最终安装器：

- 路径：`F:\huabu\src-tauri\target\release\bundle\nsis\zeroxB_0.32.1_x64-setup.exe`
- 大小：15,315,355 字节
- SHA-256：`5BF72297FB02717CA4FE9823362DD57DA4455423DAB583B7E5688562BFAEEE04`

Windows UI 自动化运行时自身缺少内核资源，因此没有自动发送真实鼠标拖拽。惯性手感、四向拉线和图片右键编辑仍建议由用户做一次主观体验；对应策略、合同、持久化和入口已经过自动化及启动验证。

## 数据库归档

归档目录：`F:\zeroxB-backups\2026-07-31-stage-closeout`

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `note.db.stage-closeout-20260731-0212.bak` | 528,384 | `4499F0A321B27B322FB4D8C605736E6357488E60EA4216825A71FE9E7E618603` |
| `note.db.pre-canvas-interaction-20260731-002004.bak` | 528,384 | `45896DFA6D7669969285F7B5D18FE41CC3EBFA775387BA169071529E6F1C0FA4` |
| `note.db.pre-0.32.1-20260730-021101.bak` | 327,680 | `1D9A3EA3EABD07F19BAD87D5A74B91F868BB31A53762BD39163E699672AC5710` |
| `daily-2026-07-30.workspace.db` | 364,544 | `863FA07DD569CDD1174E6E702CFC22DA062A96CA964646D0A9DF6C35CB2A3D7C` |
| `daily-2026-07-29.workspace.db` | 278,528 | `BB686A87E78473FDB4CD084D348B9D9DE1999D005B02866ABDB70556CE7DD161` |
| `weekly-2026-07-27.workspace.db` | 278,528 | `BB686A87E78473FDB4CD084D348B9D9DE1999D005B02866ABDB70556CE7DD161` |
| `migration-20260729T104744Z.workspace.db` | 135,168 | `AA7A3E7B15F534EC7F1181E9621FAFF5FE6A68CC857BA4FD477D463F42FCDECF` |

最新快照使用 SQLite 在线备份 API 生成，可在应用进程驻留时得到一致视图。两个安装前手工 `.bak` 在 F 盘哈希核对后已从 C 盘移走。应用管理的 daily/weekly/migration 快照仅复制到 F 盘，C 盘原件保留，以免破坏当前应用内恢复链。

## 缓存与本地清理

- pnpm store 已位于 `F:\.pnpm-store\v11`，无需变更。
- npm 全局缓存已改为 `F:\.npm-cache`。
- 迁移到 F 盘的 npm 缓存：2,718,890,048 字节（约 2.53 GiB）。
- C 盘旧 npm 缓存只剩日志约 32,479 字节，未来主要内容不再写入该路径。
- 已删除可再生的 `.next`、`out`、`tsconfig.tsbuildinfo`，共约 51.7 MiB。
- 已删除 `F:\Temp\zeroxb-task9-baseline` 临时工作树约 64 MiB；删除前确认其 HEAD `bbf7d941` 是阶段版本祖先，且工作树差异仅为生成的 ADworkflo 上下文。
- 保留 `node_modules`、Rust release/NSIS 产物和最终安装器，以支持后续复查与增量构建。

## 风险、限制与回滚

- 仍需人工体验：节点惯性主观手感、四向关系拖线、图片右键信息编辑。
- `prepare_context.py` 在仓库、PATH、CodexHome、agent 目录及常见 Windows 运行时路径均不可用。本次是纯 Git/备份/缓存/文档收尾，使用手工 L2 操作清单和独立只读安全审计替代；未声称脚本执行成功。
- 数据回滚优先使用 `F:\zeroxB-backups\2026-07-31-stage-closeout` 中的当前快照；版本回滚锚点为 `0a4be0e0`，阶段版本为 `c4f00f63`。
- 安装器保留在仓库 release bundle 路径；已安装程序位于 `F:\zeroxBApp`。

除上述三项主观交互体验外，本阶段没有未完成的自动化、打包、安装、备份、分支或清理事项。
