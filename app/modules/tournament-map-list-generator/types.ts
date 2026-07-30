import type { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { ModeShort, ModeWithStage } from "../in-game-lists/types";
import type { sourceTypes } from "./constants";

export interface TournamentMaplistInput {
	count: number;
	seed: string;
	teams: [
		{
			id: number;
			maps: MapPool;
		},
		{
			id: number;
			maps: MapPool;
		},
	];
	tiebreakerMaps: MapPool;
	modesIncluded: ModeShort[];
	followModeOrder?: boolean;
	recentlyPlayedMaps?: ModeWithStage[];
}

export type TournamentMaplistSource = number | (typeof sourceTypes)[number];

/**
 * How {@link TournamentMaplistSource} is stored in the database: one of the source types, or the
 * picking team's id in its string form. Convert with `serializeMaplistSource`/`parseMaplistSource`.
 */
export type DBTournamentMaplistSource =
	| (typeof sourceTypes)[number]
	// the team id, kept plain `string` so it survives Kysely's JSON helpers rewriting `${number}` to `number`
	| (string & {});

export type TournamentMapListMap = ModeWithStage & {
	source: TournamentMaplistSource;
	bannedByTournamentTeamId?: number;
};
