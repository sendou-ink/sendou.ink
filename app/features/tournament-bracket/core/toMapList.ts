/** Map list generation for "TO pick": the map list is defined beforehand by the TO. For "team pick" only the mode order is generated, the maps come from the teams' picks. */

import type { Tables } from "~/db/tables";
import type { TournamentRoundMaps } from "~/db/tables-json";
import * as MapList from "~/features/map-list-generator/core/MapList";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { RoundData } from "~/features/tournament-bracket/core/engine/types";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";

export type BracketMapCounts = Map<
	// roundSetKey(round) ->
	string,
	// round.number ->
	Map<number, { count: number; type: "BEST_OF" }>>;

/** Identifies the rounds numbered together: a round robin/swiss group's rounds, or one section of an elimination group. */
export function roundSetKey(round: Pick<RoundData, "groupId" | "section">) {
	return round.section
		? `${round.groupId}:${round.section}`
		: `${round.groupId}`;
}

const ELIMINATION_SECTION_PLAY_ORDER: Record<
	NonNullable<RoundData["section"]>,
	number
> = {
	winners: 0,
	finals: 1,
	losers: 2,
};

export interface GenerateTournamentRoundMaplistArgs {
	/** The tournament's effective map pool, see `Tournament.mapPool`. */
	pool: Array<{ mode: ModeShort; stageId: StageId }>;
	/** Teams pick the maps: rounds get a mode order from the pattern instead of a map list. */
	teamsPickMaps: boolean;
	rounds: RoundData[];
	mapCounts: BracketMapCounts;
	type: Tables["TournamentStage"]["type"];
	roundsWithPickBan: Set<number>;
	pickBanStyle: TournamentRoundMaps["pickBan"];
	patterns: Map<number, string>;
	countType: TournamentRoundMaps["type"];
}

export type TournamentRoundMapList = ReturnType<
	typeof generateTournamentRoundMaplist
>;

export function generateTournamentRoundMaplist(
	args: GenerateTournamentRoundMaplistArgs,
) {
	// round robin groups share the map list
	const filteredRounds = getFilteredRounds(args.rounds, args.type);

	// in the typical play order, so maps can be spaced out
	const sortedRounds = sortRounds(filteredRounds, args.type);

	//                roundId
	const result: Map<number, Omit<TournamentRoundMaps, "type">> = new Map();

	const generator = MapList.generate({
		mapPool: new MapPool(args.pool),
		considerGuaranteed: args.countType === "BEST_OF",
	});
	generator.next();

	for (const round of sortedRounds.values()) {
		const count = resolveRoundMapCount(round, args.mapCounts, args.type);

		const amountOfMapsToGenerate = () => {
			if (!args.roundsWithPickBan.has(round.id) || !args.pickBanStyle) {
				return count;
			}
			if (
				args.pickBanStyle === "COUNTERPICK" ||
				args.pickBanStyle === "COUNTERPICK_MODE_REPEAT_OK"
			) {
				return 1;
			}
			if (args.pickBanStyle === "BAN_2") return count + 2;
			if (args.pickBanStyle === "CUSTOM") return 0;

			assertUnreachable(args.pickBanStyle);
		};

		const pattern = args.patterns.get(count);

		const generated = () =>
			generator.next({
				amount: amountOfMapsToGenerate(),
				pattern,
			}).value;

		if (args.teamsPickMaps) {
			result.set(round.id, {
				count,
				pickBan: args.roundsWithPickBan.has(round.id)
					? args.pickBanStyle
					: undefined,
				list: null,
				modes: generated().map((map) => map.mode),
			});
			continue;
		}

		result.set(round.id, {
			count,
			pickBan: args.roundsWithPickBan.has(round.id)
				? args.pickBanStyle
				: undefined,
			list: args.pool.length === 0 ? null : generated(),
		});
	}

	return result;
}

function getFilteredRounds(
	rounds: RoundData[],
	type: Tables["TournamentStage"]["type"],
) {
	if (type !== "round_robin" && type !== "swiss") return rounds;

	// groups can have different round counts (e.g. groups of 3 and 2), the one with the most rounds
	// covers every round number and its map list is shared with the smaller groups
	const fullestGroupId = fullestGroupIdByRounds(rounds);
	return rounds.filter((x) => x.groupId === fullestGroupId);
}

function fullestGroupIdByRounds(rounds: RoundData[]) {
	const roundCountByGroup = new Map<number, number>();
	for (const round of rounds) {
		roundCountByGroup.set(
			round.groupId,
			(roundCountByGroup.get(round.groupId) ?? 0) + 1,
		);
	}

	let fullestGroupId = rounds[0].groupId;
	for (const [groupId, count] of roundCountByGroup) {
		if (count > roundCountByGroup.get(fullestGroupId)!)
			fullestGroupId = groupId;
	}

	return fullestGroupId;
}

function sortRounds(
	rounds: RoundData[],
	type: Tables["TournamentStage"]["type"],
) {
	// winners bracket first, then grands (or the 3rd place match), then losers bracket
	const sectionRank = (round: RoundData) =>
		round.section ? ELIMINATION_SECTION_PLAY_ORDER[round.section] : 0;

	return rounds.toSorted((a, b) => {
		if (type === "double_elimination" || type === "single_elimination") {
			const rankDiff = sectionRank(a) - sectionRank(b);
			if (rankDiff !== 0) return rankDiff;
		}

		return a.number - b.number;
	});
}

function resolveRoundMapCount(
	round: RoundData,
	counts: BracketMapCounts,
	type: Tables["TournamentStage"]["type"],
) {
	// rr/swiss groups share the map list, the one with the most rounds covers every round number
	const key =
		type === "round_robin" || type === "swiss"
			? fullestRoundSetKeyByCounts(counts)
			: roundSetKey(round);

	const count = counts.get(key)?.get(round.number)?.count;
	if (typeof count === "undefined") {
		logger.warn(
			`No map count found for round ${round.number} (group ${round.groupId}, section ${round.section})`,
		);
		return 5;
	}

	return count;
}

function fullestRoundSetKeyByCounts(counts: BracketMapCounts) {
	let fullestKey = counts.keys().next().value as string;
	for (const [key, roundCounts] of counts) {
		if (roundCounts.size > counts.get(fullestKey)!.size) fullestKey = key;
	}

	return fullestKey;
}
