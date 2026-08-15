import { z } from "zod";
import type { SkillTeamIdentifier } from "~/features/mmr/mmr-utils";
import { _action } from "~/utils/zod";

const teamLeaderboardEntry = {
	season: z.coerce.number().int().nonnegative(),
	identifier: z
		.string()
		.regex(/^\d+-\d+-\d+-\d+$/)
		.pipe(z.custom<SkillTeamIdentifier>()),
};

export const leaderboardsActionSchema = z.union([
	z.object({
		_action: _action("SKIP_TEAM"),
		...teamLeaderboardEntry,
	}),
	z.object({
		_action: _action("UNSKIP_TEAM"),
		...teamLeaderboardEntry,
	}),
]);
