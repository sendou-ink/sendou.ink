# Overlays

Popovers, menus, selects, and dialogs are native top layer elements, meaing the browser handles show, dismiss, focus and stacking. However there are some things CSS can't handle perfectly on it's own, like placing a popover next to its anchor, scaling a popover to the available view height, preventing the page from scrolling, and keeping things in view when the mobile keyboard opens. We have three hooks to solve these issues.

## Floating layer

`useFloatingLayer` places a popover next to its anchor. Used by Popover, Menu and Select, but anything new that is anchored should use it too.

```tsx
useFloatingLayer({
	isOpen,
	floatingRef: popoverRef,
	getAnchor: () => triggerRef.current,
	placement: "bottom start",
});
```

Placements are `"top"`, `"bottom"`, `"right"`, `"bottom start"` and `"bottom end"`. The side is only a preference. When the content does not fit on one side and the opposite side has more room, the popover flips.

However the hook only handles positioning. For sizing the popover you can use the CSS variables that the hook sets:

| Variable | Usage |
| --- | --- |
| `--floating-available-width` / `--floating-available-height` | Can be used for `max-width` / `max-height` on the anchor |
| `--floating-anchor-width` / `--floating-anchor-height` | Can be used to match the popover size to the anchor |
| `--floating-transform-origin` | Can be used for `transform-origin` for transform animations |

The hook also sets `data-side` and `data-align` for styling by placement.

```css
.popover {
	position: absolute;
	margin: 0;
	width: var(--floating-anchor-width);
	max-height: var(--floating-available-height, none);
}
```

The settings for the hook are global CSS properties in `vars.css`:

| Variable | Meaning |
| --- | --- |
| `--floating-gap` | The gap between the popover and its anchor |
| `--floating-viewport-padding` | The room between the edge of the popover and edge of the viewport |
| `--popover-boundary-top` | The top nav, the popovers stay below it |
| `--popover-boundary-bottom` | The mobile nav, the popover stays above it |

### Behaviour

- **Available room is recalculatedd on every scroll and resize.**
- **The visible viewport is the boundary**, not the entire viewport, so it respects the mobile keyboard as well as the top nav and mobile nav.
- **Positioning modes.** `position: absolute` in most cases, `position: fixed` if the anchor is inside or is itself a fixed or sticky element.
- **Hidden when detached.** The popover is hidden when the anchor leaves the viewport, this includes being covered by the top nav and mobile nav.
- **The far edge stutters while scrolling.** When scrolling the popover resizing can sometimes look a bit laggy/stuttery. This is acceptable, no possible workaround (all UI libs have this).

The calcuations live in `floating-layer.ts` as pure functions.

## Scroll lock

`lockScroll()` keeps the page from scrolling until the release is called. Locks can be nested. `useScrollLock(locked)` wraps it for state-driven logic. `useScrollLockWhileOpen(ref)` lets you follows a native dialogs or popovers open state through its toggle events (this works before hydration). Dialogs, the mobile nav panels and the mobile side nav lock.

The lock goes on `body` and not `html`. Because we use `body { overflow-x: hidden }` in the global styles, a hidden `html` would stop the bodys overflow from propagating which turns the body into a scroll container, which breaks the sticky header (and other sticky elements). The width that the scrollbar took is added as padding to the body, because of some quirk with Chromiums `scrollbar-gutter`. A fixed element like the toast or the mobile nav bar should use `--scrollbar-width` as right side padding.

## Scroll into view

`useScrollIntoView(isOpen, getAnchor)` brings a popovers anchor back into the viewport when a mobile keyboard opens over it. It will not scroll a scroll locked page! Select and Popover use it.
