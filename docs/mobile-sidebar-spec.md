# Mobile Sidebar Design Spec

## Overview

Mobile adaptation of the desktop sidebar, using a bottom tab bar with slide-up panels. All desktop functionality remains accessible while optimizing for touch interaction and mobile screen space.

## Tab Bar

Fixed at bottom of screen. Icons + labels always visible.

### Logged-in Users (4 tabs, 5th dynamic)

| Position | Icon        | Label    | Behavior                          |
| -------- | ----------- | -------- | --------------------------------- |
| 1        | ☰ hamburger | Menu     | Opens overlay (streams + nav grid)|
| 2        | Friends     | Friends  | Slide-up panel (~85% height)      |
| 3        | Calendar    | Tourneys | Slide-up panel (~85% height)      |
| 4        | User        | You      | Slide-up panel (~85% height)      |
| 5        | SQ/tourney  | Match    | Direct navigation to match page   |

**Priority order:** Friends > Tournaments > Streams

### Anonymous Users

- Menu tab (position 1)
- Login button in position 4 (where "You" would be)
- Friends and Tourneys tabs hidden

### Dynamic Match Tab (Position 5)

Appears only when user has an active match or is in queue.

| State      | Icon            | Label   |
| ---------- | --------------- | ------- |
| In queue   | SQ logo         | Queue   |
| In match   | SQ/tourney logo | Match   |

Tapping navigates directly to match page (same as desktop sidebar behavior).

## Menu Overlay

Opens when tapping the Menu (hamburger) tab.

```
┌─────────────────────────────────────┐
│ [X]                          Menu   │
├─────────────────────────────────────┤
│ 🔴 Grand Finals - LUTI              │  <- Streams section (top, prominent)
│ 🔴 Sendou streaming                 │
├─────────────────────────────────────┤
│ [Analyzer] [Builds] [Calendar] ...  │  <- Navigation grid
│ [Maps]     [VODs]   [SendouQ]  ...  │
└─────────────────────────────────────┘
```

- Streams section at top (most prominent placement)
- Navigation grid below (existing nav items)
- X button to close

## Slide-up Panels

Used for Friends, Tournaments, and You tabs.

### Behavior

- Slide up from bottom of screen
- Height: ~85% of screen (peek of page behind)
- Title header with panel name + X button to close
- Tapping any item closes panel and navigates to that page
- User does not lose their place - overlay approach

### Friends Panel

- Title: "Friends"
- Full-width list layout
- Each item: avatar, name, status subtitle ("SendouQ", "Lobby"), optional badge ("2/4")
- Same data as desktop sidebar

### Tournaments Panel

- Title: "Tournaments"
- Full-width list layout
- Each item: tournament logo, name, start time
- Shows tournaments user is participating in or organizing
- Same data as desktop sidebar

### You Panel

- Title: "You" (or username)
- User avatar & name at top
- Notifications section (with unread count shown here, not on tab icon)
- Settings link
- Profile link

## Visual Design Notes

- Tab bar uses icons + labels (always visible)
- Panels have title headers
- X button is the only dismiss method (no swipe-to-dismiss, no tap-outside)
- Maintain existing design language and CSS variables

## States Summary

| User State   | Visible Tabs                              |
| ------------ | ----------------------------------------- |
| Anonymous    | Menu, Login                               |
| Logged in    | Menu, Friends, Tourneys, You              |
| In match     | Menu, Friends, Tourneys, You, Match/Queue |
