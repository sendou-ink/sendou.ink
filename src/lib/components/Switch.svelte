<script lang="ts">
	import { Switch } from 'bits-ui';

	interface Props {
		size?: 'small' | 'medium';
		name?: string;
		id?: string;
		// xxx: small
	}

	let { size, name, id }: Props = $props();
</script>

<Switch.Root {name} {id}>
	{#snippet child({ props })}
		<div {...props} class={['root', { small: size === 'small' }]}>
			<Switch.Thumb>
				{#snippet child({ props })}
					<div {...props} class="thumb"></div>
				{/snippet}
			</Switch.Thumb>
		</div>
	{/snippet}
</Switch.Root>

<style>
	.root {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		color: var(--color-primary-content);
		forced-color-adjust: none;
		font-size: var(--fonts-xs);
		font-weight: var(--bold);
		margin-block-end: 0;
		border-radius: var(--radius-box);
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
		background: var(--color-base-content);
		border-radius: 16px;
		transition: transform 200ms;
	}

	.root.small .thumb:before {
		width: 0.857rem;
		height: 0.857rem;
		margin: 0.143rem;
	}

	.thumb[data-state='checked']:before {
		opacity: 0.8;
	}

	.thumb[data-state='checked'] {
		background: var(--color-primary);
	}

	.thumb[data-state='checked']:before {
		transform: translateX(125%);
	}

	.thumb[data-state='checked']:before {
		transform: translateX(100%);
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
