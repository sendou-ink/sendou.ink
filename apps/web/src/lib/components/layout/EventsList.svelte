<script lang="ts">
import { isToday, isTomorrow } from "date-fns";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";
import ListLink from "./ListLink.svelte";
import type { SidebarEvent } from "./layout-types.ts";

interface Props {
	events: SidebarEvent[];
	onclick?: () => void;
}

let { events, onclick }: Props = $props();

const dateFormatter = $derived(
	new Intl.DateTimeFormat(getLocale(), {
		weekday: "long",
		month: "numeric",
		day: "numeric",
	}),
);
const timeFormatter = $derived(
	new Intl.DateTimeFormat(getLocale(), {
		hour: "numeric",
		minute: "2-digit",
	}),
);

function formatDayHeader(date: Date) {
	if (isToday(date) || isTomorrow(date)) {
		const rtf = new Intl.RelativeTimeFormat(getLocale(), {
			numeric: "auto",
		});
		const str = rtf.format(isToday(date) ? 0 : 1, "day");
		return str.charAt(0).toUpperCase() + str.slice(1);
	}
	return dateFormatter.format(date);
}

function eventTitle(event: SidebarEvent) {
	if (event.scrimStatus === "booked") {
		return m.front_sideNav_scrimVs({ opponent: event.name });
	}
	if (event.scrimStatus === "looking") {
		return m.front_sideNav_lookingForScrim();
	}
	if (event.scrimStatus === "requestPending") {
		return m.front_sideNav_scrimRequestPending();
	}
	return event.name;
}

const groupedEvents = $derived.by(() => {
	const groups = new Map<string, SidebarEvent[]>();
	for (const event of events) {
		const key = new Date(event.startsAt * 1000).toDateString();
		const group = groups.get(key) ?? [];
		group.push(event);
		groups.set(key, group);
	}
	return [...groups.entries()];
});
</script>

{#if events.length === 0}
	<div class="text-lighter text-sm p-2">
		{m.front_sideNav_noEvents()}
	</div>
{:else}
	{#each groupedEvents as [dayKey, dayEvents] (dayKey)}
		<div>
			<div class="dayHeader">
				{formatDayHeader(new Date(dayEvents[0].startsAt * 1000))}
			</div>
			{#each dayEvents as event (`${event.type}-${event.id}`)}
				<ListLink
					to={event.url}
					imageUrl={event.logoUrl ?? undefined}
					user={event.user ?? undefined}
					subtitle={timeFormatter.format(event.startsAt * 1000)}
					{onclick}
				>
					{eventTitle(event)}
				</ListLink>
			{/each}
		</div>
	{/each}
{/if}

<style>
	.dayHeader {
		padding: var(--s-2) var(--s-2) var(--s-1);
		font-size: var(--font-2xs);
		font-weight: var(--weight-bold);
		color: var(--color-text-high);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
</style>
