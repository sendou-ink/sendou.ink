<script lang="ts">
import { Bookmark, BookmarkCheck } from "@lucide/svelte";
import { isToday, isTomorrow } from "date-fns";
import Image from "#lib/components/Image.svelte";
import TierPill from "#lib/components/TierPill.svelte";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";
import { formatDistanceToNowLocalized } from "#lib/utils/format-distance.ts";
import { navIconUrl } from "#lib/utils/urls.ts";
import ListLink from "./ListLink.svelte";
import type { SidebarStream } from "./layout-types.ts";

interface Props {
	streams: SidebarStream[];
	onclick?: () => void;
	isLoggedIn?: boolean;
	savedTournamentIds?: number[];
}

let { streams, onclick, isLoggedIn, savedTournamentIds }: Props = $props();

const timeFormatter = $derived(
	new Intl.DateTimeFormat(getLocale(), {
		hour: "numeric",
		minute: "numeric",
	}),
);
const dateTimeFormatter = $derived(
	new Intl.DateTimeFormat(getLocale(), {
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
	}),
);

function formatRelativeDate(timestamp: number) {
	const date = new Date(timestamp * 1000);
	const timeStr = timeFormatter.format(date);

	if (isToday(date) || isTomorrow(date)) {
		const rtf = new Intl.RelativeTimeFormat(getLocale(), {
			numeric: "auto",
		});
		const dayStr = rtf.format(isToday(date) ? 0 : 1, "day");
		return `${dayStr.charAt(0).toUpperCase() + dayStr.slice(1)}, ${timeStr}`;
	}

	return dateTimeFormatter.format(date);
}

function isUpcoming(stream: SidebarStream) {
	return databaseTimestampToDate(stream.startsAt).getTime() > Date.now();
}

function tournamentIdOf(stream: SidebarStream) {
	return stream.id.startsWith("upcoming-")
		? Number(stream.id.replace("upcoming-", ""))
		: null;
}
</script>

{#each streams as stream, i (stream.id)}
	{@const upcoming = isUpcoming(stream)}
	{@const prevStream = streams.at(i - 1)}
	{@const showUpcomingDivider =
		upcoming && prevStream && !isUpcoming(prevStream)}
	{@const tournamentId = tournamentIdOf(stream)}
	{@const tier = stream.tier ?? stream.tentativeTier}
	{#snippet subtitle()}
		{#if stream.peakXp}
			<span class="xpSubtitle">
				<Image path={navIconUrl("xsearch")} alt="" class="xpIcon" />
				{stream.peakXp}
			</span>
		{:else if stream.subtitle}
			{stream.subtitle}
		{:else if upcoming}
			{formatRelativeDate(stream.startsAt)}
		{:else}
			{formatDistanceToNowLocalized(databaseTimestampToDate(stream.startsAt))}
		{/if}
	{/snippet}
	{#snippet badge()}
		<div class="badgeRow">
			{#if isLoggedIn && tournamentId !== null}
				{@const saved = savedTournamentIds?.includes(tournamentId) ?? false}
				<!-- TODO(phase 3+): wire saving to the tournament save mutation once tournaments migrate -->
				<button type="button" class="saveIconButton" title="Save">
					{#if saved}
						<BookmarkCheck size={14} data-testid="stream-saved-icon" />
					{:else}
						<Bookmark size={14} data-testid="stream-save-icon" />
					{/if}
				</button>
			{/if}
			{#if tier}
				<div class="tierBadge">
					<TierPill
						{tier}
						isTentative={!stream.tier && !!stream.tentativeTier}
					/>
				</div>
			{/if}
		</div>
	{/snippet}
	{#if showUpcomingDivider}
		<div data-testid="upcoming-divider" class="upcomingDivider">
			{m.front_sideNav_streams_upcoming()}
		</div>
	{/if}
	{#if upcoming}
		<ListLink
			to={stream.url}
			imageUrl={stream.imageUrl}
			overlayIconUrl={stream.overlayIconUrl}
			{subtitle}
			{badge}
			{onclick}
		>
			{stream.name}
		</ListLink>
	{:else}
		<ListLink
			to={stream.url}
			imageUrl={stream.imageUrl}
			overlayIconUrl={stream.overlayIconUrl}
			{subtitle}
			badge="LIVE"
			badgeVariant="warning"
			{onclick}
		>
			{stream.name}
		</ListLink>
	{/if}
{/each}

<style>
	.xpSubtitle {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.xpSubtitle :global(.xpIcon) {
		width: 14px;
		height: 14px;
	}

	.tierBadge {
		flex-shrink: 0;
	}

	.upcomingDivider {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-1) var(--s-2);
		font-size: var(--font-3xs);
		color: var(--color-text-high);
		text-transform: uppercase;
		letter-spacing: 0.05em;

		&::before,
		&::after {
			content: "";
			flex: 1;
			border-top: 1px solid var(--color-border);
		}
	}

	.badgeRow {
		display: flex;
		align-items: center;
		gap: var(--s-1);
		margin-left: auto;
		flex-shrink: 0;
	}

	.saveIconButton {
		display: grid;
		place-items: center;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-high);
		padding: 0;
		height: var(--selector-size-sm);
		aspect-ratio: 1 / 1;
		border-radius: var(--radius-selector);

		&:hover {
			color: var(--color-text);
			background-color: var(--color-bg-higher);
		}
	}
</style>
