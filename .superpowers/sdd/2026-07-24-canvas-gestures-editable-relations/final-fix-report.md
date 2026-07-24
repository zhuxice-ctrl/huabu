# Canvas Gestures / Editable Relations Final Fix Report

日期：2026-07-25
分支：`foundation/notegen-636d4f8`

## 结论

已完成 `final-review.md` 的 Important 1–7 与 Minor 1 修复，并新增可执行关系交互策略测试。Important 8 所需的最终 ADworkflo impact/verification 工件、Windows 构建安装与应用内验证不在本 fix wave 中伪造或代做，交由主代理在构建安装后完成。

## 逐项修复

1. **新关系仅产生一次历史快照，保存前不持久化**
   - 右键长按拖拽成功后创建 `PendingRelationEdge`，只保存在关系编辑器状态中，不进入受控 `edges`，因此不会触发自动持久化。
   - 保存时通过 `commitRelationEditorTransaction` 一次提交，并且只调用一次 `pushHistory`；取消仅丢弃草稿，不更改 edge 或 history。
   - 可执行测试覆盖“打开编辑器不插入 edge”“保存一次提交”“取消前持久状态保持不变”。

2. **window / lost capture / blur 清理**
   - 关系会话在 pointer-down 立即尝试 capture，并由 wrapper 的 `pointercancel`、`lostpointercapture`、window `pointerup`/`pointercancel` fallback 与 window `blur` 统一清理 timer、preview、target highlight 和 session ref。
   - waypoint 拖拽使用 pointer capture；清理覆盖 window pointer-up/cancel、window blur、lost pointer capture 与组件卸载，所有监听器幂等移除。

3. **框选完成后抑制后续 contextmenu**
   - 使用带 750ms 有效期的一次性 context-menu suppression token；marquee pointer-up 后仍保持 token，后续原生 `contextmenu` 消费并清除。
   - 不再在 pointer-up 立即清除 suppression。

4. **障碍移动/缩放后自动路由重算**
   - `CanvasRelationEdge` 使用 `useNodes()` 订阅节点变化，不再通过非响应式 `getNodes()` 读取障碍。
   - 障碍位置或测量尺寸变化会重渲染 edge 并重新执行 `buildRelationPath`。

5. **24px 扩展障碍参与碰撞检测**
   - `auto` 路由先对每个障碍四周扩展 24px，再以扩展矩形执行线段碰撞检测和绕行点计算。
   - 新增“路径未穿过原矩形但进入 24px clearance”测试。

6. **预览端点与持久化 handle 一致**
   - 为默认 top/bottom handle 增加稳定 ID（`top` / `bottom`），与既有 `left` / `right` 组成可持久化 handle 集。
   - 预览通过 `selectRelationHandles` 从合法 source/target handle 组合中选择最短配对，预览路径直接落在对应 handle 点。
   - 草稿和序列化结果保存 `sourceHandle` / `targetHandle`；目标节点同时高亮精确 target handle。

7. **previewSnapshot 只读守卫**
   - 自定义右键关系手势调用 `canStartRelationGesture`；存在 agent preview snapshot 时明确返回 false，不创建关系会话。
   - 可执行策略测试覆盖允许态、preview 阻止态和非右键态。

8. **Minor 1：waypoint 可选中并通过 Delete / Backspace 删除**
   - waypoint pointer-down 进入选中态并使用更强 ring 显示；增加 `aria-pressed`。
   - 选中 waypoint 时，Delete/Backspace 在 capture 阶段删除该 waypoint、生成一次历史 checkpoint，并阻止画布级删除选中 edge。
   - 右键删除副作用已移除；拖拽只在首次实际移动时创建 history checkpoint，单纯选中不会产生空历史记录。

9. **临时工件清理**
   - 删除错误跟踪的 `task-1-impact-report.json` 与 `task-1-report.md`。

## 测试与结果

- `node --experimental-strip-types --test scripts/tests/canvas-relation-interaction.test.mjs scripts/tests/canvas-relation-routing.test.mjs scripts/tests/canvas-editor-contract.test.mjs`
  - PASS：16 tests，16 passed，0 failed。
- `corepack pnpm test:canvas`
  - PASS：36 tests，36 passed，0 failed。
- `corepack pnpm exec tsc --noEmit`
  - PASS：无 TypeScript diagnostics。
- `git diff --check`
  - PASS：无 whitespace errors；Git 仅报告工作区既有的 LF→CRLF checkout 提示，未做仓库级换行归一化。

## 代码与测试文件

- `src/app/core/main/canvas/canvas-editor.tsx`
- `src/app/core/main/canvas/canvas-edge.tsx`
- `src/app/core/main/canvas/nodes/canvas-nodes.tsx`
- `src/lib/canvas/relation-interaction.ts`（新增）
- `src/lib/canvas/relation-routing.ts`
- `src/types/canvas.ts`
- `scripts/tests/canvas-relation-interaction.test.mjs`（新增）
- `scripts/tests/canvas-relation-routing.test.mjs`
- `scripts/tests/canvas-editor-contract.test.mjs`
- `.superpowers/sdd/2026-07-24-canvas-gestures-editable-relations/task-1-impact-report.json`（删除）
- `.superpowers/sdd/2026-07-24-canvas-gestures-editable-relations/task-1-report.md`（删除）

## Self-review

- 历史边界：草稿不进入 `edges`，autosave 观察不到；保存前 snapshot 不含草稿，第一次 undo 可直接移除最终关系。
- 取消边界：create cancel 不调用 `setEdges` 或 `pushHistory`。
- 事件顺序：marquee/relation pointer-up 先结束 session，再释放 capture；lost-capture 回调看到 session 已清空，不会误清除已 armed 的 contextmenu token。
- fallback：若 capture 失败，window pointerup/pointercancel 仍会取消残留会话；blur 与组件卸载会移除 listener/timer/highlight。
- 路由响应：edge 订阅全体节点；source/target 从障碍集合排除，其他节点位置和测量尺寸均参与重算。
- 数据兼容：handle 字段保持 optional；旧 edge 不带 handle 仍由 React Flow 选择首个 source/target handle；关系 route 字段归一化逻辑未破坏。
- 测试质量：新增测试直接执行草稿事务、handle 选择、preview 守卫、contextmenu token、waypoint 删除及 24px 碰撞策略；源码合同仅补充验证 React hook/listener 接线，不再作为语义行为的唯一证据。

## Remaining concerns / handoff

- 本 wave 未运行生产 build、Cargo、NSIS、安装与真实 Windows 指针手势人工验证；这些属于 final-review Important 8，由主代理按计划完成。
- `.adworkflow/context_manifest.json`、`context_preflight.json`、`context_raw.json`、`semantic_slice.json` 与当前 failed `impact_report.json` 是上下文/impact 生成状态，未纳入本提交；主代理需在最终源码 revision 上重新生成并通过 post-edit impact gate。
- `test:canvas` 的 Node ESM typeless-package warning 属于仓库现有运行方式；最终记录命令通过 `NODE_NO_WARNINGS=1` 获取干净测试输出，未为消除显示 warning 修改 package module 类型。
