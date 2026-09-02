import * as R from "remeda";
import type { Standing } from "~/features/tournament-bracket/core/Bracket";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import invariant from "~/utils/invariant";
import { getBracketProgressionLabel } from "../tournament-utils";

const MATCH_SIDES = ["opponent1", "opponent2"] as const;

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
 * Re-numbers placements of sorted standings keeping ties grouped (`[1, 1, 3, 3, 5]`), for after
 * filtering or merging. `offset` shifts every placement down, for appending below another bracket's standings.
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

/**
 * SPR (Seed Performance Rating) of every team in the standings, keyed by tournament team id.
 * See https://web.archive.org/web/20250513034545/https://www.pgstats.com/articles/introducing-spr-and-uf
 */
export function sprByTeamId(standings: Standing[]): Map<number, number> {
	const indexByPlacement = new Map(
		R.unique(standings.map((standing) => standing.placement))
			.sort((a, b) => a - b)
			.map((placement, index) => [placement, index]),
	);

	const result = new Map<number, number>();

	for (const standing of standings) {
		const expectedPlacement =
			standings[(standing.team.seed ?? 0) - 1]?.placement;
		const expectedIndex = expectedPlacement
			? indexByPlacement.get(expectedPlacement)
			: undefined;
		const actualIndex = indexByPlacement.get(standing.placement);

		if (typeof expectedIndex !== "number" || typeof actualIndex !== "number") {
			result.set(standing.team.id, 0);
			continue;
		}

		result.set(standing.team.id, expectedIndex - actualIndex);
	}

	return result;
}

export type MatchPlayed = {
	id: number;
	vsSeed: number;
	result: "win" | "loss";
	bracketIdx: number;
};

/**
 * Every match each team played, in the order they were played in, keyed by tournament team id.
 * Teams that played no match are absent from the map.
 */
export function matchesPlayedByTeamId(
	tournament: Tournament,
): Map<number, MatchPlayed[]> {
	const bracketsInPlayedOrder = R.sortBy(
		tournament.brackets,
		(bracket) => bracket.createdAt ?? Number.POSITIVE_INFINITY,
		(bracket) => bracket.idx,
	);

	const seeds = new Map<number, number>();
	const seedOf = (teamId: number) => {
		const cached = seeds.get(teamId);
		if (typeof cached === "number") return cached;

		const seed = tournament.teamById(teamId)?.seed ?? 0;
		seeds.set(teamId, seed);

		return seed;
	};

	const result = new Map<number, MatchPlayed[]>();

	for (const bracket of bracketsInPlayedOrder) {
		for (const match of bracket.data.match) {
			if (!match.winnerSide) continue;

			for (const side of MATCH_SIDES) {
				const teamId = match[side]?.id;
				const opponentId =
					match[side === "opponent1" ? "opponent2" : "opponent1"]?.id;
				if (typeof teamId !== "number" || typeof opponentId !== "number") {
					continue;
				}

				const played = result.get(teamId) ?? [];
				played.push({
					id: match.id,
					vsSeed: seedOf(opponentId),
					result: match.winnerSide === side ? "win" : "loss",
					bracketIdx: bracket.idx,
				});
				result.set(teamId, played);
			}
		}
	}

	return result;
}

type PersistedResultRow = {
	tournamentTeamId: number;
	userId: number;
	placement: number;
	div: string | null;
};

/**
 * Standings of a finalized tournament from the per-user results persisted at finalization. Null
 * when those can't back the standings (no rows, a team no longer in the tournament, a division
 * label the progression no longer produces) so the caller can fall back to {@link tournamentStandings}.
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
 * Standings aggregated across brackets: e.g. in RR → SE the top teams come from the SE bracket and
 * the teams that missed it are ordered by their group performance. Type `single` with overall
 * standings for one starting bracket, `multi` with standings per division for several.
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

/** Standings over the brackets reachable from `bracketIdx`, or the whole tournament when undefined. */
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

		// a bracket that never got played is left out
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
 * Underground brackets are left out of the standings, but their teams are tied in the source bracket
 * (e.g. all quarterfinal losers), so the underground run orders each such tie; teams that skipped it
 * stay tied last. An underground bracket still in progress is ignored: its live teams have no
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
