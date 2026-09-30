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
	/** The tournament's effective map pool, where the random neutral maps are drawn from. */
	pool: MapPool;
	modesIncluded: ModeShort[];
	/** Fixed mode of each slot. Without it the modes rotate in `modesIncluded` order from a seeded start. */
	modeOrder?: ModeShort[] | null;
	recentlyPlayedMaps?: ModeWithStage[];
}

export type TournamentMaplistSource = number | (typeof sourceTypes)[number];

/** {@link TournamentMaplistSource} as stored: a source type or the picking team's id as a string. See `serializeMaplistSource`/`parseMaplistSource`. */
export type DBTournamentMaplistSource =
	| (typeof sourceTypes)[number]
	// the team id, kept plain `string` so it survives Kysely's JSON helpers rewriting `${number}` to `number`
	| (string & {});

export type TournamentMapListMap = ModeWithStage & {
	source: TournamentMaplistSource;
	bannedByTournamentTeamId?: number;
};
