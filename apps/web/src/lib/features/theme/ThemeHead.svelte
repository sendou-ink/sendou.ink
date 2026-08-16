<script lang="ts">
import type { Theme } from "./theme.server.ts";

interface Props {
	/** The user's explicitly chosen theme from the theme cookie, `null` when following the system theme. */
	theme: Theme | null;
}

let { theme }: Props = $props();

const metaColorScheme = $derived(
	theme === "light" ? "light dark" : "dark light",
);

// applied before first paint when no explicit theme is set, so the page
// never flashes the wrong theme; the html class is otherwise SSR'd
const CLIENT_THEME_SCRIPT = `
;(() => {
  const theme = window.matchMedia("(prefers-color-scheme: light)").matches
    ? 'light'
    : 'dark';
  const cl = document.documentElement.classList;
  const themeAlreadyApplied = cl.contains('light') || cl.contains('dark');
  if (!themeAlreadyApplied) {
    cl.add(theme);
  }
  const meta = document.querySelector('meta[name=color-scheme]');
  if (meta) {
    meta.content = theme === 'dark' ? 'dark light' : 'light dark';
  }
})();
`;
</script>

<svelte:head>
	<meta name="color-scheme" content={metaColorScheme} />
	{#if theme === null}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html `<script>${CLIENT_THEME_SCRIPT}</script>`}
	{/if}
</svelte:head>
