# Canvas Interaction Physics and Image Tags Design

**Date:** 2026-07-30

**Status:** Approved for implementation planning

**Platform:** Windows 10/11 x64 only

## Summary

This change makes canvas interaction roles predictable, fixes malformed external-text paste, adds four-sided relation gestures, gives node movement a restrained inertial finish, prevents high-zoom text creation from producing unusably small world geometry, and replaces permanent image filenames with hover metadata plus workspace-level image tags.

The implementation keeps React Flow, the existing collision engine, document history, and the current `10%` to `600%` zoom range. Interaction policies move into small pure modules so thresholds and algorithms can be tested without rendering the full editor.

## Problems

1. Clipboard ingestion prefers HTML and strips it with regular expressions. Block boundaries, Unicode line separators, and invisible whitespace can become malformed text and produce crowded layouts.
2. Empty-canvas left drag currently creates text while right drag performs marquee selection. This conflicts with the desired mouse-button roles.
3. Custom relation dragging can only originate from the bottom or right and can only target the top or left.
4. Node movement stops immediately at pointer release and has no velocity-sensitive finish.
5. High-zoom drag creation maps to very small world-space nodes. Returning to a normal zoom exposes thin, hard-to-use blocks.
6. Image nodes permanently reserve space for a filename. Images have no dedicated comment/tag editor or quick canvas-local tag query.

## Goals

- Make left mouse actions select, move, resize, and edit nodes.
- Make right drag on empty canvas create text blocks; a click or undersized drag creates nothing.
- Preserve right click on a node as the settings action while right drag creates a relation.
- Select relation source anchors from the initial drag direction and target anchors from the live pointer region.
- Normalize every external text path to stable plain text.
- Add subtle, collision-safe inertia to all draggable node types and rigid multi-selection movement.
- Apply a zoom-aware soft minimum during text-block creation preview.
- Hide image filenames by default and expose name/tags on hover.
- Add image name, comment, and workspace-level image tag editing to the image context menu.
- Add current-canvas tag filtering and sequential focus navigation.

## Non-Goals

- No Android, iOS, macOS, or Linux packaging work.
- No change to the existing maximum canvas zoom of `6` (`600%`).
- No global or cross-canvas image-tag search in this iteration.
- No reuse of the note/record tag database for image tags.
- No rich-text editor or HTML/Markdown formatting preservation for pasted text.
- No spring bounce, elastic collision, or strong kinetic scrolling behavior.
- No replacement of React Flow or the existing geometry/collision pipeline.

## Interaction Contract

### Empty Canvas

| Gesture | Result |
| --- | --- |
| Left click | Clear the current selection. |
| Left drag | Marquee-select nodes. |
| Right click | Do nothing. |
| Right drag below the existing two-axis drawable threshold | Do nothing. |
| Right drag with a valid area | Preview and create one text block. |
| Middle drag or Hand tool drag | Pan the viewport. |

The draw session continues to require meaningful movement on both axes. A point, line, or undersized rectangle never creates a node.

### Nodes

| Gesture | Result |
| --- | --- |
| Left click | Select the node. |
| Left drag on node body | Move the node or selected rigid set. |
| Left drag on a selected resize edge | Resize without starting a move. |
| Double-click text | Enter text-edit mode and focus the textarea. |
| Escape or external click while editing | Exit text-edit mode. |
| Right click | Open node settings. |
| Right movement of at least `6px` | Suppress the menu and start relation preview. |

Textareas are read-only for pointer purposes outside edit mode. In edit mode they retain normal selection, caret, keyboard, and clipboard behavior and carry `nodrag`/`nowheel` semantics.

### Relation Anchors

When a node right-drag crosses the `6px` activation threshold, calculate the initial movement vector from pointer-down to the activation point:

- If `abs(deltaX) >= abs(deltaY)`, select left for negative `deltaX` and right for positive `deltaX`.
- Otherwise select top for negative `deltaY` and bottom for positive `deltaY`.
- Lock the source side for the remainder of the gesture.
- While the pointer is inside a valid target, choose the target side whose edge has the smallest perpendicular distance to the pointer.
- Recalculate the target side while the pointer moves; highlight the active target handle.
- Self-targets, missing targets, preview snapshots, and invalid releases never create an edge.

Existing edge handle identifiers remain valid. Keep legacy `bottom` and `right` source handles and `top` and `left` target handles. Add co-located complementary handles for the missing roles, using distinct identifiers such as `source-top`, `source-left`, `target-bottom`, and `target-right`. Render the co-located role pair as one visual anchor.

## External Text Normalization

Introduce one plain-text normalization path for canvas paste/drop and text-node paste.

1. Prefer clipboard `text/plain` when it is non-empty.
2. Use HTML only as a fallback. Parse it with `DOMParser`, add line boundaries for block elements and `<br>`, and read decoded text content.
3. Normalize `CRLF`, lone `CR`, U+2028, and U+2029 to `\n`.
4. Remove BOM and zero-width formatting characters that do not carry visible content.
5. Convert non-breaking and exotic horizontal spaces to regular spaces.
6. Preserve tabs, repeated ASCII spaces, blank lines, and intentional paragraph structure.
7. Trim only outer empty space introduced by the transfer wrapper; do not collapse internal whitespace.

When pasting into an existing text node, replace the active selection with normalized text, update node data once, record one history checkpoint, restore the caret after the inserted text, and schedule height measurement. New-node paste/drop and existing-node paste must call the same normalizer.

## Zoom-Aware Text Creation

The pointer gesture remains the primary source of size. Let `rawWidth` and `rawHeight` be the screen drag dimensions converted through the viewport snapshot.

For zoom values above `1`, derive a sublinear world-space soft minimum:

```text
effectiveZoom = sqrt(max(1, zoom))
minimumWidth = 160 / effectiveZoom
minimumHeight = 88 / effectiveZoom
width = max(rawWidth, minimumWidth)
height = max(rawHeight, minimumHeight)
```

This yields approximately `113 x 62` world units at `200%`, avoiding the direct `1 / zoom` collapse without making the node grow linearly with zoom. The preview uses the resolved rectangle from its first visible frame, so pointer release does not resize or jump the node.

Wrapped text continues to grow vertically. A manual width change triggers remeasurement; a manual height change updates `textManualMinHeight`. Automatic measurement never shrinks below that minimum.

## Node Inertia

### Sampling

- Capture pointer samples for the latest `80ms` of an active node move.
- Calculate a time-weighted average screen velocity.
- Reject non-finite samples and one-frame spikes.
- Do not start inertia below `0.35 px/ms`.

### Projection

- Map valid release velocity to a projected screen distance capped between `40px` and `56px`, with faster valid releases approaching the cap.
- Convert the projection using the viewport snapshot captured for the move session.
- Resolve the entire projected rigid-set path through the existing swept collision policy before animation begins.
- Shorten the accepted endpoint at the first obstacle; never bounce or pass through another solid node.

### Animation and History

- Animate accepted travel for approximately `160ms` with exponential ease-out.
- Keep all controlled nodes rigid and selected.
- Keep the geometry session authoritative until animation ends.
- Commit the pointer move and inertia as one history entry; Undo restores the pre-drag geometry.
- Resize, draw, relation, and viewport sessions never receive inertia.
- A new pointer action, zoom, tool switch, window blur, stale document revision, or invalid collision index stops inertia at its last accepted geometry before allowing the next action.

## Image Metadata and Tags

### Node Data

Extend `CanvasNodeData` with an optional image tag list:

```ts
imageTags?: string[]
```

Continue using `label` as the image display name and `description` as the user comment. Missing `imageTags` normalizes to an empty list. Tag names are trimmed, case-insensitively deduplicated, length-bounded, and stored in stable display order.

### Tag Catalog

Create an image-only workspace tag catalog, separate from the existing note/record tags. Persist the ordered tag names and recent-selection metadata through Tauri Store. On canvas load/import/recovery, merge tag names found on image nodes into the catalog so document-contained metadata remains usable even if the store is missing.

### Image Rendering

- Remove the permanently rendered `BaseNodeContent` filename row.
- Let the image fill the node bounds.
- On hover or keyboard focus, render a pointer-transparent bottom overlay containing the display name and tag chips.
- Truncate long names to one line.
- Limit tags to two visual rows and show `+N` for overflow.
- Keep recognition status independent at the top-right.

### Image Settings

The image context menu keeps `Recognize image` and adds `Image information`. The information panel provides:

- Editable display name.
- Plain-text comment.
- Searchable multi-select of existing image tags.
- Inline creation of a new custom image tag.
- Quick chips for recent or frequently used tags.

Saving produces one canvas history checkpoint and one node-data update. Cancelling leaves the document and catalog unchanged except that already-existing catalog suggestions may have been read.

### Current-Canvas Tag Filter

Add a tag-filter button to the canvas toolbar. Filter state is transient UI state and is not persisted in the canvas document.

- Selecting multiple tags uses OR semantics: an image matches if it contains any selected tag.
- Matching images receive the existing high-priority focus treatment.
- Non-matching nodes and edges remain spatially visible at reduced opacity.
- Previous/next actions visit matching images in deterministic canvas order and smoothly focus the viewport.
- Clearing all selected tags restores normal rendering immediately.

## Architecture

Use small policy modules with React Flow as the orchestration layer:

- `src/lib/canvas/external-text.ts`: extraction, normalization, and selection insertion.
- `src/lib/canvas/gesture-policy.ts`: empty-canvas button roles, activation thresholds, and source direction classification.
- `src/lib/canvas/relation-interaction.ts`: four-sided typed handle selection.
- `src/lib/canvas/node-inertia.ts`: sampling, velocity, projection, and easing.
- `src/lib/canvas/viewport-sizing.ts`: zoom-aware creation soft minimum.
- `src/lib/canvas/image-tags.ts`: tag normalization, catalog merge, filtering, and traversal order.
- `src/stores/canvas-image-tags.ts`: Tauri Store catalog persistence and transient current-canvas filters.
- `src/app/core/main/canvas/canvas-image-info.tsx`: image metadata editor.
- `src/app/core/main/canvas/canvas-image-tag-filter.tsx`: toolbar filter and navigation.
- `src/app/core/main/canvas/canvas-editor.tsx`: pointer sessions, geometry authority, history, and policy integration.
- `src/app/core/main/canvas/nodes/canvas-nodes.tsx`: edit-mode text behavior, four-sided handles, and hover image metadata.

No policy module reads React state or writes persistence directly.

## Failure Handling

- Missing or empty clipboard formats are a no-op.
- HTML parsing failure falls back to the available plain string and never inserts markup.
- Invalid sizing or velocity inputs disable the enhancement and retain current safe behavior.
- Tag-store read failure reconstructs suggestions from loaded canvas nodes.
- Tag-store write failure reports a non-blocking error; canvas node metadata remains authoritative.
- An interrupted inertia session stops at the last geometry accepted by collision validation.
- Invalid relation targets clear preview/highlight and do not open the relation editor.

## Verification

### Automated

- External text tests cover HTML fallback, system plain-text precedence, block boundaries, Unicode line separators, invisible characters, tabs, repeated spaces, and selection insertion.
- Gesture tests cover left marquee, right draw, undersized right gesture, node context click, and `6px` relation activation.
- Relation tests cover every source direction, all target-edge regions, legacy handle compatibility, invalid targets, and context-menu suppression.
- Inertia tests cover slow rejection, weighted velocity, distance cap, easing monotonicity, collision truncation inputs, cancellation, and one-history-entry integration contracts.
- Viewport tests cover `100%`, `200%`, and `600%` soft minima plus preview/release identity.
- Image tests cover hidden default labels, hover metadata, tag normalization, catalog reconstruction, OR filtering, deterministic navigation, and persistence contracts.
- Run all Canvas tests and TypeScript checks.
- Run locked Rust tests/checks and the Windows NSIS build.

### Windows Acceptance

1. Paste the reported external content into a new and existing text node; paragraphs remain readable with no overlapping lines.
2. Right click empty canvas: no node. Right drag a valid area: one preview-matching text node.
3. Left drag empty canvas: marquee. Left drag a node: move. Double-click text: edit. Edge drag: resize.
4. Right click a node: settings. Right drag up/right/down/left: the matching source side remains locked.
5. Hover all four target regions and verify live handle movement; invalid release creates no relation.
6. Flick one node and a multi-selection; observe subtle damping, collision-safe stop, and one-step Undo.
7. At `200%` and `600%`, create narrow gestures and confirm the preview soft minimum prevents unusable world-space slivers.
8. Paste an image and confirm no permanent filename row. Hover to see name/tags, edit name/comment/tags from the context menu, and filter/navigate matching images.
9. Preserve the existing `note.db`, complete three cold starts, and confirm tag catalog and canvas metadata survive restart.

## Delivery

Implementation will proceed with failing tests before each behavior change, focused commits by responsibility, full Windows gates, NSIS packaging, database-preserving overwrite installation, three cold starts, and real UI acceptance before the branch is pushed.
