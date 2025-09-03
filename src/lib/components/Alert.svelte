<script lang="ts">
	import type { Snippet } from 'svelte';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import CircleCheck from '@lucide/svelte/icons/circle-check';

	type AlertVariation = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';

	interface Props {
		children: Snippet;
		textClassName?: string;
		alertClassName?: string;
		variation?: AlertVariation;
		tiny?: boolean;
	}

	const { children, alertClassName, textClassName, tiny, variation }: Props = $props();
</script>

<div
	class={[
		'alert',
		alertClassName,
		{
			tiny,
			warning: variation === 'WARNING',
			error: variation === 'ERROR',
			success: variation === 'SUCCESS'
		}
	]}
>
	{@render icon()}
	<div class={textClassName}>{@render children()}</div>
</div>

{#snippet icon()}
	{#if variation === 'ERROR'}
		<CircleX />
	{:else if variation === 'SUCCESS'}
		<CircleCheck />
	{:else}
		<CircleAlert />
	{/if}
{/snippet}

<style>
	.alert {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-box);
		background-color: var(--color-info-transparent);
		color: var(--text);
		font-size: var(--fonts-sm);
		font-weight: var(--semi-bold);
		gap: var(--s-2);
		margin-inline: auto;
		padding-block: var(--s-1-5);
		padding-inline: var(--s-3) var(--s-4);
		text-align: center;

		& :global {
			svg {
				height: 1.75rem;
				color: var(--color-info);
			}
		}
	}

	.alert.tiny {
		font-size: var(--fonts-xs);

		& :global {
			svg {
				height: 1.25rem;
			}
		}
	}

	.alert.warning {
		background-color: var(--color-warning-transparent);

		& :global {
			svg {
				color: var(--color-warning);
			}
		}
	}

	.alert.error {
		background-color: var(--color-error-transparent);

		& :global {
			svg {
				color: var(--color-error);
			}
		}
	}

	.alert.success {
		background-color: var(--color-success-transparent);

		& :global {
			svg {
				color: var(--color-success);
			}
		}
	}
</style>
