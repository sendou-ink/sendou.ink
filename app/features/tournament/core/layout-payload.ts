import type { TournamentLoaderData } from "../loaders/to.$id.server";

/** Team keys dropped when null and restored on parse; null for most teams, saving big tournaments a few gzipped kB. */
const NULL_COMPACTED_TEAM_KEYS = [
	"seed",
	"logoUrl",
	"activeRosterUserIds",
	"startingBracketIdx",
	"abDivision",
	"avgSeedingSkillOrdinal",
	"ownerUserId",
] as const;

type LayoutTeam = TournamentLoaderData["tournament"]["ctx"]["teams"][number];

/** Serializes the layout loader data omitting null team keys; read only via {@link parseTournamentLoaderData}. */
export function serializeTournamentLoaderData(
	data: TournamentLoaderData,
): string {
	// plain JSON.stringify skips the expensive rr7 data serialization (hot path loader)
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

/** Parses {@link serializeTournamentLoaderData} output, restoring the omitted null team keys. */
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
