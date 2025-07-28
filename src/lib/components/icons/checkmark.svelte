<script lang="ts">
	import type { IconProps } from '$lib/components/icons/props';

	let { class: className, testId, onClick, title }: IconProps = $props();
</script>

<!-- xxx: could be also neat just have icons as svgs then autocreate the components -->

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<svg
	xmlns="http://www.w3.org/2000/svg"
	class={className}
	viewBox="0 0 20 20"
	fill="currentColor"
	data-testid={testId}
	onclick={onClick}
>
	{#if title}
		<title>{title}</title>
	{/if}
	<path
		fill-rule="evenodd"
		d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
		clip-rule="evenodd"
	/>
</svg>
