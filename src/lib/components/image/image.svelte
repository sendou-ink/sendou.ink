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
		lazy?: boolean;
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
		lazy = false,
		...rest
	}: ImageProps = $props();
</script>

<picture {title} class={containerClassName} style={containerStyle}>
	<source type="image/avif" srcset="{path}.avif" {width} {height} {style} />
	<img src="{path}.png" width={size ?? width} height={size ?? height} {...rest} loading="lazy" />
</picture>
