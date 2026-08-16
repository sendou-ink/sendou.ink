import * as v from "valibot";
import type { SkillTeamIdentifier } from "#lib/features/mmr/mmr-utils.ts";
import {
	SEASONAL_LEADERBOARD_TYPES,
	XP_LEADERBOARD_TYPES,
} from "./leaderboards-constants.ts";

export const leaderboardsQuerySchema = v.object({
	type: v.picklist(SEASONAL_LEADERBOARD_TYPES),
	season: v.nullable(v.pipe(v.number(), v.integer())),
});

export const xpLeaderboardTypeSchema = v.picklist(XP_LEADERBOARD_TYPES);

export type LeaderboardsQueryArgs = v.InferOutput<
	typeof leaderboardsQuerySchema
>;

export const teamLeaderboardEntrySchema = v.object({
	season: v.pipe(v.number(), v.integer(), v.minValue(0)),
	identifier: v.pipe(
		v.string(),
		v.regex(/^\d+-\d+-\d+-\d+$/),
		v.transform((value) => value as SkillTeamIdentifier),
	),
});
