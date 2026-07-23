import type { Tables, TournamentRoundMaps } from "~/db/tables";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { mapPickingStyleToModes } from "~/features/tournament/tournament-utils";
import type * as PickBan from "~/features/tournament-bracket/core/PickBan";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { generateBalancedMapList } from "~/modules/tournament-map-list-generator/balanced-map-list";
import { starterMap } from "~/modules/tournament-map-list-generator/starter-map";
import type {
	TournamentMapListMap,
	TournamentMaplistSource,
} from "~/modules/tournament-map-list-generator/types";
import { syncCached } from "~/utils/cache.server";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";

interface ResolveCurrentMapListArgs {
	tournamentId: number;
	mapPickingStyle: Tables["Tournament"]["mapPickingStyle"];
	matchId: number;
	teams: [teamOneId: number, teamTwoId: number];
	mapPoolByTeamId: (
		teamId: number,
	) => Array<{ mode: ModeShort; stageId: StageId }>;
	maps: TournamentRoundMaps;
	tieBreakerMapPool: Array<{ mode: ModeShort; stageId: StageId }>;
	pickBanEvents: Array<{
		mode: ModeShort | null;
		stageId: StageId | null;
		type: Tables["TournamentMatchPickBanEvent"]["type"];
	}>;
	/** Maps that both teams (interleaved) have recently played in the tournament with the most recent being first. */
	recentlyPlayedMaps?: Array<{ mode: ModeShort; stageId: StageId }>;
}

export function resolveMapList(
	args: ResolveCurrentMapListArgs,
): TournamentMapListMap[] {
	// CUSTOM flow: map list is built from pick/ban events
	if (args.maps.pickBan === "CUSTOM") {
		return resolveCustomMapList(args);
	}

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
				.filter(
					(
						event,
					): event is typeof event & { mode: ModeShort; stageId: StageId } =>
						event.mode !== null && event.stageId !== null,
				)
				.map((map) => ({
					mode: map.mode,
					stageId: map.stageId,
					source: "COUNTERPICK" as TournamentMaplistSource,
					bannedByTournamentTeamId: undefined,
				})),
		);
}

function resolveCustomMapList(
	args: ResolveCurrentMapListArgs,
): TournamentMapListMap[] {
	return args.pickBanEvents
		.filter((event) => event.type === "PICK" || event.type === "ROLL")
		.filter(
			(event): event is typeof event & { mode: ModeShort; stageId: StageId } =>
				event.mode !== null && event.stageId !== null,
		)
		.map((event) => ({
			mode: event.mode,
			stageId: event.stageId,
			source: (event.type === "ROLL"
				? "ROLL"
				: "COUNTERPICK") as TournamentMaplistSource,
			bannedByTournamentTeamId: undefined,
		}));
}

export function mapListFromResults(
	results: Array<{
		mode: ModeShort;
		stageId: StageId;
		source: string;
	}>,
): TournamentMapListMap[] {
	return results.map((result) => {
		const parsedSource: TournamentMaplistSource = /^\d+$/.test(result.source)
			? Number(result.source)
			: (result.source as TournamentMaplistSource);

		return {
			mode: result.mode,
			stageId: result.stageId,
			source: parsedSource,
			// Banned maps are not relevant for completed matches
			bannedByTournamentTeamId: undefined,
		};
	});
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

function resolveFreshTeamPickedMapList(
	args: ResolveCurrentMapListArgs & {
		mapPickingStyle: Exclude<Tables["Tournament"]["mapPickingStyle"], "TO">;
	},
) {
	const tieBreakerMapPool =
		args.mapPickingStyle === "AUTO_ALL" ? args.tieBreakerMapPool : [];

	const pickBanCount = (pickBan: PickBan.Type, count: number) => {
		switch (pickBan) {
			case "BAN_2":
				return count + 2;
			case "COUNTERPICK":
			case "COUNTERPICK_MODE_REPEAT_OK":
				return 1;
			case "CUSTOM":
				return 0;
			default:
				assertUnreachable(pickBan);
		}
	};

	const count = () => {
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
					maps: new MapPool(args.mapPoolByTeamId(args.teams[0])),
				},
				{
					id: args.teams[1],
					maps: new MapPool(args.mapPoolByTeamId(args.teams[1])),
				},
			],
			recentlyPlayedMaps: args.recentlyPlayedMaps,
		});
	}

	try {
		return generateBalancedMapList({
			count: count(),
			seed: String(args.matchId),
			modesIncluded: mapPickingStyleToModes(args.mapPickingStyle),
			tiebreakerMaps: new MapPool(tieBreakerMapPool),
			teams: [
				{
					id: args.teams[0],
					maps: new MapPool(args.mapPoolByTeamId(args.teams[0])),
				},
				{
					id: args.teams[1],
					maps: new MapPool(args.mapPoolByTeamId(args.teams[1])),
				},
			],
			recentlyPlayedMaps: args.recentlyPlayedMaps,
		});
	} catch (e) {
		logger.error("Failed to create map list. Falling back to default maps.", e);

		return generateBalancedMapList({
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
			recentlyPlayedMaps: args.recentlyPlayedMaps,
		});
	}
}
