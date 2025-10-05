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
}

export type TournamentRoundMapList = ReturnType<
	typeof generateTournamentRoundMaplist
>;

// TODO: future improvement could be slightly biasing against maps that appear in slots that are not guaranteed to be played
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

	const generator = MapList.generate({ mapPool: new MapPool(args.pool) });
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

			assertUnreachable(args.pickBanStyle);
		};

		const pattern = !args.pickBanStyle ? args.patterns.get(count) : undefined;

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
	rounds: Round[],
	type: Tables["TournamentStage"]["type"],
) {
	if (type !== "round_robin" && type !== "swiss") return rounds;

	// highest group id because lower group id's can have byes that higher don't
	const highestGroupId = Math.max(...rounds.map((x) => x.group_id));
	return rounds.filter((x) => x.group_id === highestGroupId);
}

function sortRounds(rounds: Round[], type: Tables["TournamentStage"]["type"]) {
	return rounds.slice().sort((a, b) => {
		if (type === "double_elimination") {
			// grands last
			const maxGroupId = Math.max(...rounds.map((x) => x.group_id));
			if (a.group_id === maxGroupId && b.group_id !== maxGroupId) return 1;
			if (a.group_id !== maxGroupId && b.group_id === maxGroupId) return -1;
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
	// with rr/swiss we just take the first group id
	// as every group has the same map list
	const groupId =
		type === "round_robin" || type === "swiss"
			? Math.max(...Array.from(counts.keys()))
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
