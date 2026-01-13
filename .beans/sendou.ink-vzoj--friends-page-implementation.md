---
# sendou.ink-vzoj
title: /friends page implementation
status: todo
type: task
priority: normal
created_at: 2026-01-13T09:32:40Z
updated_at: 2026-01-13T11:25:15Z
parent: sendou.ink-255r
blocking:
    - sendou.ink-0sk2
---

## Overview

Create the /friends page with full friend management capabilities.

## Route

`app/features/friends/routes/friends.tsx`

Add to routes.ts.

## Sections (grouped, unlike sidebar)

### 1. Pending Requests
- **Incoming requests**: Show sender info, accept/decline buttons
- **Outgoing requests**: Show receiver info, cancel button
- Badge count in section header

### 2. Friends
- List of explicit friends with activity status
- Search/filter input
- Each friend card shows: avatar, name, activity, unfriend option
- Unfriend requires confirmation modal

### 3. Teammates
- Grouped by team
- Show team name as subheader
- Activity status for each teammate
- Link to team page

### 4. Connections
- Association and Plus server members
- Show association/org name as context
- Activity status

## Features

- Search across all sections
- Filter by activity (in SendouQ, in tournament)
- Responsive layout (grid on desktop, list on mobile)
- Empty states for each section

## Checklist

- [ ] Create route and add to routes.ts
- [ ] Loader: fetch requests, friends, teammates, associations
- [ ] Pending requests section UI
- [ ] Friends section with management
- [ ] Teammates section grouped by team
- [ ] Connections section
- [ ] Search/filter functionality
- [ ] Unfriend confirmation modal
- [ ] Responsive layout
- [ ] Empty states
- [ ] i18n translations