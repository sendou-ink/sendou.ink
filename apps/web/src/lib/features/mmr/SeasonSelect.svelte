<script lang="ts">
	import { Select, SelectItem, SelectItemSection } from "@sendou/components";
	import * as Seasons from "./Seasons.ts";

	interface Props {
		/** Localized word for "season", used both as the select's label and as the prefix of every season's name. */
		label: string;
		season: number;
		onChange: (season: number) => void;
		/** If given, seasons it returns `true` for can't be selected. */
		isSeasonDisabled?: (season: number) => boolean;
	}

	let { label, season, onChange, isSeasonDisabled }: Props = $props();

	const seasonsByYear = $derived.by(() => {
		const grouped = Object.groupBy(Seasons.allStarted(), (seasonNth) =>
			Seasons.nthToDateRange(seasonNth).starts.getFullYear(),
		);

		return Object.entries(grouped)
			.sort(([yearA], [yearB]) => Number(yearB) - Number(yearA))
			.map(([year, seasons]) => ({
				year,
				seasons: (seasons ?? []).sort((a, b) => b - a),
			}));
	});
</script>

<Select
	{label}
	selectedKey={season}
	onSelectionChange={(seasonNth) => {
		if (seasonNth !== null) onChange(Number(seasonNth));
	}}
>
	{#each seasonsByYear as { year, seasons } (year)}
		<SelectItemSection heading={year}>
			{#each seasons as seasonNth (seasonNth)}
				<SelectItem
					id={seasonNth}
					textValue={`${label} ${seasonNth}`}
					isDisabled={isSeasonDisabled?.(seasonNth)}
				>
					{`${label} ${seasonNth}`}
				</SelectItem>
			{/each}
		</SelectItemSection>
	{/each}
</Select>
