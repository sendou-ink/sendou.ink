import type { TournamentLoaderData } from "../loaders/to.$id.server";

/**
 * Team keys that {@link serializeTournamentLoaderData} drops when null and
 * {@link parseTournamentLoaderData} restores. Null for most teams, so dropping
 * them trims the layout payload of big tournaments by a few gzipped kilobytes.
 */
const NULL_COMPACTED_TEAM_KEYS = [
	"seed",
	"inviteCode",
	"logoUrl",
	"activeRosterUserIds",
	"startingBracketIdx",
	"abDivision",
	"avgSeedingSkillOrdinal",
	"ownerUserId",
] as const;

type LayoutTeam = TournamentLoaderData["tournament"]["ctx"]["teams"][number];

/**
 * Serializes the tournament layout loader data, omitting null-valued team keys.
 * Counterpart of {@link parseTournamentLoaderData}, the only way the payload
 * should be read.
 */
export function serializeTournamentLoaderData(
	data: TournamentLoaderData,
): string {
	// JSON.stringify so that we skip expensive rr7 data serialization (hot path loader)
	return JSON.stringify({
		...data,
		tournament: {
			...data.tournament,
			ctx: {
				...data.tournament.ctx,
				teams: data.tournament.ctx.teams.map(compactTeamNulls),
			},
		},
	});
}

/**
 * Parses the tournament layout loader data serialized by
 * {@link serializeTournamentLoaderData}, restoring the null team keys it omitted.
 */
export function parseTournamentLoaderData(raw: string): TournamentLoaderData {
	const data = JSON.parse(raw) as TournamentLoaderData;

	for (const team of data.tournament.ctx.teams) {
		const teamRecord = team as Record<string, unknown>;
		for (const key of NULL_COMPACTED_TEAM_KEYS) {
			teamRecord[key] ??= null;
		}
	}

	return data;
}

function compactTeamNulls(team: LayoutTeam) {
	const compacted: Record<string, unknown> = { ...team };
	for (const key of NULL_COMPACTED_TEAM_KEYS) {
		if (compacted[key] === null) {
			delete compacted[key];
		}
	}

	return compacted as unknown as LayoutTeam;
}
