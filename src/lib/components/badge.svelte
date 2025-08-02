<script lang="ts">
	import { badgeUrl } from '$lib/utils/urls';

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

<img src={badgeUrl({ code: badge.code, isAnimated })} alt={badge.displayName} {...commonProps} />
