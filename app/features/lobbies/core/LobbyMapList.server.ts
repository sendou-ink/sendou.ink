/**
 * Map list of a lobby set, generated when the set starts from the players' match profile map
 * preferences, and who of the players voted for its maps.
 */
import type { UserMapModePreferences } from "~/db/tables-json";
import * as MapVotes from "~/features/match-profile/core/MapVotes";
import { matchMapList } from "~/features/sendouq-match/core/match.server";
import type { ModeShort, ModeWithStage } from "~/modules/in-game-lists/types";
import type { TournamentMaplistSource } from "~/modules/tournament-map-list-generator/types";
import {
	LOBBY_SIDE_TEAM_ID,
	type LobbyMapSource,
	type LobbySide,
} from "../lobbies-constants";

type TeamPreferences = Array<{
	userId: number;
	preferences: UserMapModePreferences | null;
}>;

/**
 * Maps of a set between two shuffled teams, picked like SendouQ's from the players' match profile map
 * preferences, among the modes the host picked, each with the side(s) it was picked for. Continues from the maps already played in the lobby: those
 * are less likely to come up, recent ones not right away, and the set starts with a different mode than the last one played.
 */
export async function generate({
	alpha,
	bravo,
	modes,
	bestOf,
	playedMaps,
}: {
	alpha: TeamPreferences;
	bravo: TeamPreferences;
	modes: ModeShort[];
	bestOf: number;
	/** Maps reported in the lobby's earlier sets, oldest first, a map once per time played */
	playedMaps: ModeWithStage[];
}): Promise<Array<ModeWithStage & { source: LobbyMapSource }>> {
	const maps = await matchMapList(
		{ id: LOBBY_SIDE_TEAM_ID.ALPHA, preferences: withPreferences(alpha) },
		{ id: LOBBY_SIDE_TEAM_ID.BRAVO, preferences: withPreferences(bravo) },
		modes,
		bestOf,
		playedMaps,
	);

	return maps.map(({ mode, stageId, source }) => ({
		mode,
		stageId,
		source: lobbyMapSource(source),
	}));
}

function lobbyMapSource(source: TournamentMaplistSource): LobbyMapSource {
	if (source === LOBBY_SIDE_TEAM_ID.ALPHA) return "ALPHA";
	if (source === LOBBY_SIDE_TEAM_ID.BRAVO) return "BRAVO";
	if (source === "BOTH") return "BOTH";

	return "DEFAULT";
}

/**
 * Players who voted for the map: of the side(s) it was picked for, those whose match profile pool has it.
 * None for a map neither side voted for, or one of a set started before the sides were stored.
 */
export function voters({
	map,
	participants,
	profiles,
}: {
	map: ModeWithStage & { source: LobbyMapSource | null };
	participants: Array<{ userId: number; side: LobbySide | null }>;
	profiles: Array<{
		userId: number;
		mapModePreferences: UserMapModePreferences | null;
	}>;
}): number[] {
	return participants
		.filter(
			(participant) =>
				participant.side !== null &&
				(map.source === "BOTH" || map.source === participant.side),
		)
		.filter((participant) => {
			const preferences = profiles.find(
				(profile) => profile.userId === participant.userId,
			)?.mapModePreferences;

			return preferences ? MapVotes.votesFor(preferences, map) : false;
		})
		.map((participant) => participant.userId);
}

function withPreferences(team: TeamPreferences) {
	return team.flatMap(({ userId, preferences }) =>
		preferences ? [{ userId, preferences }] : [],
	);
}
