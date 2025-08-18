<script lang="ts">
	import { Command, Popover } from 'bits-ui';
	import { m } from '$lib/paraglide/messages';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import Search from '@lucide/svelte/icons/search';

	export interface Item {
		value: string;
		label: string;
		disabled?: boolean;
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
		disabled?: boolean;
		buttonPlaceholder?: string;
		searchPlaceholder: string;
		open?: boolean;
		value?: Item;
		onselect?: (item: Item) => void;
		id?: string;
	}

	let {
		data,
		disabled,
		searchPlaceholder,
		buttonPlaceholder,
		open = $bindable(false),
		value = $bindable(undefined),
		onselect,
		id
	}: Props = $props();

	let selectedValue = $derived(value?.label);
	let selectedImage = $derived(value?.image);

	function onSelect(item: Item) {
		open = false;
		value = item;

		onselect?.(item);
	}

	// xxx: Better way to do this?
	function isGroupData(data: Item[] | Group[]): data is Group[] {
		return data.length > 0 && 'items' in data[0];
	}
</script>

<div class="combobox">
	<Popover.Root bind:open>
		<Popover.Trigger {id} {disabled}>
			{#snippet child({ props })}
				<button {...props}>
					<div>
						{#if selectedImage}
							<img src={selectedImage} width={24} height={24} loading="lazy" alt="" />
						{/if}
						<span class={['button-text', { 'text-white': selectedValue }]}
							>{selectedValue || buttonPlaceholder}</span
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
																	<img
																		src={group.image}
																		width={28}
																		height={28}
																		loading="lazy"
																		alt=""
																	/>
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
	<Command.Item
		keywords={item.keywords}
		value={item.value}
		onSelect={() => onSelect(item)}
		disabled={item.disabled}
	>
		{#snippet child({ props })}
			<div {...props} class={['item', item.value === selectedValue ? 'selected' : '']}>
				{#if item.image}
					<img src={item.image} width={24} height={24} loading="lazy" alt="" />
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

	.button-text {
		text-wrap: nowrap;
		text-overflow: ellipsis;
		overflow-x: hidden;
	}

	button {
		height: 37px;
		padding: var(--s-4) var(--s-3);
		border: var(--border-style);
		border-radius: var(--radius-field);
		background-color: var(--color-base-card-section);
		color: var(--color-base-content-secondary);
		outline: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-1-5);
		width: var(--field-width-medium);
		letter-spacing: 0.5px;
		cursor: pointer;

		&:focus-visible {
			outline: 2px solid var(--color-primary);
		}

		&:disabled {
			pointer-events: none;
			cursor: not-allowed;
			opacity: 0.5;
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

		&:hover:not([data-disabled]),
		&[aria-selected='true']:not([data-disabled]) {
			background-color: var(--color-base-card);
		}
	}

	.item[data-disabled] {
		color: var(--color-base-content-secondary);
		font-style: italic;
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
		z-index: 1;
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
