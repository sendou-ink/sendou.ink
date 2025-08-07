<script lang="ts">
	import { tick } from 'svelte';
	import { Command, Popover } from 'bits-ui';
	import { m } from '$lib/paraglide/messages';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import Search from '@lucide/svelte/icons/search';
	import Image from './image/Image.svelte';

	export interface Item {
		value: string;
		label: string;
		image?: string;
		keywords?: string[];
	}

	export interface Group {
		label: string;
		image?: string;
		items: Item[];
	}

	interface Props {
		data: Item[] | Group[];
		title: string;
		buttonPlaceholder: string;
		searchPlaceholder: string;
		open?: boolean;
		value?: Item;
		onselect?: (item: Item) => void;
	}

	let {
		data,
		title,
		buttonPlaceholder,
		searchPlaceholder,
		open = $bindable(false),
		value = $bindable(undefined),
		onselect
	}: Props = $props();

	let trigger = $state<HTMLButtonElement>()!;
	let selectedValue = $state('');
	let selectedImage = $state('');

	function onSelect(item: Item) {
		open = false;
		value = item;
		selectedValue = item.value;
		selectedImage = item.image || '';

		onselect?.(item);

		tick().then(() => {
			trigger.focus();
		});
	}

	// xxx: Better way to do this?
	function isGroupData(data: Item[] | Group[]): data is Group[] {
		return data.length > 0 && 'items' in data[0];
	}
</script>

<div class="combobox">
	<span>{title}</span>
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<button {...props}>
					<div>
						{#if selectedImage}
							<Image path={selectedImage} size={24} lazy />
						{/if}
						<span class={{ 'text-white': selectedValue }}>{selectedValue || buttonPlaceholder}</span
						>
					</div>
					<ChevronsUpDownIcon size="1rem" />
				</button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content>
			{#snippet child({ props, wrapperProps, open })}
				{#if open}
					<div {...wrapperProps}>
						<div {...props}>
							<Command.Root loop>
								<div class="input-container">
									<Search color="currentColor" size="1rem" />
									<Command.Input placeholder={searchPlaceholder} />
								</div>
								<Command.List>
									{#snippet child({ props })}
										<div {...props}>
											<Command.Empty>
												{#snippet child({ props })}
													<span {...props}>{m.common_noResults()}</span>
												{/snippet}
											</Command.Empty>
											{#if isGroupData(data)}
												{#each data as group (group.label)}
													<Command.Group value={group.label}>
														<Command.GroupHeading>
															<div class="group-heading">
																{#if group.image}
																	<Image path={group.image} size={28} lazy />
																{/if}
																{group.label}
																<div></div>
															</div>
														</Command.GroupHeading>
														<Command.GroupItems>
															{#each group.items as item (item.value)}
																{@render commandItem(item)}
															{/each}
														</Command.GroupItems>
													</Command.Group>
												{/each}
											{:else if data.length > 0}
												{#each data as item (item.value)}
													{@render commandItem(item)}
												{/each}
											{/if}
										</div>
									{/snippet}
								</Command.List>
							</Command.Root>
						</div>
					</div>
				{/if}
			{/snippet}
		</Popover.Content>
	</Popover.Root>
</div>

{#snippet commandItem(item: Item)}
	<Command.Item keywords={item.keywords} value={item.value} onSelect={() => onSelect(item)}>
		{#snippet child({ props })}
			<div {...props} class={['item', item.value === selectedValue ? 'selected' : '']}>
				{#if item.image}
					<Image path={item.image} size={24} lazy />
				{/if}
				<span>{item.label}</span>
			</div>
		{/snippet}
	</Command.Item>
{/snippet}

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
		cursor: pointer;

		&:focus-visible {
			outline: 2px solid var(--color-primary);
		}

		div {
			display: flex;
			align-items: center;
			gap: var(--s-2);
			flex-grow: 1;
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

	.group-heading {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-1-5);
		white-space: nowrap;
		font-size: var(--fonts-xxs);
		color: var(--color-base-content-secondary);
		font-weight: var(--bold);
		text-transform: uppercase;

		& > div {
			width: 100%;
			height: 2px;
			margin-block: var(--s-2);
			background-color: var(--color-base-card);
		}

		:global {
			img {
				background-color: var(--color-base-card);
				padding: var(--s-1);
				border-radius: 100%;
				min-width: 28px;
			}
		}
	}

	.item {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		width: 100%;
		padding: var(--s-1-5);
		border-radius: var(--radius-field);
		cursor: pointer;

		&.selected {
			color: var(--color-primary);
			font-weight: var(--extra-bold);
		}

		&:hover,
		&[aria-selected='true'] {
			background-color: var(--color-base-card);
		}
	}

	[data-popover-content] {
		border: var(--border-style);
		border-radius: var(--radius-field);
		background-color: var(--color-base-section);
		flex-direction: column;
		width: var(--bits-popover-anchor-width);
		margin-top: var(--s-2);
		margin-bottom: var(--s-7);
		overflow: hidden;
	}

	[data-command-list] {
		max-height: 250px;
		padding: var(--s-1-5);
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

	[data-command-empty] {
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xs);
		font-weight: var(--bold);
		padding: var(--s-2);
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.combobox :global {
		[data-command-input] {
			color: initial;
			height: 1rem;
			border: none;
			background-color: var(--color-base-section);
			font-size: var(--fonts-xs);

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
	}
</style>
