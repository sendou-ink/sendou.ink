import {
	SendouSelect,
	SendouSelectItem,
	SendouSelectItemSection,
} from "~/components/elements/Select";
import * as Seasons from "~/features/mmr/core/Seasons";

/**
 * Select for choosing one of the started seasons, grouped by the year the season started in.
 *
 * @param label - Localized word for "season", used both as the select's label and as the prefix of every season's name.
 * @param isSeasonDisabled - If given, seasons it returns `true` for can't be selected.
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
