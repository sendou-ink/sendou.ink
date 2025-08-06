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
		value?: string;
		onselect?: (item: Item) => void;
	}

	let {
		data,
		title,
		buttonPlaceholder,
		searchPlaceholder,
		open = $bindable(false),
		value = $bindable(''),
		onselect
	}: Props = $props();

	let trigger = $state<HTMLButtonElement>()!;
	let selectedValue = $state('');
	let selectedImage = $state('');

	function onSelect(item: Item) {
		open = false;
		value = item.value;
		selectedValue = item.label;
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
			<Command.Root>
				<div class="input-container">
					<Search color="currentColor" size="1rem" />
					<Command.Input placeholder={searchPlaceholder} />
				</div>
				<Command.List>
					<Command.Empty>{m.common_noResults()}</Command.Empty>
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
						<Command.Group value="all">
							{#each data as item (item.value)}
								{@render commandItem(item)}
							{/each}
						</Command.Group>
					{/if}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
</div>

{#snippet commandItem(item: Item)}
	<Command.Item keywords={item.keywords} value={item.value} onSelect={() => onSelect(item)}>
		<div class="item">
			{#if item.image}
				<Image path={item.image} size={24} lazy />
			{/if}
			<span>{item.label}</span>
		</div>
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
			padding: var(--s-1);
			height: 250px;
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

		[data-command-group] {
			margin-bottom: var(--s-2);
		}

		[data-command-empty] {
			color: var(--color-base-content-secondary);
			font-size: var(--fonts-xs);
			font-weight: var(--bold);
			height: 100%;
			display: flex;
			align-items: center;
			justify-content: center;
		}

		[data-command-item] {
			&:hover > .item,
			&[aria-selected='true'] > .item {
				background-color: var(--color-base-card);
			}
		}
	}
</style>
