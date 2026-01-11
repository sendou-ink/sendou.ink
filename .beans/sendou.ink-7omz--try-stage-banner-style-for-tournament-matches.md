---
# sendou.ink-7omz
title: Try stage banner style for tournament matches
status: todo
type: task
created_at: 2026-01-11T19:25:36Z
updated_at: 2026-01-11T19:25:36Z
parent: sendou.ink-1l22
---

## Description

Experiment with using "stage banner" style images for tournament match displays instead of the regular sized stage images. Stage banner images are available in Lean's splat3 assets repository and might provide a better visual appearance.

## Context

Currently, tournament matches use regular stage images (`stageImageUrl`) as background for the `FancyStageBanner` component (in `app/features/tournament-bracket/components/StartedMatch.tsx`). The banner dimensions are 10rem tall with `background-size: cover`.

Lean's repository may have wider/more panoramic stage banners that could better fit this banner-style layout without as much cropping.

## Tasks

- [ ] Locate stage banner images from Lean's splat3 repository
- [ ] Compare visual appearance with current stage images
- [ ] If they look better, add banner images to static assets
- [ ] Update `stageImageUrl` or create new `stageBannerUrl` utility
- [ ] Update `FancyStageBanner` component to use banner images

## Files

- `app/features/tournament-bracket/components/StartedMatch.tsx:290-292` - stageNameToBannerImageUrl function
- `app/features/tournament-bracket/tournament-bracket.module.css:57-71` - stageBanner styling
- `app/utils/urls.ts:493-494` - stageImageUrl function