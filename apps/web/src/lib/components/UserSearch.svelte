<script lang="ts">
import { Select, SelectItem } from "@sendou/components";
import {
	searchUsers,
	type UserSearchResult,
} from "#lib/features/search/search.remote.ts";
import { m } from "#lib/paraglide/messages.js";
import Avatar from "./Avatar.svelte";
import { EntitySearchText } from "./entity-search.svelte.ts";
import FormMessage from "./FormMessage.svelte";
import Label from "./Label.svelte";

interface Props {
	label?: string;
	bottomText?: string;
	errorText?: string;
	errorId?: string;
	initialUserId?: number;
	onChange?: (user: UserSearchResult | null) => void;
	isRequired?: boolean;
	isDisabled?: boolean;
}

let {
	label,
	bottomText,
	errorText,
	errorId,
	initialUserId,
	onChange,
	isRequired,
	isDisabled,
}: Props = $props();

const search = new EntitySearchText();

let selectedItem = $state<UserSearchResult | null>(null);
// svelte-ignore state_referenced_locally -- the preselected id seeds the initial state only
let selectedKey = $state<number | null>(initialUserId ?? null);

// resolves the full user object for a preselected id so it can be displayed;
// loads at most once per field — later selections carry the full object
// svelte-ignore state_referenced_locally -- the preselected id is resolved once at mount
const initialUserQuery =
	initialUserId !== undefined
		? searchUsers({ q: String(initialUserId), limit: 1 })
		: null;
const initialUser = $derived(
	initialUserQuery?.current?.results.find((user) => user.id === initialUserId),
);

const pinnedItem = $derived(selectedItem ?? initialUser ?? null);

const resultsQuery = $derived(
	search.query ? searchUsers({ q: search.query, limit: 6 }) : null,
);

/** `null` = no up-to-date results for the typed query (show the placeholder) */
const results = $derived.by(() => {
	if (!resultsQuery) return null;
	const data = resultsQuery.current;
	if (!data || data.query !== search.query) return null;
	return data.results.filter((user) => user.id !== pinnedItem?.id);
});

function handleSelectionChange(key: string | number | null) {
	if (key === null || typeof key === "string") return;

	selectedKey = key;
	const item =
		pinnedItem?.id === key
			? pinnedItem
			: (results?.find((user) => user.id === key) ?? null);
	if (item) {
		selectedItem = item;
		onChange?.(item);
	}
}

function additionalText(item: UserSearchResult) {
	const plusServer = item.plusTier ? `+${item.plusTier}` : "";
	const profileUrl = item.customUrl ? `/u/${item.customUrl}` : "";

	if (plusServer && profileUrl) return `${plusServer} • ${profileUrl}`;
	return plusServer || profileUrl;
}

const composedAriaLabel = $derived(
	["User search", label, isRequired ? "*" : undefined]
		.filter(Boolean)
		.join(" "),
);
</script>

{#snippet userContent(item: UserSearchResult)}
	<Avatar user={item} size="xxs" />
	<div class="itemTextsContainer">
		{item.name}
		{#if additionalText(item)}
			<div class="itemAdditionalText">{additionalText(item)}</div>
		{/if}
	</div>
{/snippet}

<div class="root">
	{#if label}
		<Label spaced={false} required={isRequired}>{label}</Label>
	{/if}
	<Select
		aria-label={composedAriaLabel}
		{selectedKey}
		onSelectionChange={handleSelectionChange}
		{isDisabled}
		{isRequired}
		search={{
			placeholder: m.common_actions_search(),
			testId: "user-search-input",
		}}
		bind:searchValue={search.searchValue}
		popoverClass="searchSelectPopover"
	>
		{#snippet valueContent(key)}
			{#if pinnedItem && pinnedItem.id === key}
				<span class="selectValue">
					{@render userContent(pinnedItem)}
				</span>
			{/if}
		{/snippet}
		{#if pinnedItem}
			<SelectItem
				id={pinnedItem.id}
				textValue={pinnedItem.name}
				testId="user-search-item"
			>
				<div class="item">{@render userContent(pinnedItem)}</div>
			</SelectItem>
		{/if}
		{#if results === null}
			<SelectItem id="PLACEHOLDER" textValue="PLACEHOLDER" isDisabled>
				<div class="placeholder">
					{m.common_forms_userSearch_placeholder()}
				</div>
			</SelectItem>
		{:else if results.length === 0}
			<SelectItem id="NO_RESULTS" textValue="NO_RESULTS" isDisabled>
				<div class="placeholder">{m.common_forms_userSearch_noResults()}</div>
			</SelectItem>
		{:else}
			{#each results as item (item.id)}
				<SelectItem id={item.id} textValue={item.name} testId="user-search-item">
					<div class="item">{@render userContent(item)}</div>
				</SelectItem>
			{/each}
		{/if}
	</Select>
	{#if errorText}
		<FormMessage type="error" spaced={false} id={errorId}>
			{errorText}
		</FormMessage>
	{/if}
	{#if bottomText}
		<FormMessage type="info" spaced={false}>{bottomText}</FormMessage>
	{/if}
</div>

<style>
	.root {
		display: flex;
		flex-direction: column;
		gap: var(--s-1-5);
		width: 100%;
	}

	.root :global(.searchSelectPopover) {
		min-height: 250px;
	}

	.item,
	.selectValue {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.root :global(button:disabled .selectValue) {
		color: var(--color-text-high);
		font-style: italic;
	}

	.itemTextsContainer {
		line-height: 1.1;
		font-size: var(--font-sm);
	}

	.itemAdditionalText {
		font-size: var(--font-xs);
		color: var(--color-text-high);
	}

	.selectValue .itemAdditionalText {
		display: none;
	}

	.placeholder {
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		color: var(--color-text-high);
		text-align: center;
		display: grid;
		place-items: center;
		height: 162px;
		margin-block: var(--s-4);
	}
</style>
