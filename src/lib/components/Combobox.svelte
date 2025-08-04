<script lang="ts">
	import { tick } from 'svelte';
	import { Command, Popover } from 'bits-ui';
	import { m } from '$lib/paraglide/messages';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import Search from '@lucide/svelte/icons/search';

	interface Props {
		data: Array<{ value: string; label: string }>;
	}

	let { data }: Props = $props();

	let open = $state(false);
	let value = $state('');
	let trigger = $state<HTMLButtonElement>(null!);

	const selectedValue = $derived(data.find((item) => item.value === value)?.label);

	function closeAndReturnFocus() {
		open = false;
		tick().then(() => {
			trigger.focus();
		});
	}
</script>

<div class="combobox">
	<span>Select</span>
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<button {...props}>
					<span class={{ 'text-white': selectedValue }}>{selectedValue || 'Select an option'}</span>
					<ChevronsUpDownIcon size="1rem" />
				</button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content>
			<Command.Root>
				<div class="input-container">
					<Search color="currentColor" size="1rem" />
					<Command.Input placeholder="Search..." />
				</div>
				<Command.List>
					<Command.Empty>{m.common_noResults()}</Command.Empty>
					<Command.Group>
						{#each data as item (item.value)}
							<Command.Item
								value={item.value}
								onSelect={() => {
									value = item.value;
									closeAndReturnFocus();
								}}
							>
								<CheckIcon color={value !== item.value ? 'transparent' : 'currentColor'} />
								<span>{item.label}</span>
							</Command.Item>
						{/each}
					</Command.Group>
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
</div>

<style>
	span {
		font-size: var(--fonts-xs);
		font-weight: var(--bold);
		display: block;
	}

	button {
		margin-top: var(--s-1);
		height: 1rem;
		padding: var(--s-4) var(--s-3);
		border: var(--border-style);
		border-radius: var(--radius-field);
		background-color: var(--color-base-section);
		color: var(--color-base-content-secondary);
		outline: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-1-5);
		width: 100%;
		letter-spacing: 0.5px;

		&:focus-visible {
			outline: 2px solid var(--color-primary);
		}

		span.text-white {
			color: initial;
		}
	}

	.input-container {
		color: var(--color-base-content-secondary);
		display: flex;
		align-items: center;
		border: none;
		border-bottom: var(--border-style);
		padding: var(--s-2-5) var(--s-2);
		gap: var(--s-2);
	}

	.combobox :global {
		[data-popover-content] {
			border: var(--border-style);
			border-radius: var(--radius-field);
			background-color: var(--color-base-section);
			flex-direction: column;
			width: var(--bits-popover-anchor-width);
			margin-top: var(--s-2);
			overflow: hidden;
		}

		[data-command-input] {
			color: initial;
			height: 1rem;
			border: none;
			background-color: var(--color-base-section);

			width: 100%;
			outline: none;

			&::-webkit-input-placeholder,
			&::placeholder {
				color: var(--color-base-content-secondary);
				font-size: var(--fonts-xs);
				font-weight: var(--bold);
				letter-spacing: 0.5px;
			}
		}

		[data-command-list] {
			padding: var(--s-2);
			max-height: 250px;
			overflow-y: auto;
			width: 100%;
			border-radius: var(--radius-field);

			scrollbar-width: thin;

			&::-webkit-scrollbar,
			&::-webkit-scrollbar-track {
				height: 5px;
				width: 5px;
			}

			&::-webkit-scrollbar-thumb {
				border-radius: var(--radius-field);
			}
		}
	}
</style>
