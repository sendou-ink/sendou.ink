<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Button from './Button.svelte';
	import { asset } from '$app/paths';
	import type { NavIconId } from '../../../routes/nav-items';

	interface Props {
		href: string;
		navIcon: NavIconId;
	}

	let { href, navIcon }: Props = $props();
</script>

<Button {href} class="addNewButton">
	<span class="iconsContainer">
		<Plus />
		<img src={asset(`/img/layout/${navIcon}.avif`)} height={18} width={18} alt="" />
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
		height: var(--button-height);
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
		height: var(--button-height);
		display: flex;
		align-items: center;
		border-radius: 0 var(--inner-border-radius) var(--inner-border-radius) 0;
		font-size: var(--fonts-xs);
	}
</style>
