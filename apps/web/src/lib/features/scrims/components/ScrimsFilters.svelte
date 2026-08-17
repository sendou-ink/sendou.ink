<script lang="ts">
import { Star } from "@lucide/svelte";
import { Button } from "@sendou/components";
import FilterBar from "#lib/components/filter-bar/FilterBar.svelte";
import { m } from "#lib/paraglide/messages.js";
import * as Scrim from "../Scrim.ts";
import { getScrimPosts, persistScrimFilters } from "../scrims.remote.ts";
import type { ScrimFilters } from "../scrims-types.ts";
import DivsFilterPopover from "./DivsFilterPopover.svelte";
import TimeRangeFilterPopover from "./TimeRangeFilterPopover.svelte";

interface Props {
	filters: ScrimFilters;
	canSaveAsDefault: boolean;
	writeFilters: (partial: Partial<ScrimFilters>) => void;
}

let { filters, canSaveAsDefault, writeFilters }: Props = $props();

let persistPending = $state(false);

async function saveAsDefault() {
	persistPending = true;
	try {
		await persistScrimFilters({
			filters: $state.snapshot(filters) as ScrimFilters,
		}).updates(getScrimPosts);
	} finally {
		persistPending = false;
	}
}
</script>

{#snippet weekdayPopover()}
	<TimeRangeFilterPopover
		name="weekdayTimes"
		value={filters.weekdayTimes}
		onChange={(timeRange) => writeFilters({ weekdayTimes: timeRange })}
	/>
{/snippet}

{#snippet weekendPopover()}
	<TimeRangeFilterPopover
		name="weekendTimes"
		value={filters.weekendTimes}
		onChange={(timeRange) => writeFilters({ weekendTimes: timeRange })}
	/>
{/snippet}

{#snippet divsPopover()}
	<DivsFilterPopover
		value={filters.divs}
		onChange={(divs) => writeFilters({ divs })}
	/>
{/snippet}

{#snippet actions()}
	{#if canSaveAsDefault}
		<Button
			disabled={persistPending}
			onclick={saveAsDefault}
			testId="save-filters-as-default-button"
		>
			{#snippet icon()}<Star />{/snippet}
			{m.common_filterBar_saveAsDefault()}
		</Button>
	{/if}
{/snippet}

<FilterBar
	pills={[
		{
			key: "weekdayTimes",
			name: m.scrims_filters_weekdayTimes(),
			formattedValue: filters.weekdayTimes
				? `${filters.weekdayTimes.start}–${filters.weekdayTimes.end}`
				: null,
			onRemove: () => writeFilters({ weekdayTimes: null }),
			testId: "weekday-times-filter",
			popover: weekdayPopover,
		},
		{
			key: "weekendTimes",
			name: m.scrims_filters_weekendTimes(),
			formattedValue: filters.weekendTimes
				? `${filters.weekendTimes.start}–${filters.weekendTimes.end}`
				: null,
			onRemove: () => writeFilters({ weekendTimes: null }),
			testId: "weekend-times-filter",
			popover: weekendPopover,
		},
		{
			key: "divs",
			name: m.scrims_filters_divs(),
			formattedValue: filters.divs
				? `${filters.divs.max}–${filters.divs.min}`
				: null,
			onRemove: () => writeFilters({ divs: null }),
			testId: "divs-filter",
			popover: divsPopover,
		},
	]}
	onReset={!Scrim.filtersAreDefault(filters)
		? () =>
				writeFilters({
					weekdayTimes: null,
					weekendTimes: null,
					divs: null,
				})
		: undefined}
	{actions}
/>
