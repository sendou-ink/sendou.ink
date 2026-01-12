---
# sendou.ink-r717
title: Implement Twitch embed component with chat toggle
status: todo
type: feature
created_at: 2026-01-12T09:20:45Z
updated_at: 2026-01-12T09:20:45Z
parent: sendou.ink-r6ry
---

Create reusable Twitch embed component for the /streams page.

## Requirements

- Clicking a stream expands inline embed (accordion style)
- Multiple embeds can be open simultaneously
- Optional chat toggle alongside video
- Responsive sizing (16:9 aspect ratio)

## Checklist

- [ ] Create `/app/components/TwitchEmbed.tsx` component
- [ ] Implement video-only embed mode
- [ ] Implement video + chat side-by-side mode
- [ ] Add chat toggle button
- [ ] Save chat preference to localStorage (`twitch-chat-enabled`)
- [ ] Handle parent domain from `VITE_SITE_DOMAIN` env var
- [ ] Add loading state while iframe loads
- [ ] Test on mobile (responsive width)

## Component API

```tsx
interface TwitchEmbedProps {
  channel: string;           // Twitch username
  showChat?: boolean;        // Default from localStorage
  onChatToggle?: (show: boolean) => void;
}

// Usage
<TwitchEmbed channel="sendou" />
```

## Twitch Embed URL Format

```
Video only:
https://player.twitch.tv/?channel={channel}&parent={domain}&muted=false

Chat only:
https://www.twitch.tv/embed/{channel}/chat?parent={domain}
```

## Parent Domain

Twitch requires the `parent` parameter for embeds to work. Use:
- `import.meta.env.VITE_SITE_DOMAIN` (strips protocol)
- Parse hostname: `new URL(VITE_SITE_DOMAIN).hostname`
- For localhost: `localhost`
- For production: `sendou.ink`

## Layout

```
Desktop with chat:
┌──────────────────────┬──────────┐
│                      │          │
│      Video (16:9)    │   Chat   │
│                      │  (300px) │
│                      │          │
└──────────────────────┴──────────┘

Mobile (video only, full width):
┌──────────────────────────────────┐
│                                  │
│          Video (16:9)            │
│                                  │
└──────────────────────────────────┘
```

## Performance Notes

- Use lazy loading: only load iframe when expanded
- Consider max 3 simultaneous embeds (optional limit)
- iframes are heavy - show placeholder/thumbnail when collapsed

## References

- Twitch embed docs: https://dev.twitch.tv/docs/embed/video-and-clips/
- Chat embed docs: https://dev.twitch.tv/docs/embed/chat/
