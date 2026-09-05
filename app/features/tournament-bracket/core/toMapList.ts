/** Map list generation for "TO pick": the map list is defined beforehand by the TO. */

import type { Tables } from "~/db/tables";
import type { TournamentRoundMaps } from "~/db/tables-json";
import * as MapList from "~/features/map-list-generator/core/MapList";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { RoundData } from "~/features/tournament-bracket/core/engine/types";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";

export type BracketMapCounts = Map<
	// round.groupId ->
	number,
	// round.number ->
	Map<number, { count: number; type: "BEST_OF" }>
>;

export interface GenerateTournamentRoundMaplistArgs {
	pool: Array<{ mode: ModeShort; stageId: StageId }>;
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

		result.set(round.id, {
			count,
			pickBan: args.roundsWithPickBan.has(round.id)
				? args.pickBanStyle
				: undefined,
			list:
				// teams pick
				args.pool.length === 0
					? null
					: // TO pick
						generator.next({
							amount: amountOfMapsToGenerate(),
							pattern,
						}).value,
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
	const groupIds = rounds.map((x) => x.groupId);
	const minGroupId = Math.min(...groupIds);
	const maxGroupId = Math.max(...groupIds);

	// winners bracket first, then grands, then losers bracket
	const doubleEliminationGroupRank = (groupId: number) => {
		if (groupId === minGroupId) return 0;
		if (groupId === maxGroupId) return 1;
		return 2;
	};

	return rounds.toSorted((a, b) => {
		if (type === "double_elimination") {
			const rankDiff =
				doubleEliminationGroupRank(a.groupId) -
				doubleEliminationGroupRank(b.groupId);
			if (rankDiff !== 0) return rankDiff;
		}
		if (type === "single_elimination") {
			// finals and 3rd place match last
			if (a.groupId !== b.groupId) return a.groupId - b.groupId;
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
	const groupId =
		type === "round_robin" || type === "swiss"
			? fullestGroupIdByCounts(counts)
			: round.groupId;

	const count = counts.get(groupId)?.get(round.number)?.count;
	if (typeof count === "undefined") {
		logger.warn(
			`No map count found for round ${round.number} (group ${round.groupId})`,
		);
		return 5;
	}

	return count;
}

function fullestGroupIdByCounts(counts: BracketMapCounts) {
	let fullestGroupId = counts.keys().next().value as number;
	for (const [groupId, roundCounts] of counts) {
		if (roundCounts.size > counts.get(fullestGroupId)!.size)
			fullestGroupId = groupId;
	}

	return fullestGroupId;
}
