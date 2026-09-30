import {
	SendouSelect,
	SendouSelectItem,
	SendouSelectItemSection,
} from "~/components/elements/Select";
import * as Seasons from "~/features/mmr/core/Seasons";

/**
 * Select of the started seasons, grouped by start year. `label` is the localized word for
 * "season", used as the label and as each season name's prefix; `isSeasonDisabled` blocks the seasons it returns `true` for.
 */
export function SeasonSelect({
	label,
	season,
	onChange,
	isSeasonDisabled,
}: {
	label: string;
	season: number;
	onChange: (season: number) => void;
	isSeasonDisabled?: (season: number) => boolean;
}) {
	return (
		<SendouSelect
			label={label}
			selectedKey={season}
			onSelectionChange={(seasonNth) => onChange(Number(seasonNth))}
			items={seasonsByYear()}
		>
			{({ year, seasons, key }) => (
				<SendouSelectItemSection heading={year} key={key}>
					{seasons.map((seasonNth) => (
						<SendouSelectItem
							key={seasonNth}
							id={seasonNth}
							isDisabled={isSeasonDisabled?.(seasonNth)}
						>
							{`${label} ${seasonNth}`}
						</SendouSelectItem>
					))}
				</SendouSelectItemSection>
			)}
		</SendouSelect>
	);
}

function seasonsByYear() {
	const grouped = Object.groupBy(Seasons.allStarted(), (seasonNth) =>
		Seasons.nthToDateRange(seasonNth).starts.getFullYear(),
	);

	return Object.entries(grouped)
		.sort(([yearA], [yearB]) => Number(yearB) - Number(yearA))
		.map(([year, seasons]) => ({
			year,
			key: year,
			seasons: (seasons ?? []).sort((a, b) => b - a),
		}));
}
