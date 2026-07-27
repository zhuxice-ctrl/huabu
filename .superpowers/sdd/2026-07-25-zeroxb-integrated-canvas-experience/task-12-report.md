# Task 12 report

Task 12 is complete at source revision `43f66efbba0013e683b45fd8ecf497ed9abeec4c`.

The permanent canvas now owns a bottom screen-space chat HUD with deterministic collapsed excerpts, a bounded expanded transcript, full searchable history, protected conversation actions and a shared composer. `ChatContent` remains the sole message renderer and windows long histories in 40-message segments with at most 120 mounted messages during normal traversal. Session-only drafts and scroll positions are isolated by conversation or temporary session plus canvas.

Validation: focused 17/17; Canvas 150/150; TypeScript passed; production build passed; independent findings resolved; final L2 predicted/observed 66/64, unexpected 0, critical 0/0 and complete propagation.
