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

<!-- xxx: hide when button hits the top nav bar -->

{#if anchor}
	<button popovertarget={id} class="anchor" style="--anchor-name:{id}">{@render anchor()}</button>
{:else if anchorButton}
	{@render anchorButton(id)}
{/if}

<div
	popover
	{id}
	class={[
		'popover-message',
		{
			padded: Boolean(anchorButton)
		}
	]}
	style="--anchor-name:{id}"
>
	{@render children()}
</div>

<style>
	.anchor {
		anchor-name: var(--anchor-name);

		padding: 0;
		border: none;
		background-color: transparent;
		color: var(--theme);
		outline: initial;
	}

	.popover-message {
		position-anchor: var(--anchor-name);
		position-area: end center;
		margin-block-start: var(--s-0-5);
		inset: auto;
		position-try-fallbacks: --top;

		width: max-content;
		max-width: 20rem;
		padding: var(--s-2);
		border: 2px solid var(--border);
		border-radius: var(--rounded);
		background-color: var(--bg-darker);
		font-size: var(--fonts-sm);
		font-weight: var(--semi-bold);
		white-space: pre-wrap;
		color: var(--text);

		opacity: 1;
		transform: translateY(0);
		transition:
			opacity 0.2s ease-out,
			transform 0.2s ease-out;

		&.padded {
			margin-block-start: var(--s-2);
			position-try-fallbacks: --top-padded;
		}

		@starting-style {
			opacity: 0;
			transform: translateY(-4px);
		}
	}

	@position-try --top {
		position-area: start center;
		margin-block-start: var(--s-0-5);
	}

	@position-try --top-padded {
		position-area: start center;
		margin-block-start: var(--s-2);
	}
</style>
