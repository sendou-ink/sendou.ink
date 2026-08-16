<script lang="ts">
import type { Theme } from "./theme.server.ts";

interface Props {
	/** The user's explicitly chosen theme from the theme cookie, `null` when following the system theme. */
	theme: Theme | null;
}

let { theme }: Props = $props();

// when following the system theme the blocking script in app.html corrects
// this before first paint
const metaColorScheme = $derived(
	theme === "light" ? "light dark" : "dark light",
);
</script>

<svelte:head>
	<meta name="color-scheme" content={metaColorScheme} />
</svelte:head>
