/** Map list generation logic for "TO pick" as in the map list is defined beforehand by TO and teams don't pick */

import type { Tables, TournamentRoundMaps } from "~/db/tables";
import * as MapList from "~/features/map-list-generator/core/MapList";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { Round } from "~/modules/brackets-model";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";

export type BracketMapCounts = Map<
	// round.group_id ->
	number,
	// round.number ->
	Map<number, { count: number; type: "BEST_OF" }>
>;

export interface GenerateTournamentRoundMaplistArgs {
	pool: Array<{ mode: ModeShort; stageId: StageId }>;
	rounds: Round[];
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
	// in round robin different group ids represent different groups
	// but they share the map list
	const filteredRounds = getFilteredRounds(args.rounds, args.type);

	// sort rounds in a way that allows us to space maps out
	// so in the typical order that people play out the tournament
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

export function getFilteredRounds(
	rounds: Round[],
	type: Tables["TournamentStage"]["type"],
) {
	if (type !== "round_robin" && type !== "swiss") return rounds;

	// Groups can have different round counts when teams don't divide evenly
	// (e.g. groups of 3 and 2). Use the group with the most rounds: it covers
	// every round number and its map list is shared with the smaller groups.
	const fullestGroupId = fullestGroupIdByRounds(rounds);
	return rounds.filter((x) => x.group_id === fullestGroupId);
}

function fullestGroupIdByRounds(rounds: Round[]) {
	const roundCountByGroup = new Map<number, number>();
	for (const round of rounds) {
		roundCountByGroup.set(
			round.group_id,
			(roundCountByGroup.get(round.group_id) ?? 0) + 1,
		);
	}

	let fullestGroupId = rounds[0].group_id;
	for (const [groupId, count] of roundCountByGroup) {
		if (count > roundCountByGroup.get(fullestGroupId)!)
			fullestGroupId = groupId;
	}

	return fullestGroupId;
}

function sortRounds(rounds: Round[], type: Tables["TournamentStage"]["type"]) {
	const groupIds = rounds.map((x) => x.group_id);
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
				doubleEliminationGroupRank(a.group_id) -
				doubleEliminationGroupRank(b.group_id);
			if (rankDiff !== 0) return rankDiff;
		}
		if (type === "single_elimination") {
			// finals and 3rd place match last
			if (a.group_id !== b.group_id) return a.group_id - b.group_id;
		}

		return a.number - b.number;
	});
}

function resolveRoundMapCount(
	round: Round,
	counts: BracketMapCounts,
	type: Tables["TournamentStage"]["type"],
) {
	// with rr/swiss every group shares the same map list, so use the group with
	// the most rounds since it is the one that covers every round number
	const groupId =
		type === "round_robin" || type === "swiss"
			? fullestGroupIdByCounts(counts)
			: round.group_id;

	const count = counts.get(groupId)?.get(round.number)?.count;
	if (typeof count === "undefined") {
		logger.warn(
			`No map count found for round ${round.number} (group ${round.group_id})`,
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
