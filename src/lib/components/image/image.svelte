<script lang="ts">
	import type { HTMLImgAttributes } from 'svelte/elements';

	export interface ImageProps extends HTMLImgAttributes {
		path: string;
		title?: string;
		containerClassName?: string;
		width?: number;
		height?: number;
		size?: number;
		containerStyle?: string;
	}

	let {
		path,
		title,
		width,
		height,
		size,
		style,
		containerClassName,
		containerStyle,
		...rest
	}: ImageProps = $props();
</script>

<picture {title} class={containerClassName} style={containerStyle}>
	<source type="image/avif" srcset="{path}.avif" {width} {height} {style} />
	<img src="{path}.png" width={size ?? width} height={size ?? height} {...rest} />
</picture>
