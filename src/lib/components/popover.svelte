<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Anchor element that triggers the popover. Wrapped in a button element. */
		anchor?: Snippet;
		/** Anchor element that triggers the popover. Should be a button element. */
		anchorButton?: Snippet<[popovertarget: string]>;
		children: Snippet;
	}

	let { anchor, anchorButton, children }: Props = $props();

	const id = $props.id();
</script>

<!-- xxx: add polyfill -->
<!-- xxx: anchor-name for the button -->
<!-- xxx: unique anchor-name? -->
<!-- xxx: hide when button hits the top nav bar -->

{#if anchor}
	<button popovertarget={id} class="anchor-button">{@render anchor()}</button>
{:else if anchorButton}
	{@render anchorButton(id)}
{/if}

<div popover {id} class="positioned-notice">{@render children()}</div>

<style>
	.anchor-button {
		anchor-name: --anchor-el;

		padding: 0;
		border: none;
		background-color: transparent;
		color: var(--theme);
		outline: initial;
	}

	.positioned-notice {
		position-anchor: --anchor-el;
		position-area: end center;
		/* position-visibility: no-overflow; */
		margin-block-start: var(--s-0-5);
		inset: auto;

		max-width: 20rem;
		padding: var(--s-2);
		border: 2px solid var(--border);
		border-radius: var(--rounded);
		background-color: var(--bg-darker);
		font-size: var(--fonts-sm);
		font-weight: var(--semi-bold);
		white-space: pre-wrap;
		color: var(--text);
		position-try-fallbacks: --top;
	}

	@position-try --top {
		position-area: start center;
		margin-block-start: var(--s-0-5);
	}
</style>
