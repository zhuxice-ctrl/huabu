# Windows Canvas Text, Navigation, and Vision Design

**Date:** 2026-07-29

**Status:** Approved for implementation planning

**Platform:** Windows desktop only

## Objective

Improve the native zeroxB canvas in three connected areas:

1. Make text blocks preserve their drawn size while growing vertically as their content wraps.
2. Make canvas evidence returned by chat actually navigate to the matching node and text range.
3. Give canvas image nodes real visual understanding through a configured vision model with local OCR fallback.

The implementation must preserve existing workspaces, undo behavior, collision rules, sensitive-content boundaries, and the current Windows installer flow.

## Scope

### Included

- Drag-created text blocks keep the exact rectangle drawn by the user.
- Text wraps at the current node width and increases the node height when necessary.
- Users can resize text nodes horizontally, vertically, or diagonally with the primary mouse button.
- Right-button dragging from any point inside a text node creates a relationship preview.
- Completed chat answers auto-navigate once to their highest-confidence canvas evidence.
- Evidence controls support previous, next, forced location, and return to the original viewport.
- Image nodes receive background OCR and, when permitted and configured, vision-model descriptions.
- Direct questions about an image can trigger a fresh visual analysis of the original image.
- Sensitive images require explicit confirmation before any cloud vision request.
- Recognition output is locally cached and indexed as derived canvas knowledge.

### Excluded

- Android, touch gestures, mobile permissions, or mobile packaging.
- A general multimodal indexing redesign for PDF, video, or arbitrary attachments.
- Persisting image Base64 data in SQLite, canvas documents, chat metadata, or logs.
- Automatically uploading images when image recognition is disabled or no vision model is configured.
- Replacing the existing canvas evidence, OCR, model configuration, or sensitive-content systems.

## Design Principles

- Preserve direct manipulation: a dragged rectangle must not jump to a default size after pointer release.
- Keep derived state separate from authoritative canvas content wherever possible.
- Reuse the existing evidence-navigation, image-recognition, OCR, and canvas-index boundaries.
- Treat OCR and vision output as untrusted user data, never as model instructions.
- Fail visibly but non-destructively: recognition and navigation failures must not block canvas saving.
- Make every automatic action idempotent so React rendering cannot repeat it.

## 1. Text Block Sizing and Gestures

### 1.1 Creation

For drag creation, the initial width and height are the exact validated dimensions of the drawn rectangle. The renderer must not replace them with a universal minimum after creation. The existing small two-axis gesture threshold remains only to reject accidental clicks and degenerate rectangles.

Creation paths without a drawn rectangle, such as paste ingestion or AI node creation, continue using their existing deterministic type-specific fallback size. This avoids introducing a second visual default unrelated to those flows.

On pointer release:

- The drawn width becomes the text node's wrapping width.
- The drawn height becomes the node's manual minimum height.
- The content-driven height may immediately exceed that minimum if initial content already requires more space.

### 1.2 Automatic height

A pure text sizing policy receives:

- current node width;
- measured textarea content height;
- vertical padding and border contribution;
- the persisted manual minimum height;
- a small finite safety allowance for fractional layout measurements.

It returns `max(manualMinimumHeight, measuredContentHeightWithChrome)`. Width never grows automatically. Text uses character-level emergency wrapping so a long unbroken URL, hash, or token cannot overflow horizontally.

Content edits update height only when the calculated value materially differs from the current node height. The update participates in the active text-edit history session rather than creating a new undo entry for every keystroke.

When text is deleted, the node may shrink to its manual minimum height but never below it. A manual vertical resize replaces the manual minimum. A manual horizontal resize changes width, then immediately remeasures wrapped content and updates height.

### 1.3 Persisted compatibility

`CanvasNodeData` gains an optional text-specific manual minimum height. Existing text nodes without this field derive it from their persisted height when first normalized. Their persisted width is retained. If existing content needs more height, the renderer may grow the node but must not shrink it unexpectedly on first open.

The authoritative canvas document persists:

- actual node width;
- actual content-driven height;
- manual minimum height.

Transient DOM measurements and active resize state are never serialized.

### 1.4 Pointer behavior

Primary-button resizing remains available on all four edges and all four corners. Horizontal, vertical, and diagonal changes are accepted. A completed resize creates one history checkpoint.

Right-button behavior is separated by a four-screen-pixel movement threshold:

- right press and release below the threshold opens the existing context menu;
- right press followed by movement beyond the threshold starts a relationship preview from the source node;
- releasing on a different valid node commits the staged relationship;
- releasing on empty canvas or the source node cancels without a history write.

The relationship gesture can begin anywhere inside a text node, including over the textarea. Once the right-drag threshold is crossed, native selection and context-menu behavior are suppressed for that pointer session. Primary-button text selection, caret placement, and editing remain unchanged.

## 2. Chat Evidence Navigation

### 2.1 Automatic navigation

The existing structured canvas evidence markers remain the source of navigation authority. When an assistant message transitions to its completed state, the evidence navigator:

1. parses valid evidence for the source canvas;
2. reconciles it with the live canvas and current node identities;
3. records the pre-navigation viewport once;
4. chooses the highest-ranked result;
5. executes automatic focus only when its confidence meets the existing threshold.

Each completed assistant message may auto-navigate at most once per local runtime. Re-rendering, collapsing and reopening the HUD, scrolling chat history, or remounting the component must not repeat the automatic movement.

If evidence belongs to another existing canvas, navigation first switches the active canvas, waits for the target canvas runtime to publish readiness, and then performs focus. A single `requestAnimationFrame` without a readiness boundary is insufficient for cross-canvas navigation.

### 2.2 Focus behavior

Valid focus centers the node at a zoom no lower than the established evidence-navigation minimum and applies a short transient highlight.

For exact text evidence, selection occurs only when node identity, range bounds, field identity, and text fingerprint still match. Non-text evidence, including image recognition, focuses and highlights the node without attempting a textarea selection.

Low-confidence results do not move the viewport automatically. They display the existing confirmation treatment with a visible `定位` action. User confirmation may focus the evidence even below the automatic threshold.

### 2.3 Controls and stale evidence

The answer-level control keeps:

- current result and total result count;
- previous result;
- next result;
- forced location for candidate evidence;
- return to the original viewport.

The original viewport is immutable for the lifetime of that answer's navigation session. Moving among results never replaces it.

If the canvas is missing, the node was deleted, or the exact text fingerprint changed, the result is marked as changed or unavailable. The app must not navigate to a nearby node as a guess.

## 3. Canvas Image Recognition

### 3.1 Recognition modes

Image recognition uses a hybrid pipeline governed by the existing image-recognition setting and configured image model.

For an ordinary image node:

1. Read the original image bytes from the authorized workspace path.
2. Calculate a content hash without persisting the raw bytes.
3. Run local OCR.
4. If image recognition is enabled and an image model is configured, send the image to that vision model for a semantic description.
5. Merge OCR text and the semantic description as distinct derived knowledge fields.

If no vision model is configured, the status is explicitly `仅 OCR`; the UI and chat must not imply that scene semantics were understood.

When a user explicitly asks about details of a matched image, the system performs a fresh visual analysis of the original bytes before answering. Cached descriptions help retrieval but do not replace ask-time inspection for detail-sensitive questions.

### 3.2 Sensitive images

An image marked sensitive receives local OCR only during background processing. No cloud request is made automatically.

If the user explicitly asks for cloud visual analysis of a sensitive image, zeroxB shows a confirmation containing:

- the image label or filename;
- the destination model;
- a clear statement that original image content will be sent.

Only an accepted confirmation authorizes that single request. Denial leaves the cached local OCR intact. Recognition prompts wrap OCR and vision-derived text as untrusted data so text embedded in screenshots cannot instruct the agent or tools.

### 3.3 Recognition state and cache

Image nodes expose a compact derived status:

- `等待识别`;
- `识别中`;
- `已识别`;
- `仅 OCR`;
- `识别失败`.

The node menu provides `识别图片` or `重新识别` as appropriate. Recognition failures never replace the rendered image and never block canvas persistence.

A local SQLite table stores derived recognition data keyed by canvas, node, image content revision, image hash, and model identity. Its logical fields are:

- canvas ID and node ID;
- image content revision and SHA-256 hash;
- model identity or local-only marker;
- OCR text;
- vision description;
- status;
- redacted failure code;
- created and updated timestamps.

It must not store Base64, opaque credentials, request headers, or unrestricted provider error bodies. Image changes or model changes invalidate the matching cache entry. Derived rows may be deleted and rebuilt without changing the authoritative canvas document.

### 3.4 Index integration

Successful output creates separate knowledge anchors for:

- `image-ocr`;
- `image-description`.

Both anchors retain canvas ID, node ID, image revision, and node position. Retrieval can therefore match filenames, visible text, and visual semantics. Serialized answer evidence uses the same navigation contract as text evidence, allowing a found image to focus its real canvas node.

## 4. Component Boundaries

### Text sizing policy

A small pure module owns size calculation, legacy normalization, and resize reconciliation. The React node component owns DOM measurement and applies policy results through React Flow. The canvas editor owns history checkpoints and authoritative persistence.

### Node gesture policy

The existing pointer-session policy is extended with a text-node right-drag classifier. It produces context-menu, relationship-preview, commit, or cancel outcomes without directly mutating the canvas.

### Navigation scheduler

The existing evidence-navigation planner gains a local once-only automatic-focus state and a canvas-readiness handshake. The chat UI renders commands; the canvas runtime executes viewport changes and node highlighting.

### Image recognition runtime

A Windows-only canvas recognition runtime coordinates file reads, hashing, OCR, vision calls, sensitive confirmation, cache writes, and index refresh. Pure parsing and cache-key logic remain testable outside Tauri. Existing credential resolution remains inside the Rust transport boundary.

## 5. Error Handling

- Invalid or non-finite text measurements are ignored and retain the last valid geometry.
- Resize cancellation restores the captured geometry and manual minimum.
- Relationship cancellation writes neither an edge nor a history checkpoint.
- Missing or stale evidence produces an unavailable state rather than approximate navigation.
- Image file disappearance produces a redacted failure state and keeps the node.
- OCR failure may still allow a successful vision description, and vision failure may still allow local OCR.
- Total recognition failure is retryable and does not poison the canvas index with an empty success record.
- Provider errors are classified and redacted through the existing AI transport rules.
- Database or cache failures do not prevent image rendering or canvas saving.

## 6. Verification Strategy

### Text and gesture tests

- Drag-created text nodes preserve exact valid pointer dimensions.
- Long wrapped content grows height without changing width.
- Long unbroken strings wrap without horizontal clipping.
- Deleting content shrinks only to the manual minimum.
- Horizontal resize reflows and remeasures; vertical resize updates the manual minimum.
- Legacy nodes normalize without an initial shrink.
- Right click opens the context menu, while a right drag beyond four screen pixels stages a relationship.
- Primary-button editing and selection remain unaffected.
- Cancelled relationships and resizes create no persistent mutation.

### Navigation tests

- A completed high-confidence answer automatically focuses exactly once.
- Low-confidence evidence waits for user confirmation.
- Cross-canvas focus waits for the destination runtime.
- Previous, next, and return preserve the original viewport.
- Deleted nodes and changed text fingerprints fail safely.
- Image evidence focuses the image node without a text-range selection.

### Vision tests

- OCR-only, VLM-only, merged, and total-failure outcomes are classified correctly.
- Sensitive background recognition never invokes the cloud model.
- Sensitive ask-time recognition requires a one-request confirmation.
- Cache keys change with image content or model identity.
- Persisted recognition rows and logs contain no Base64, credentials, or unrestricted provider bodies.
- Image-derived anchors participate in retrieval and serialize navigable evidence.

### Release gates

- Full Canvas test suite.
- TypeScript `--noEmit`.
- Locked Cargo tests and Cargo check under the Windows MSVC environment.
- Next production build with source-map pruning.
- Windows NSIS package.
- Repeated installed cold starts against the existing workspace.
- Manual Windows verification with a long unbroken text block, manual bidirectional resize, right-drag relationship creation, chat auto-location, ordinary image recognition, sensitive image confirmation, and a real image-detail question.

## 7. Acceptance Criteria

The work is accepted when all of the following are true:

1. A user-drawn text rectangle retains its drawn size and grows vertically only when content requires it.
2. Manual horizontal and vertical resizing remains authoritative as the text node's width and minimum height.
3. Right-dragging anywhere inside a text node can create a relationship without breaking right-click menus or left-button editing.
4. A completed answer with strong valid evidence visibly navigates to the correct node once and offers reversible result navigation.
5. A canvas image can be found by filename, OCR text, or semantic visual content and the result can navigate to the image node.
6. Direct image-detail questions use the original image with a configured vision model rather than inferring from a filename.
7. Sensitive images never leave the device without explicit per-request confirmation.
8. Existing workspace content remains intact, the installed Windows app starts repeatedly, and all automated release gates pass.
