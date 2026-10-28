/**
 * Map list of a lobby set, generated when the set starts from the players' match profile map
 * preferences.
 */
import type { UserMapModePreferences } from "~/db/tables-json";
import { matchMapList } from "~/features/sendouq-match/core/match.server";
import type { ModeShort, ModeWithStage } from "~/modules/in-game-lists/types";

type TeamPreferences = Array<{
	userId: number;
	preferences: UserMapModePreferences | null;
}>;

/**
 * Maps of a set between two shuffled teams, picked like SendouQ's from the players' match profile map
 * preferences, among the modes the host picked. Continues from the maps already played in the lobby: those
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
}): Promise<ModeWithStage[]> {
	const maps = await matchMapList(
		{ id: 1, preferences: withPreferences(alpha) },
		{ id: 2, preferences: withPreferences(bravo) },
		modes,
		bestOf,
		playedMaps,
	);

	return maps.map(({ mode, stageId }) => ({ mode, stageId }));
}

function withPreferences(team: TeamPreferences) {
	return team.flatMap(({ userId, preferences }) =>
		preferences ? [{ userId, preferences }] : [],
	);
}
