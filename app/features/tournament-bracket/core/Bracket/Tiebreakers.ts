import type { Standing } from "./Bracket";

type TiebreakerStats = NonNullable<Standing["stats"]>;

export interface Tiebreaker {
	/** Column header of the standings table */
	label: string;
	/** Explanation of the label, shown as its tooltip */
	description: string;
	/** Negative when `a` ranks above `b`, positive when below and 0 when the tiebreaker does not separate them */
	compare: (a: TiebreakerStats, b: TiebreakerStats) => number;
	/** Value shown in the standings table */
	format: (stats: TiebreakerStats) => string;
}

export const ROUND_ROBIN: Tiebreaker[] = [
	{
		label: "W/L",
		description: "Set wins and losses",
		compare: (a, b) => higherFirst(a.setWins, b.setWins),
		format: (stats) => `${stats.setWins}/${stats.setLosses}`,
	},
	{
		label: "TB",
		description: "Wins against tied opponents",
		compare: (a, b) => higherFirst(a.winsAgainstTied, b.winsAgainstTied),
		format: (stats) => String(stats.winsAgainstTied),
	},
	{
		label: "W/L (M)",
		description: "Map wins and losses",
		compare: compareMapWinsAndLosses,
		format: formatMapWinsAndLosses,
	},
	{
		label: "KOs",
		description: "Number of maps knocked out",
		compare: (a, b) => higherFirst(a.koCount ?? 0, b.koCount ?? 0),
		format: (stats) => String(stats.koCount ?? 0),
	},
];

export const SWISS: Tiebreaker[] = [
	{
		label: "W/L",
		description: "Set wins and losses",
		// also set losses because we want a team who dropped more sets ranked lower (early advance format)
		compare: (a, b) =>
			higherFirst(a.setWins, b.setWins) || lowerFirst(a.setLosses, b.setLosses),
		format: (stats) => `${stats.setWins}/${stats.setLosses}`,
	},
	{
		label: "TB",
		description: "Losses against tied opponents",
		// Unlike round robin (wins against tied), Swiss counts
		// losses because not every tied team has played each other: wins would favor teams who
		// faced more tied peers, losses are schedule-independent. winsAgainstTied is display only.
		compare: (a, b) =>
			lowerFirst(a.lossesAgainstTied ?? 0, b.lossesAgainstTied ?? 0),
		format: (stats) => String((stats.lossesAgainstTied ?? 0) * -1),
	},
	{
		label: "OW%",
		description: "Opponents' set win percentage average",
		compare: (a, b) =>
			higherFirst(
				a.opponentSetWinPercentage ?? 0,
				b.opponentSetWinPercentage ?? 0,
			),
		format: (stats) => stats.opponentSetWinPercentage?.toFixed(2) ?? "",
	},
	{
		label: "W/L (M)",
		description: "Map wins and losses",
		compare: compareMapWinsAndLosses,
		format: formatMapWinsAndLosses,
	},
	{
		label: "OW% (M)",
		description: "Opponents' map win percentage average",
		// must rank below map wins so throwing maps is not optimal
		compare: (a, b) =>
			higherFirst(
				a.opponentMapWinPercentage ?? 0,
				b.opponentMapWinPercentage ?? 0,
			),
		format: (stats) => stats.opponentMapWinPercentage?.toFixed(2) ?? "",
	},
];

/** Compares two teams' stats by each tiebreaker in order, the first one that separates them decides. */
export function compare(
	tiebreakers: Tiebreaker[],
	a: TiebreakerStats,
	b: TiebreakerStats,
) {
	for (const tiebreaker of tiebreakers) {
		const result = tiebreaker.compare(a, b);
		if (result !== 0) return result;
	}

	return 0;
}

function higherFirst(a: number, b: number) {
	return Math.sign(b - a);
}

function lowerFirst(a: number, b: number) {
	return Math.sign(a - b);
}

// also map losses because we want a team who dropped more maps ranked lower
function compareMapWinsAndLosses(a: TiebreakerStats, b: TiebreakerStats) {
	return (
		higherFirst(a.mapWins, b.mapWins) || lowerFirst(a.mapLosses, b.mapLosses)
	);
}

function formatMapWinsAndLosses(stats: TiebreakerStats) {
	return `${stats.mapWins}/${stats.mapLosses}`;
}
