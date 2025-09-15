<script lang="ts">
	import { Switch, Label, useId } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import MyLabel from './form/Label.svelte';

	interface Props {
		size?: 'small' | 'medium';
		name?: string;
		children?: Snippet;
		id?: string;
		checked?: boolean;
		reverse?: boolean;
		onchange?: (checked: boolean) => void;
		// xxx: small
	}

	let {
		size,
		name,
		children,
		id = useId(),
		checked = $bindable(false),
		reverse,
		onchange
	}: Props = $props();
</script>

<div class={['stack horizontal sm items-center', { reverse }]}>
	<Switch.Root {name} {id} bind:checked onCheckedChange={(checked) => onchange?.(checked)}>
		{#snippet child({ props })}
			<button {...props} class={['root', { small: size === 'small' }]}>
				<Switch.Thumb>
					{#snippet child({ props })}
						<div {...props} class="thumb"></div>
					{/snippet}
				</Switch.Thumb>
			</button>
		{/snippet}
	</Switch.Root>
	{#if children}
		<Label.Root for={id}>
			{#snippet child({ props })}
				<MyLabel {...props}>
					{@render children()}
				</MyLabel>
			{/snippet}
		</Label.Root>
	{/if}
</div>

<style>
	.reverse.reverse {
		flex-direction: row-reverse;
	}

	.root {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		color: #fff;
		forced-color-adjust: none;
		font-size: var(--fonts-xs);
		font-weight: var(--bold);
		margin-block-end: 0;
		border-radius: var(--radius-box);
		appearance: none;
		border: 0;
		padding: 0;
		background: transparent;
	}

	.root .thumb {
		width: var(--s-11);
		height: var(--s-6);
		background: var(--color-primary-transparent);
		border-radius: 1.143rem;
	}

	.root.small .thumb {
		width: 2rem;
		height: 1.143rem;
	}

	.root .thumb:before {
		content: '';
		display: block;
		margin: 0.26rem;
		width: var(--s-4);
		height: var(--s-4);
		background: #fff;
		border-radius: 16px;
		transition: transform 200ms;
	}

	.root.small .thumb:before {
		width: 0.857rem;
		height: 0.857rem;
		margin: 0.143rem;
	}

	.thumb[data-state='checked'] {
		background: var(--color-primary);
	}

	.thumb[data-state='checked']:before {
		transform: translateX(125%);
		box-shadow: 0 0 0.1rem var(--color-primary-content);
	}

	.thumb[data-state='checked']:before {
		transform: translateX(125%);
	}

	.root:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.root[data-disabled] .thumb {
		opacity: 0.65;
	}

	.root[data-disabled] {
		cursor: not-allowed;
	}
</style>
