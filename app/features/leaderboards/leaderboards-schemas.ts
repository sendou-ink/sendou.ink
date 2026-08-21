import * as v from "valibot";
import type { SkillTeamIdentifier } from "~/features/mmr/mmr-utils";
import { _action, coerceNumber } from "~/utils/schema";

const teamLeaderboardEntry = {
	season: v.pipe(coerceNumber(), v.integer(), v.minValue(0)),
	identifier: v.pipe(
		v.string(),
		v.regex(/^\d+-\d+-\d+-\d+$/),
		v.custom<SkillTeamIdentifier>(() => true),
	),
};

export const leaderboardsActionSchema = v.union([
	v.object({
		_action: _action("SKIP_TEAM"),
		...teamLeaderboardEntry,
	}),
	v.object({
		_action: _action("UNSKIP_TEAM"),
		...teamLeaderboardEntry,
	}),
]);
