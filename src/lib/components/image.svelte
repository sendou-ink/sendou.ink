<script lang="ts">
	interface Props {
		path: string;
		alt: string;
		title?: string;
		className?: string;
		containerClassName?: string;
		width?: number;
		height?: number;
		size?: number;
		style?: string;
		containerStyle?: string;
		testId?: string;
		onclick?: () => void;
		loading?: 'lazy';
	}

	let {
		path,
		alt,
		title,
		className,
		width,
		height,
		size,
		style,
		testId,
		containerClassName,
		containerStyle,
		onclick,
		loading
	}: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<picture {title} class={containerClassName} style={containerStyle} {onclick}>
	<source type="image/avif" srcset="{path}.avif" {width} {height} {style} />
	<img
		{alt}
		src="{path}.png"
		class={className}
		width={size ?? width}
		height={size ?? height}
		{style}
		draggable="false"
		{loading}
		data-testid={testId}
	/>
</picture>
