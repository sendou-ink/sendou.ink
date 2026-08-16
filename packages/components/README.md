# @sendou/components

The Svelte UI kit for sendou.ink (`svelte-big-bang.md` phase 2+). Design goal:
progressive enhancement over ARIA maximalism — native primitives do the work
where the platform provides them, handwritten ARIA patterns where it doesn't.

Rules:

- components know nothing about sendou.ink: no db types, no i18n — user-visible
  strings arrive via props/snippets
- styling uses the app's CSS variables (`vars.css`); components ship scoped
  `<style>` blocks only
- consumed as source (`svelte` export condition); no build step
