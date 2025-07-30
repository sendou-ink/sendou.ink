<script lang="ts">
	import Image from './image/image.svelte';
	import { badgeUrl } from '$lib/utils/urls';

	interface Props {
		badge: { displayName: string; hue?: number | null; code: string };
		onclick?: () => void;
		isAnimated: boolean;
		size: number;
	}

	let { badge, onclick, isAnimated, size }: Props = $props();

	const commonProps = $derived({
		title: badge.displayName,
		onclick,
		width: size,
		height: size,
		style: badge.hue ? `filter: hue-rotate(${badge.hue}deg)` : undefined
	});
</script>

{#if isAnimated}
	<img
		src={badgeUrl({ code: badge.code, extension: 'gif' })}
		alt={badge.displayName}
		{...commonProps}
	/>
{:else}
	<Image
		path={badgeUrl({ code: badge.code })}
		alt={badge.displayName}
		loading="lazy"
		{...commonProps}
	/>
{/if}
