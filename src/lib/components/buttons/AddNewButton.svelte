<script lang="ts">
	import Image from '$lib/components/image/Image.svelte';
	import { navIconUrl } from '$lib/utils/urls';
	import Plus from '@lucide/svelte/icons/plus';
	import Button from './Button.svelte';

	interface Props {
		href: string;
		navIcon: string;
	}

	let { href, navIcon }: Props = $props();

	// xxx: styles broken
</script>

<Button {href} class="addNewButton">
	<span class="iconsContainer">
		<Plus />
		<Image path={navIconUrl(navIcon)} size={18} alt="" />
	</span>
	<span class="textContainer">New</span>
</Button>

<style>
	:global(.addNewButton) {
		--picture-size: 18px;
		--icon-size: 14px;
		--button-height: 28px;
		--border-width: 2px;
		--inner-border-radius: 6px;

		padding-block: 0 !important;
		padding-inline: 0 !important;
		background-color: transparent !important;
		height: var(--button-height);
	}

	.iconsContainer {
		display: flex;
		gap: var(--s-0-5);
		align-items: center;
		justify-content: center;
		background-color: var(--color-primary-transparent);
		height: calc(var(--button-height) - var(--border-width) * 2);
		border-radius: var(--inner-border-radius) 0 0 var(--inner-border-radius);
		padding-inline: var(--s-1);
	}

	.iconsContainer > :global(svg) {
		max-width: var(--icon-size);
		max-height: var(--icon-size);
		min-width: var(--icon-size);
		min-height: var(--icon-size);
		color: var(--color-primary);
		stroke-width: 4px;
	}

	.iconsContainer > :global(picture) {
		max-width: var(--picture-size);
		max-height: var(--picture-size);
		min-width: var(--picture-size);
		min-height: var(--picture-size);
	}

	.textContainer {
		padding-inline: var(--s-1-5);
		background-color: var(--color-primary) !important;
		height: calc(var(--button-height) - var(--border-width) * 2);
		display: flex;
		align-items: center;
		border-radius: 0 var(--inner-border-radius) var(--inner-border-radius) 0;
		font-size: var(--fonts-xs);
	}
</style>
