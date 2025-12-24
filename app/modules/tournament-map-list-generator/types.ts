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

export type TournamentMapListMap = ModeWithStage & {
	source: TournamentMaplistSource;
	bannedByTournamentTeamId?: number;
};
