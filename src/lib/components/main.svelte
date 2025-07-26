<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		children?: Snippet;
		className?: string;
		classNameOverwrite?: string;
		halfWidth?: boolean;
		bigger?: boolean;
		style?: string;
	}

	let {
		children,
		className,
		classNameOverwrite,
		halfWidth = false,
		bigger = false,
		style,
	}: Props = $props();

	// const isMinorSupporter = useHasRole('MINOR_SUPPORT');
	const isMinorSupporter = false; // xxx: replace with actual role check

	const isRouteErrorResponse = false; // xxx: replace with actual error check if needed

	const showLeaderboard = $derived(
		import.meta.env.VITE_PLAYWIRE_PUBLISHER_ID &&
			!isMinorSupporter &&
			!isRouteErrorResponse,
	);

	export const containerClassName = (
		width: "narrow" | "normal" | "wide",
	): string => {
		if (width === "narrow") {
			return "half-width";
		}

		if (width === "wide") {
			return "bigger";
		}

		return "main";
	};
</script>

<div class="container">
	<main
		class={{
			classNameOverwrite,
			className: className && !classNameOverwrite,
			[containerClassName("normal")]: !classNameOverwrite,
			[containerClassName("narrow")]: halfWidth,
			[containerClassName("wide")]: bigger,
			"pt-8-forced": showLeaderboard,
		}}
		{style}
	>
		{@render children?.()}
	</main>
</div>

<style>
	.container {
		display: flex;
		flex-direction: row;
	}

	.main {
		padding-block: var(--s-4) var(--s-32);
	}
</style>
