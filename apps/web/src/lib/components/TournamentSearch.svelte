<script lang="ts">
import { Select, SelectItem } from "@sendou/components";
import { sub } from "date-fns";
import {
	searchTournaments,
	type TournamentSearchItem,
} from "#lib/features/tournament/tournament-search.remote.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";
import { EntitySearchText } from "./entity-search.svelte.ts";
import FormMessage from "./FormMessage.svelte";
import Label from "./Label.svelte";

interface Props {
	label?: string;
	bottomText?: string;
	errorText?: string;
	errorId?: string;
	initialTournamentId?: number;
	/**
	 * Restrict results to tournaments that have already started (finished/past)
	 * instead of the default recent + upcoming window.
	 */
	pastOnly?: boolean;
	onChange?: (tournament: TournamentSearchItem | null) => void;
	isRequired?: boolean;
	isDisabled?: boolean;
}

let {
	label,
	bottomText,
	errorText,
	errorId,
	initialTournamentId,
	pastOnly,
	onChange,
	isRequired,
	isDisabled,
}: Props = $props();

const search = new EntitySearchText();

let selectedItem = $state<TournamentSearchItem | null>(null);
// svelte-ignore state_referenced_locally -- the preselected id seeds the initial state only
let selectedKey = $state<number | null>(initialTournamentId ?? null);

const pinnedItem = $derived(selectedItem);

function timeBounds() {
	return pastOnly
		? { maxStartTime: new Date() }
		: { minStartTime: sub(new Date(), { days: 7 }) };
}

const resultsQuery = $derived(
	search.query
		? searchTournaments({ q: search.query, limit: 6, ...timeBounds() })
		: null,
);

/** `null` = no up-to-date results for the typed query (show the placeholder) */
const results = $derived.by(() => {
	if (!resultsQuery) return null;
	const data = resultsQuery.current;
	if (!data || data.query !== search.query) return null;
	return data.tournaments.filter(
		(tournament) => tournament.id !== pinnedItem?.id,
	);
});

function handleSelectionChange(key: string | number | null) {
	if (key === null || typeof key === "string") return;

	selectedKey = key;
	const item =
		pinnedItem?.id === key
			? pinnedItem
			: (results?.find((tournament) => tournament.id === key) ?? null);
	if (item) {
		selectedItem = item;
		onChange?.(item);
	}
}

function formatStartsAt(startsAt: number) {
	return new Intl.DateTimeFormat(getLocale(), {
		day: "numeric",
		month: "numeric",
		year: "numeric",
	}).format(databaseTimestampToDate(startsAt));
}

const composedAriaLabel = $derived(
	["Tournament search", label, isRequired ? "*" : undefined]
		.filter(Boolean)
		.join(" "),
);
</script>

{#snippet tournamentContent(item: TournamentSearchItem)}
	<img src={item.logoUrl} alt="" class="logo" />
	<div class="itemTextsContainer">
		<span>{item.name}</span>
		<div class="itemAdditionalText">{formatStartsAt(item.startsAt)}</div>
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
			testId: "tournament-search-input",
		}}
		bind:searchValue={search.searchValue}
		popoverClass="searchSelectPopover"
	>
		{#snippet valueContent(key)}
			{#if pinnedItem && pinnedItem.id === key}
				<span class="selectValue">
					{@render tournamentContent(pinnedItem)}
				</span>
			{/if}
		{/snippet}
		{#if pinnedItem}
			<SelectItem
				id={pinnedItem.id}
				textValue={pinnedItem.name}
				testId="tournament-search-item"
			>
				<div class="item">{@render tournamentContent(pinnedItem)}</div>
			</SelectItem>
		{/if}
		{#if results === null}
			<SelectItem id="PLACEHOLDER" textValue="PLACEHOLDER" isDisabled>
				<div class="placeholder">
					{m.common_forms_tournamentSearch_placeholder()}
				</div>
			</SelectItem>
		{:else if results.length === 0}
			<SelectItem id="NO_RESULTS" textValue="NO_RESULTS" isDisabled>
				<div class="placeholder">
					{m.common_forms_tournamentSearch_noResults()}
				</div>
			</SelectItem>
		{:else}
			{#each results as item (item.id)}
				<SelectItem
					id={item.id}
					textValue={item.name}
					testId="tournament-search-item"
				>
					<div class="item">{@render tournamentContent(item)}</div>
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

	.itemTextsContainer {
		line-height: 1.1;
		font-size: var(--font-sm);

		& span {
			max-width: 175px;
			text-overflow: ellipsis;
			white-space: nowrap;
			overflow: hidden;
			display: block;
		}
	}

	.itemAdditionalText {
		font-size: var(--font-xs);
		color: var(--color-text-high);
	}

	.selectValue .itemAdditionalText {
		display: none;
	}

	.logo {
		width: 24px;
		height: 24px;
		border-radius: var(--radius-field);
		object-fit: cover;
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
