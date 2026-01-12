---
# sendou.ink-hw3x
title: Update sidebar to use real stream data
status: todo
type: task
created_at: 2026-01-12T09:20:56Z
updated_at: 2026-01-12T09:20:56Z
parent: sendou.ink-r6ry
---

Replace mock stream data in sidebar with real aggregated streams.

## Current State

- `/app/features/sidebar/routes/sidebar.ts` has `getMockStreams()`
- Returns hardcoded test data
- Sidebar already displays streams in correct format

## Requirements

- Call stream aggregation service
- Apply scoring algorithm to get top 3
- Return in SideNavLink format: `{ id, name, imageUrl, subtitle, badge }`

## Checklist

- [ ] Import aggregation service in sidebar.ts
- [ ] Replace `getMockStreams()` with call to `aggregateStreams()`
- [ ] Apply `rankStreams()` to get scored/shuffled order
- [ ] Take top 3 streams
- [ ] Map to SideNavLink format
- [ ] Add error handling (return empty array if service fails)
- [ ] Test with real Twitch data

## Implementation

```typescript
// sidebar.ts loader
import { aggregateStreams, rankStreams } from "~/features/streams/streams.server";

async function getStreams() {
  try {
    const allStreams = await aggregateStreams();
    const ranked = rankStreams(allStreams);
    return ranked.slice(0, 3).map(stream => ({
      id: stream.id,
      name: stream.name,
      imageUrl: stream.imageUrl,
      subtitle: stream.subtitle,
      badge: stream.badge,
      url: stream.url,
    }));
  } catch (error) {
    console.error("Failed to fetch streams:", error);
    return [];
  }
}
```

## Error Handling

- If aggregation service fails, return empty array (don't break sidebar)
- Log error for debugging
- Sidebar gracefully hides streams section when empty

## Dependencies

- sendou.ink-nw8b: Stream aggregation service
- sendou.ink-js3r: Sidebar scoring algorithm
