import * as R from "remeda";
import type { Standing } from "~/features/tournament-bracket/core/Bracket";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import invariant from "~/utils/invariant";
import { getBracketProgressionLabel } from "../tournament-utils";

export type TournamentStandingsResult =
	| { type: "single"; standings: Standing[] }
	| {
			type: "multi";
			standings: Array<{
				div: string;
				standings: Standing[];
			}>;
	  };

/** Converts tournament standings from single or multi-division format into a flat array */
export function flattenStandings(
	standingsResult: TournamentStandingsResult,
): Standing[] {
	return standingsResult.type === "single"
		? standingsResult.standings
		: standingsResult.standings.flatMap((div) => div.standings);
}

/**
 * Re-numbers placements in a sorted standings array so that tied placements stay
 * grouped (e.g. `[1, 1, 3, 3, 5]`) while non-tied positions reflect the true
 * number of teams above them. Useful after filtering or merging standings where
 * the original placement numbers no longer match the team count.
 *
 * Pass `offset` to shift every placement downwards — used when the returned
 * standings will be appended below standings from another bracket.
 */
export function reNumberPlacements<T extends { placement: number }>(
	standings: T[],
	offset = 0,
): T[] {
	let lastOriginalPlacement = 0;
	let currentPlacement = 0;

	return standings.map((standing, index) => {
		if (standing.placement !== lastOriginalPlacement) {
			lastOriginalPlacement = standing.placement;
			currentPlacement = index + 1;
		}
		return {
			...standing,
			placement: currentPlacement + offset,
		};
	});
}

/** Calculates SPR (Seed Performance Rating) - see https://web.archive.org/web/20250513034545/https://www.pgstats.com/articles/introducing-spr-and-uf */
export function calculateSPR({
	standings,
	teamId,
}: {
	standings: Standing[];
	teamId: number;
}) {
	const uniquePlacements = R.unique(
		standings.map((standing) => standing.placement),
	).sort((a, b) => a - b);

	const teamStanding = standings.find(
		(standing) => standing.team.id === teamId,
	);
	// defensive check to avoid crashing
	if (!teamStanding) {
		return 0;
	}

	const expectedPlacement =
		standings[(teamStanding.team.seed ?? 0) - 1]?.placement;
	// defensive check to avoid crashing
	if (!expectedPlacement) {
		return 0;
	}

	const teamPlacement = teamStanding.placement;
	const actualIndex = uniquePlacements.indexOf(teamPlacement);
	const expectedIndex = uniquePlacements.indexOf(expectedPlacement);

	return expectedIndex - actualIndex;
}

/** Every match the team played, in the order they were played in */
export function matchesPlayed({
	tournament,
	teamId,
}: {
	tournament: Tournament;
	teamId: number;
}) {
	const bracketsInPlayedOrder = R.sortBy(
		tournament.brackets,
		(bracket) => bracket.createdAt ?? Number.POSITIVE_INFINITY,
		(bracket) => bracket.idx,
	);

	const matches = bracketsInPlayedOrder.flatMap((bracket) =>
		bracket.data.match
			.filter(
				(match) =>
					match.opponent1 &&
					match.opponent2 &&
					(match.opponent1?.id === teamId || match.opponent2?.id === teamId) &&
					match.winnerSide,
			)
			.map((match) => ({
				...match,
				bracketIdx: bracket.idx,
			})),
	);

	return matches.map((match) => {
		const opponentId = (
			match.opponent1?.id === teamId ? match.opponent2?.id : match.opponent1?.id
		)!;
		const team = tournament.teamById(opponentId);

		const teamSide = match.opponent1?.id === teamId ? "opponent1" : "opponent2";
		const result: "win" | "loss" =
			match.winnerSide === teamSide ? "win" : "loss";

		return {
			id: match.id,
			// defensive fallback
			vsSeed: team?.seed ?? 0,
			result,
			bracketIdx: match.bracketIdx,
		};
	});
}

type PersistedResultRow = {
	tournamentTeamId: number;
	userId: number;
	placement: number;
	div: string | null;
};

/**
 * Standings of a finalized tournament reconstructed from the per-user results persisted at
 * finalization, instead of recomputing them from bracket match data. Returns null when the
 * persisted rows cannot back the standings (no rows, a team no longer in the tournament
 * context, or a division label the progression no longer produces) so the caller can fall
 * back to {@link tournamentStandings}.
 */
export function standingsFromPersistedResults({
	tournament,
	results,
}: {
	tournament: Tournament;
	results: PersistedResultRow[];
}): TournamentStandingsResult | null {
	if (results.length === 0) return null;

	const standings: Array<Standing & { div: string | null }> = [];

	for (const rows of Object.values(
		R.groupBy(results, (row) => row.tournamentTeamId),
	)) {
		const team = tournament.teamById(rows[0].tournamentTeamId);
		if (!team) return null;

		standings.push({
			team: { ...team, memberUserIds: rows.map((row) => row.userId) },
			placement: rows[0].placement,
			div: rows[0].div,
		});
	}

	const sorted = R.sortBy(
		standings,
		(standing) => standing.placement,
		(standing) => standing.team.seed ?? Number.POSITIVE_INFINITY,
	);

	if (sorted.every((standing) => standing.div === null)) {
		return { type: "single", standings: sorted };
	}

	const progression = tournament.ctx.settings.bracketProgression;
	const divs = Progression.hasAbDivisionsFinals(progression)
		? ["A", "B"]
		: Progression.startingBrackets(progression).map((bracketIdx) =>
				getBracketProgressionLabel(bracketIdx, progression),
			);
	const hasUnknownDiv = sorted.some(
		(standing) => standing.div === null || !divs.includes(standing.div),
	);
	if (hasUnknownDiv) return null;

	return {
		type: "multi",
		standings: divs.map((div) => ({
			div,
			standings: sorted.filter((standing) => standing.div === div),
		})),
	};
}

/**
 * Computes the standings for a given tournament by aggregating results from relevant brackets.
 *
 * For example if the tournament format is round robin (where 2 out of 4 teams per group advance) to single elimination,
 * the top teams are decided by the single elimination bracket, and the teams who failed to make the bracket are ordered
 * by their performance in the round robin group stage.
 *
 * Returns a discriminated union:
 * - For tournaments with a single starting bracket, returns type 'single' with overall standings
 * - For tournaments with multiple starting brackets, returns type 'multi' with standings per division
 */
export function tournamentStandings(
	tournament: Tournament,
): TournamentStandingsResult {
	const progression = tournament.ctx.settings.bracketProgression;
	const startingBracketIdxs = Progression.startingBrackets(progression);

	if (startingBracketIdxs.length <= 1) {
		const standings = tournamentStandingsForBracket(tournament, undefined);

		if (Progression.hasAbDivisionsFinals(progression)) {
			return {
				type: "multi",
				standings: [
					{
						div: "A",
						standings: reNumberPlacements(
							standings.filter((s) => s.team.abDivision === 0),
						),
					},
					{
						div: "B",
						standings: reNumberPlacements(
							standings.filter((s) => s.team.abDivision === 1),
						),
					},
				],
			};
		}

		return {
			type: "single",
			standings,
		};
	}

	return {
		type: "multi",
		standings: startingBracketIdxs.map((bracketIdx) => ({
			div: getBracketProgressionLabel(bracketIdx, progression),
			standings: tournamentStandingsForBracket(tournament, bracketIdx),
		})),
	};
}

/**
 * Computes the standings for a given tournament starting from a specific bracket.
 * If bracketIdx is undefined, computes overall standings for the entire tournament.
 * Otherwise, only includes brackets that are reachable from the given bracketIdx.
 */
function tournamentStandingsForBracket(
	tournament: Tournament,
	bracketIdx: number | undefined,
): Standing[] {
	let bracketIdxs: number[];

	const isSingleStartingBracket = typeof bracketIdx !== "number";

	if (isSingleStartingBracket) {
		bracketIdxs = Progression.bracketIdxsForStandings(
			tournament.ctx.settings.bracketProgression,
		);
	} else {
		const reachableBrackets = Progression.bracketsReachableFrom(
			bracketIdx,
			tournament.ctx.settings.bracketProgression,
		);
		const reachableSet = new Set(reachableBrackets);

		const allBracketIdxs = tournament.ctx.settings.bracketProgression
			.map((_, idx) => idx)
			.sort((a, b) => b - a);
		bracketIdxs = allBracketIdxs.filter((idx) => reachableSet.has(idx));
	}

	const result: Standing[] = [];
	const alreadyIncludedTeamIds = new Set<number>();

	const finalBracketIsOver = tournament.brackets.some(
		(bracket) => bracket.isFinals && bracket.everyMatchOver,
	);

	for (const idx of bracketIdxs) {
		const bracket = tournament.bracketByIdx(idx);
		invariant(bracket);

		// sometimes a bracket might not be played so then we ignore it from the standings
		if (isSingleStartingBracket && finalBracketIsOver && bracket.preview) {
			continue;
		}

		const standings = standingsToMergeable({
			alreadyIncludedTeamIds,
			standings: tiebrokenByUndergroundBrackets({
				tournament,
				bracketIdx: idx,
				standings: bracket.standings,
			}),
			teamsAboveFromAnotherBracketsCount: alreadyIncludedTeamIds.size,
		});
		result.push(...standings);

		for (const teamId of bracket.participantTournamentTeamIds) {
			alreadyIncludedTeamIds.add(teamId);
		}
		for (const teamId of bracket.teamsPendingCheckIn ?? []) {
			alreadyIncludedTeamIds.add(teamId);
		}
	}

	return result;
}

/**
 * Underground brackets are left out of the standings but the teams playing them are tied in their source
 * bracket (e.g. everyone who lost the quarterfinals shares the same placement), so their underground run
 * decides the order within each such tie. Teams that skipped the underground bracket stay tied last.
 *
 * An underground bracket that is still in progress is ignored, as the teams still alive in it have no
 * placement yet and would sort below the teams it already eliminated.
 */
function tiebrokenByUndergroundBrackets({
	tournament,
	bracketIdx,
	standings,
}: {
	tournament: Tournament;
	bracketIdx: number;
	standings: Standing[];
}): Standing[] {
	const undergroundPlacements = new Map<number, number>();

	for (const undergroundIdx of Progression.undergroundBracketIdxs(
		bracketIdx,
		tournament.ctx.settings.bracketProgression,
	)) {
		const underground = tournament.bracketByIdx(undergroundIdx);
		if (!underground?.everyMatchOver) continue;

		for (const standing of underground.standings) {
			if (undergroundPlacements.has(standing.team.id)) continue;

			undergroundPlacements.set(standing.team.id, standing.placement);
		}
	}

	if (undergroundPlacements.size === 0) return standings;

	const result: Standing[] = [];

	for (const tied of groupedByPlacement(standings)) {
		const sorted = R.sortBy(
			tied,
			(standing) =>
				undergroundPlacements.get(standing.team.id) ?? Number.POSITIVE_INFINITY,
		);

		let placement = tied[0].placement;
		let previousUndergroundPlacement: number | null = null;

		for (const [index, standing] of sorted.entries()) {
			const undergroundPlacement =
				undergroundPlacements.get(standing.team.id) ?? null;

			if (index > 0 && undergroundPlacement !== previousUndergroundPlacement) {
				placement = tied[0].placement + index;
			}
			previousUndergroundPlacement = undergroundPlacement;

			result.push({ ...standing, placement });
		}
	}

	return result;
}

function groupedByPlacement(standings: Standing[]): Standing[][] {
	const result: Standing[][] = [];

	for (const standing of standings) {
		const previous = result.at(-1);

		if (previous && previous[0].placement === standing.placement) {
			previous.push(standing);
		} else {
			result.push([standing]);
		}
	}

	return result;
}

function standingsToMergeable<
	T extends { team: { id: number }; placement: number },
>({
	alreadyIncludedTeamIds,
	standings,
	teamsAboveFromAnotherBracketsCount,
}: {
	alreadyIncludedTeamIds: Set<number>;
	standings: T[];
	teamsAboveFromAnotherBracketsCount: number;
}) {
	const filtered = standings.filter(
		(standing) => !alreadyIncludedTeamIds.has(standing.team.id),
	);

	// e.g. if standings start at 3rd place, this must mean there is 2 teams left to finish _this_ bracket
	const unfinishedTeamsCount = (standings.at(0)?.placement ?? 1) - 1;

	return reNumberPlacements(
		filtered,
		teamsAboveFromAnotherBracketsCount + unfinishedTeamsCount,
	);
}
