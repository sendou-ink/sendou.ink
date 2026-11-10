import { cachified } from "@epic-web/cachified";
import { hoursToMilliseconds, subDays } from "date-fns";
import * as R from "remeda";
import { cache, ttl } from "~/utils/cache.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import * as Series from "./Series";

const CACHE_KEY = "series-team-counts";
/** How old an edition can be and still say something about the next one. */
const LOOKBACK_DAYS = 90;
/** How many of a series' latest editions the typical count is taken from. */
const EDITIONS_CONSIDERED = 3;

interface Tournament {
	organizationId: number | null;
	name: string;
	/** Teams registered so far. */
	teamCount: number;
}

interface SeriesTeamCounts {
	substringMatches: Array<string>;
	teamCounts: Array<number>;
}

/** Team count a tournament is *expected* to draw: registered count raised (never lowered) to the median of the last {@link EDITIONS_CONSIDERED} editions. */
export async function lookup() {
	const seriesByOrganizationId = await cachedSeriesTeamCounts();

	return (tournament: Tournament) => {
		if (!tournament.organizationId) return tournament.teamCount;

		const series = seriesByOrganizationId.get(tournament.organizationId);
		if (!series) return tournament.teamCount;

		const match = Series.findByEventName({
			series,
			eventName: tournament.name,
		});
		if (!match) return tournament.teamCount;

		return Math.max(
			tournament.teamCount,
			R.median(match.teamCounts) ?? tournament.teamCount,
		);
	};
}

function cachedSeriesTeamCounts() {
	return cachified({
		key: CACHE_KEY,
		cache,
		ttl: ttl(hoursToMilliseconds(2)),
		getFreshValue: seriesTeamCounts,
	});
}

async function seriesTeamCounts() {
	const series = await TournamentOrganizationRepository.findAllSeries();
	const tournaments =
		await TournamentOrganizationRepository.findAllOrganizedTournamentTeamCounts(
			{
				startedAfter: dateToDatabaseTimestamp(
					subDays(new Date(), LOOKBACK_DAYS),
				),
			},
		);

	const result = new Map<number, Array<SeriesTeamCounts>>();
	for (const row of series) {
		const teamCounts = tournaments
			.filter(
				(tournament) =>
					tournament.organizationId === row.organizationId &&
					Series.matchesEventName({ series: row, eventName: tournament.name }),
			)
			.slice(-EDITIONS_CONSIDERED)
			.map((tournament) => tournament.teamCount);

		if (teamCounts.length === 0) continue;

		const existing = result.get(row.organizationId) ?? [];
		existing.push({ substringMatches: row.substringMatches, teamCounts });
		result.set(row.organizationId, existing);
	}

	return result;
}
