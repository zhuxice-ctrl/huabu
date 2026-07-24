# zeroxB 首屏黑屏与画布点阵恢复计划

## Context

zeroxB 的 Windows 首次安装存在数据库初始化竞争：父布局与画布首屏同时启动，画布可能在 `canvases` 表建立前查询并抛错，启动控制器又无法进入 ready 状态，最终只显示黑色背景。画布点阵只有在 React Flow 挂载后才能显示，且深色主题需要更高对比度。

## Global Constraints

- 首次加载画布前必须等待全部数据库初始化完成；并发调用必须复用同一个初始化 Promise。
- 初始化失败后必须允许下一次调用重试，不能永久缓存 rejected Promise。
- 启动流程发生异常时也必须结束纯黑加载态，但不得伪造画布数据。
- 深色画布使用有效 CSS 颜色 `hsl(var(--muted-foreground))`，点阵 `gap={22}`、`size={1.35}`，并保留 React Flow 原生随平移和缩放行为。
- 不得输出、提交或记录用户提供的 API 密钥。
- 只修改与本任务直接相关的源码、测试及 ADworkflo/验证记录；不得发布或推送远程分支。

## Task 1: 修复数据库启动竞争并恢复画布点阵

**Files:**

- Modify: `src/db/index.ts`
- Modify: `src/app/core/main/canvas/canvas-startup-controller.tsx`
- Modify: `src/app/core/main/canvas/canvas-editor.tsx`
- Add or modify focused tests under `scripts/tests/` when practical
- Update task-scoped ADworkflo worker and verification artifacts only as needed

**Requirements:**

1. 保留当前未提交修复的正确部分，并审查是否有遗漏或回归。
2. 为数据库初始化增加单例 Promise：并发调用共享一次执行，失败时清空缓存并向调用者继续抛错。
3. 画布启动控制器必须先等待数据库初始化，再加载标签页和画布项目；用 `try/catch/finally` 保证异常不会永久卡在黑色加载背景。
4. React Flow 点阵参数必须为 `color="hsl(var(--muted-foreground))"`、`gap={22}`、`size={1.35}`，并与 Global Constraints 完全一致。
5. 增加能够长期防止本次竞争与加载态回归的聚焦测试；若运行时单元测试受 Tauri/Next 模块边界限制，可使用现有项目风格的源码契约测试，但断言必须覆盖调用顺序、Promise 复用/重试语义、finally ready 以及点阵参数。
6. 至少运行 `pnpm test:canvas` 与 `pnpm verify:foundation`，输出必须通过；完成自审后提交一次或多次清晰提交。

**Completion:**

- 写入 SDD 实现报告，列出改动、命令、结果、文件和自审结论。
- 不执行安装、卸载或旧数据删除；这些由主控制器在代码复核通过后完成。
