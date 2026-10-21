import type { UserMapModePreferences } from "~/db/tables-json";
import { matchMapList } from "~/features/sendouq-match/core/match.server";
import type { ModeShort, ModeWithStage } from "~/modules/in-game-lists/types";

type TeamPreferences = Array<{
	userId: number;
	preferences: UserMapModePreferences | null;
}>;

/**
 * Maps of a set between two shuffled teams, picked like SendouQ's from the players' match profile map
 * preferences, among the modes the host picked.
 */
export async function generate({
	alpha,
	bravo,
	modes,
	bestOf,
}: {
	alpha: TeamPreferences;
	bravo: TeamPreferences;
	modes: ModeShort[];
	bestOf: number;
}): Promise<ModeWithStage[]> {
	const maps = await matchMapList(
		{ id: 1, preferences: withPreferences(alpha) },
		{ id: 2, preferences: withPreferences(bravo) },
		modes,
		bestOf,
	);

	return maps.map(({ mode, stageId }) => ({ mode, stageId }));
}

function withPreferences(team: TeamPreferences) {
	return team.flatMap(({ userId, preferences }) =>
		preferences ? [{ userId, preferences }] : [],
	);
}
