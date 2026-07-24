# zeroxB fork baseline

## Pinned upstream

- Repository: `https://github.com/codexu/note-gen`
- Commit: `636d4f896850dfadfb7a5f74e1f9bd9a583c8096`
- Import branch: `foundation/notegen-636d4f8`

## Preserved seams

| Responsibility | Upstream path | zeroxB follow-up phase |
|---|---|---|
| Canvas schema | `src/types/canvas.ts` | permission and overlay plans |
| Canvas UI | `src/app/core/main/canvas/canvas-editor.tsx` | canvas shell and AI dock plans |
| Canvas node renderers | `src/app/core/main/canvas/nodes/canvas-nodes.tsx` | media node plan |
| Canvas persistence | `src/db/canvases.ts`, `src/stores/canvas.ts` | transaction plan |
| AI canvas tools | `src/lib/agent/tools/canvas-tools.ts` | permission gateway plan |
| Direct canvas mutation | `src/lib/canvas/operations.ts` | transaction plan |
| Agent approval UI | `src/app/core/main/chat/agent-approval-panel.tsx` | preview plan |
| Vector storage | `src/db/vector.ts` | memory navigation plan |
| RAG pipeline | `src/lib/rag.ts`, `src/lib/rag-sync.ts` | memory navigation plan |
| Model configuration | `src/app/core/setting/config.tsx`, `src/stores/setting.ts` | provider/security plan |
| Tauri desktop entry | `src-tauri/src/main.rs` | Windows recovery plan |

## Explicit deferrals

- No canvas-first layout changes in the foundation phase.
- No global removal of NoteGen UI strings in the foundation phase.
- No deletion of dormant mobile/macOS conditional source in the foundation phase.
- No AI permission or data migration changes in the foundation phase.
- No release publishing or updater endpoint is configured until zeroxB owns signing keys and a release repository.
