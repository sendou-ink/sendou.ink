<script lang="ts">
import type { ClassValue } from "svelte/elements";

interface Props {
	/** Without the extension, the AVIF variant is loaded. */
	path: string;
	alt: string;
	title?: string;
	class?: ClassValue;
	containerClass?: ClassValue;
	width?: number;
	height?: number;
	size?: number;
	testId?: string;
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
	testId,
	loading = "lazy",
}: Props = $props();
</script>

<div {title} class={containerClass}>
	<img
		{alt}
		src={`${path}.avif`}
		class={className}
		width={size ?? width}
		height={size ?? height}
		draggable="false"
		{loading}
		data-testid={testId}
	/>
</div>
