---
# sendou.ink-xkkp
title: Implement screenshot/export feature
status: todo
type: task
created_at: 2026-01-15T19:18:58Z
updated_at: 2026-01-15T19:18:58Z
parent: sendou.ink-knt5
---

## Description
Allow users to export their team composition as an image.

## Tasks
- [ ] Create `CompScreenshot.tsx` component for screenshot content
- [ ] Screenshot includes:
  - Optional title (user-editable)
  - Author name (if logged in)
  - 4 weapon cards showing main/sub/special icons
- [ ] Screenshot does NOT include damage combo results
- [ ] Implement download functionality using snapdom (reference tier-list-maker)
- [ ] Add "Download" button to trigger screenshot

## Implementation Pattern (from tier-list-maker)
```typescript
import { snapdom } from "@zumer/snapdom";
import { flushSync } from "react-dom";

const handleDownload = async () => {
  flushSync(() => setScreenshotMode(true));
  await snapdom.download(ref.current, {
    type: "png",
    filename: "comp-analyzer",
    quality: 1,
    scale: 1.75,
    embedFonts: true,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
  });
  setScreenshotMode(false);
};
```

## Acceptance Criteria
- Screenshot captures title + author + weapons
- Screenshot does not include damage combos
- Downloads as PNG file
- Works similar to tier-list-maker pattern