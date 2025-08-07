<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		class?: string;
		halfWidth?: boolean;
		bigger?: boolean;
		style?: string;
	}

	let { children, class: className, halfWidth = false, bigger = false, style }: Props = $props();

	// const isMinorSupporter = useHasRole('MINOR_SUPPORT');
	const isMinorSupporter = false; // xxx: replace with actual role check

	const isRouteErrorResponse = false; // xxx: replace with actual error check if needed

	const showLeaderboard = $derived(
		import.meta.env.VITE_PLAYWIRE_PUBLISHER_ID && !isMinorSupporter && !isRouteErrorResponse
	);
</script>

<main
	class={[
		className,
		'main',
		{
			'pt-8-forced': showLeaderboard,
			'half-width': halfWidth,
			bigger
		}
	]}
	{style}
>
	{@render children?.()}
</main>

<style>
	.container {
		display: flex;
		flex-direction: row;
	}

	.main {
		width: 100%;
		max-width: 48rem;
		margin: 0 auto;
		padding-inline: var(--s-3);
		min-height: 75vh;
		padding-block: var(--s-4) var(--s-32);
	}

	.half-width {
		width: 100%;
		max-width: 24rem;
		margin: 0 auto;
	}

	.bigger {
		width: 100%;
		max-width: 72rem;
		margin: 0 auto;
	}
</style>
