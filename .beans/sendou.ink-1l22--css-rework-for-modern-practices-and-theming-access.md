---
# sendou.ink-1l22
title: CSS rework for modern practices and theming accessibility
status: in-progress
type: epic
priority: normal
created_at: 2026-01-11T09:33:26Z
updated_at: 2026-01-11T09:34:23Z
---

## Why

The existing CSS architecture needed modernization to support:

1. **Consistency** - Standardized design tokens and variable naming conventions
2. **Modern CSS practices** - Leveraging newer CSS features for better maintainability
3. **Accessibility for user-defined themes** - Making it easy for users to customize themes while maintaining readability and contrast requirements

## What's been done

- Redefined all styles in `vars.css` with a consistent naming convention
- Established design tokens for colors, spacing, typography, and other properties
- Created a foundation that supports user theme customization while preserving accessibility

## Goals

- All components use CSS variables from `vars.css` consistently
- Theme customization is straightforward and accessible
- Color contrast and other accessibility requirements are maintained across all themes
- Reduced CSS specificity conflicts and improved maintainability

## Completion criteria

All child tickets resolved and the new CSS variable system is fully adopted across the codebase.