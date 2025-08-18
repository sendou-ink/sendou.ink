<script lang="ts">
	// xxx: we could probably make badges even smaller with "ffmpeg -i itz40.avif -vf "hue=h=-220" -map 0:v:1 ebtv2.avif"

	interface Props {
		badge: { displayName: string; code: string };
		onclick?: VoidFunction;
		isAnimated: boolean;
		size: number;
	}

	let { badge, onclick, isAnimated, size }: Props = $props();

	const commonProps = $derived({
		title: badge.displayName,
		onclick,
		width: size,
		height: size
	});
</script>

<img
	src={`/badges/${isAnimated ? 'animated' : 'static'}/${badge.code}.avif`}
	style="--badge-size:${size}px"
	alt={badge.displayName}
	{...commonProps}
/>

<style>
	img {
		min-width: var(--badge-size);
		max-width: var(--badge-size);
	}
</style>
