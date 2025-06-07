import type { Tables, TournamentRoundMaps } from "~/db/tables";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import type * as PickBan from "~/features/tournament-bracket/core/PickBan";
import { mapPickingStyleToModes } from "~/features/tournament/tournament-utils";
import type { Round } from "~/modules/brackets-model";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { TournamentMapListMap } from "~/modules/tournament-map-list-generator";
import {
	type TournamentMaplistSource,
	createTournamentMapList,
} from "~/modules/tournament-map-list-generator";
import { starterMap } from "~/modules/tournament-map-list-generator/starter-map";
import { syncCached } from "~/utils/cache.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";
import { findMapPoolByTeamId } from "../queries/findMapPoolByTeamId.server";
import { findTieBreakerMapPoolByTournamentId } from "../queries/findTieBreakerMapPoolByTournamentId.server";
import type { Bracket } from "./Bracket";

interface ResolveCurrentMapListArgs {
	tournamentId: number;
	mapPickingStyle: Tables["Tournament"]["mapPickingStyle"];
	/** @deprecated use maps.count instead */
	bestOf: 3 | 5 | 7;
	matchId: number;
	teams: [teamOneId: number, teamTwoId: number];
	maps: TournamentRoundMaps | null;
	pickBanEvents: Array<{
		mode: ModeShort;
		stageId: StageId;
		type: Tables["TournamentMatchPickBanEvent"]["type"];
	}>;
}

export function resolveMapList(
	args: ResolveCurrentMapListArgs,
): TournamentMapListMap[] {
	const baseMaps =
		args.mapPickingStyle === "TO"
			? args.maps!.list?.map((m) => ({ ...m, source: "TO" as const }))
			: // include team ids in the key to handle a case where match was reopened causing one of the teams to change
				syncCached(
					`${args.matchId}-${args.teams[0]}-${args.teams[1]}-${args.maps?.count}-${args.maps?.pickBan}`,
					() =>
						resolveFreshTeamPickedMapList(
							args as ResolveCurrentMapListArgs & {
								mapPickingStyle: Exclude<
									Tables["Tournament"]["mapPickingStyle"],
									"TO"
								>;
							},
						),
				);

	if (!baseMaps) return [];

	return baseMaps
		.map((map) => {
			return {
				...map,
				bannedByTournamentTeamId: resolveBannedByTeamId(args, map),
			};
		})
		.concat(
			...args.pickBanEvents
				.filter((event) => event.type === "PICK")
				.map((map) => ({
					mode: map.mode,
					stageId: map.stageId,
					source: "COUNTERPICK" as TournamentMaplistSource,
					bannedByTournamentTeamId: undefined,
				})),
		);
}

function resolveBannedByTeamId(
	args: ResolveCurrentMapListArgs,
	map: { stageId: StageId; mode: ModeShort },
) {
	if (args.maps?.pickBan !== "BAN_2") return;

	const [secondPicker, firstPicker] = args.teams;

	const banIdx = args.pickBanEvents.findIndex(
		(event) =>
			event.type === "BAN" &&
			event.mode === map.mode &&
			event.stageId === map.stageId,
	);

	if (banIdx === -1) return;
	if (banIdx === 0) return firstPicker;
	if (banIdx === 1) return secondPicker;

	logger.warn(`Unexpected ban index: ${banIdx}`);
	return;
}

export function resolveFreshTeamPickedMapList(
	args: ResolveCurrentMapListArgs & {
		mapPickingStyle: Exclude<Tables["Tournament"]["mapPickingStyle"], "TO">;
	},
) {
	const tieBreakerMapPool =
		args.mapPickingStyle === "AUTO_ALL"
			? findTieBreakerMapPoolByTournamentId(args.tournamentId)
			: [];

	const pickBanCount = (pickBan: PickBan.Type, count: number) => {
		switch (pickBan) {
			case "BAN_2":
				return count + 2;
			case "COUNTERPICK":
			case "COUNTERPICK_MODE_REPEAT_OK":
				return 1;
			default:
				assertUnreachable(pickBan);
		}
	};

	const count = () => {
		if (!args.maps?.count) return args.bestOf;

		if (args.maps.pickBan) {
			return pickBanCount(args.maps.pickBan, args.maps.count);
		}

		return args.maps.count;
	};

	if (count() === 1) {
		return starterMap({
			seed: String(args.matchId),
			modesIncluded: mapPickingStyleToModes(args.mapPickingStyle),
			tiebreakerMaps: new MapPool(tieBreakerMapPool),
			teams: [
				{
					id: args.teams[0],
					maps: new MapPool(findMapPoolByTeamId(args.teams[0])),
				},
				{
					id: args.teams[1],
					maps: new MapPool(findMapPoolByTeamId(args.teams[1])),
				},
			],
		});
	}

	try {
		return createTournamentMapList({
			count: count(),
			seed: String(args.matchId),
			modesIncluded: mapPickingStyleToModes(args.mapPickingStyle),
			tiebreakerMaps: new MapPool(tieBreakerMapPool),
			teams: [
				{
					id: args.teams[0],
					maps: new MapPool(findMapPoolByTeamId(args.teams[0])),
				},
				{
					id: args.teams[1],
					maps: new MapPool(findMapPoolByTeamId(args.teams[1])),
				},
			],
		});
	} catch (e) {
		console.error(
			"Failed to create map list. Falling back to default maps.",
			e,
		);

		return createTournamentMapList({
			count: count(),
			seed: String(args.matchId),
			modesIncluded: mapPickingStyleToModes(args.mapPickingStyle),
			tiebreakerMaps: new MapPool(tieBreakerMapPool),
			teams: [
				{
					id: -1,
					maps: new MapPool([]),
				},
				{
					id: -2,
					maps: new MapPool([]),
				},
			],
		});
	}
}

export function roundMapsFromInput({
	roundsFromDB,
	virtualRounds,
	maps,
	bracket,
}: {
	roundsFromDB: Round[];
	virtualRounds: Round[];
	maps: (TournamentRoundMaps & { roundId: number })[];
	bracket: Bracket;
}) {
	const expandedMaps =
		bracket.type === "round_robin" || bracket.type === "swiss"
			? expandMaps({ maps, virtualRounds })
			: maps;

	const virtualGroupIdToReal = (virtualGroupId: number) => {
		const minRealGroupId = Math.min(...roundsFromDB.map((r) => r.group_id));
		const minVirtualGroupId = Math.min(...virtualRounds.map((r) => r.group_id));

		return virtualGroupId - minVirtualGroupId + minRealGroupId;
	};

	return expandedMaps.map((map) => {
		const virtualRound = virtualRounds.find((r) => r.id === map.roundId);
		invariant(
			virtualRound,
			`No virtual round found for map with round id: ${map.roundId}`,
		);

		const realRoundId = roundsFromDB.find(
			(r) =>
				r.number === virtualRound.number &&
				r.group_id === virtualGroupIdToReal(virtualRound.group_id),
		)?.id;
		invariant(realRoundId, "No real round found for virtual round");

		return { ...map, roundId: realRoundId };
	});
}

function expandMaps({
	virtualRounds,
	maps,
}: {
	virtualRounds: Round[];
	maps: (TournamentRoundMaps & { roundId: number })[];
}) {
	const result: typeof maps = [];

	const mapsByNumber = maps.reduce(
		(acc, map) => {
			const number = virtualRounds.find((r) => r.id === map.roundId)?.number;
			invariant(number, "No number found for round id");

			acc.set(number, map);
			return acc;
		},
		new Map() as Map<number, (typeof maps)[number]>,
	);
	for (const round of virtualRounds) {
		const maps = mapsByNumber.get(round.number);
		invariant(maps, "No maps found for round number");

		result.push({
			...maps,
			roundId: round.id,
		});
	}

	return result;
}
