---
# sendou.ink-jkq9
title: Create mock Twitch streams service for development
status: todo
type: task
created_at: 2026-01-12T12:21:36Z
updated_at: 2026-01-12T12:21:36Z
parent: sendou.ink-r6ry
---

Create a mock streams service that simulates Twitch API responses for local development without requiring Twitch credentials.

## Why

- Develop stream features without Twitch API credentials
- Faster iteration (no network calls)
- Predictable test data
- Works offline

## Requirements

- Same interface as real Twitch service (`getStreams()`)
- Returns realistic mock data (usernames, thumbnails, viewer counts)
- Configurable: number of streams, online/offline states
- Easy toggle between mock and real service

## Options to Consider

1. **Simple mock function** - Just return hardcoded data in dev mode
2. **JSON file** - Load mock data from a JSON file
3. **json-server** - Separate mock server (may be overkill)
4. **MSW (Mock Service Worker)** - Intercepts fetch calls (good for tests too)

## Recommendation

Start simple: environment variable toggle + mock function that returns static data.

```typescript
// /app/modules/twitch/streams.ts
export async function getStreams() {
  if (process.env.NODE_ENV === "development" && !process.env.TWITCH_CLIENT_ID) {
    return getMockStreams();
  }
  return getRealStreams();
}

function getMockStreams(): MappedStream[] {
  return [
    { twitchUserName: "sendou", viewerCount: 150, thumbnailUrl: "..." },
    { twitchUserName: "teststreamer1", viewerCount: 89, thumbnailUrl: "..." },
    // ... more mock data
  ];
}
```

## Mock Data Should Include

- 5-10 mock streamers with realistic usernames
- Variety of viewer counts (10 - 500 range)
- Placeholder thumbnail URLs (or local images)
- Some usernames matching seeded dev database users (if applicable)

## Checklist

- [ ] Add mock toggle logic to `/app/modules/twitch/streams.ts`
- [ ] Create mock data with realistic stream info
- [ ] Ensure mock works when TWITCH_CLIENT_ID is not set
- [ ] Document in README or .env.example
- [ ] Consider: sync mock usernames with seed data users