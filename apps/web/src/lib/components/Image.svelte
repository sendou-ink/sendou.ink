<script lang="ts">
	interface Props {
		path: string;
		alt: string;
		title?: string;
		class?: string;
		containerClass?: string;
		width?: number;
		height?: number;
		size?: number;
		style?: string;
		containerStyle?: string;
		testId?: string;
		onclick?: () => void;
		loading?: "lazy" | "eager";
	}

	let {
		path,
		alt,
		title,
		class: className,
		containerClass,
		width,
		height,
		size,
		style,
		containerStyle,
		testId,
		onclick,
		loading = "lazy",
	}: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div {title} class={containerClass} style={containerStyle} {onclick}>
	<img
		{alt}
		src="{path}.avif"
		class={className}
		width={size ?? width}
		height={size ?? height}
		{style}
		draggable="false"
		{loading}
		data-testid={testId}
	/>
</div>
