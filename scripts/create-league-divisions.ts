import "dotenv/config";
import { z } from "zod";
import { ADMIN_ID } from "~/constants";
import { db } from "~/db/sql";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

// xxx: load from remote url
const csv = `Team id,Team name,Div
1,Chimera,X
2,Drop it Like It's Hot,X
3,We Built This City,X
4,My Sweet Lord,X
5,Losing My Religion,X
6,The Joker,X
7,Mony Mony,X
8,Will You Love Me Tomorrow,X
9,The Wanderer,1
10,What's Going On?,1
11,Let's Dance,1
12,Just the Way You Are,1
13,Jive Talkin',1
14,Le Freak,1
15,There goes my baby,1
16,Why Do Fools Fall in Love?,1`;

const tournamentId = Number(process.argv[2]?.trim());

invariant(
	tournamentId && !Number.isNaN(tournamentId),
	"tournament id is required (argument 1)",
);

async function main() {
	console.time("create-league-divisions");

	const tournament = await tournamentFromDB({
		tournamentId,
		user: { id: ADMIN_ID },
	});
	invariant(tournament.isLeagueSignup, "Tournament is not a league signup");

	const teams = parseCsv(csv);
	for (const team of teams) {
		validateTeam(team, tournament);
	}
	validateDivs(teams);

	const grouped = Object.entries(Object.groupBy(teams, (t) => t.division)).sort(
		(a, b) => {
			const divAIndex = teams.findIndex((t) => t.division === a[0]);
			const divBIndex = teams.findIndex((t) => t.division === b[0]);

			return divAIndex - divBIndex;
		},
	);

	for (const [, divsTeams] of grouped) {
		divsTeams!.sort((a, b) => {
			const teamAIndex = teams.findIndex((t) => t.id === a.id);
			const teamBIndex = teams.findIndex((t) => t.id === b.id);

			return teamAIndex - teamBIndex;
		});
	}

	const calendarEvent = await db
		.selectFrom("CalendarEvent")
		.selectAll()
		.where("CalendarEvent.id", "=", tournament.ctx.eventId)
		.executeTakeFirstOrThrow();

	for (const [div, divsTeams] of grouped) {
		logger.info(`Creating division ${div}...`);

		const createdEvent = await CalendarRepository.create({
			parentTournamentId: tournament.ctx.id,
			authorId: tournament.ctx.author.id,
			bracketProgression: tournament.ctx.settings.bracketProgression,
			description: tournament.ctx.description,
			deadlines: tournament.ctx.settings.deadlines,
			discordInviteCode:
				tournament.ctx.discordUrl?.replace("https://discord.gg/", "") ?? null,
			mapPickingStyle: tournament.ctx.mapPickingStyle,
			name: `${tournament.ctx.name} - Division ${div}`,
			organizationId: tournament.ctx.organization?.id ?? null,
			rules: tournament.ctx.rules,
			startTimes: [dateToDatabaseTimestamp(tournament.ctx.startTime)],
			tags: null,
			tournamentToCopyId: tournament.ctx.id,
			avatarImgId: calendarEvent.avatarImgId ?? undefined,
			avatarFileName: undefined,
			mapPoolMaps:
				tournament.ctx.mapPickingStyle !== "TO"
					? tournament.ctx.tieBreakerMapPool
					: tournament.ctx.toSetMapPool,
			badges: [],
			enableNoScreenToggle: tournament.ctx.settings.enableNoScreenToggle,
			enableSubs: false,
			isInvitational: true,
			autonomousSubs: false,
			isRanked: tournament.ctx.settings.isRanked,
			minMembersPerTeam: tournament.ctx.settings.minMembersPerTeam,
			regClosesAt: tournament.ctx.settings.regClosesAt,
			requireInGameNames: tournament.ctx.settings.requireInGameNames,
			bracketUrl: "https://sendou.ink",
			isFullTournament: true,
			autoValidateAvatar: true,
			// these come from progression
			swissGroupCount: undefined,
			swissRoundCount: undefined,
			teamsPerGroup: undefined,
			thirdPlaceMatch: undefined,
		});

		for (const team of divsTeams!) {
			await TournamentTeamRepository.copyFromAnotherTournament({
				destinationTournamentId: createdEvent.tournamentId!,
				tournamentTeamId: team.id,
			});
		}

		logger.info(`Created division ${div} (id: ${createdEvent.tournamentId})`);
	}

	console.timeEnd("create-league-divisions");
}

const csvSchema = z.array(
	z.object({
		"Team id": z.coerce.number(),
		Div: z.string(),
	}),
);

type ParsedTeam = ReturnType<typeof parseCsv>[number];

function parseCsv(csv: string) {
	const lines = csv.split("\n");
	const headers = lines[0].split(",");
	const rows = lines.slice(1).map((line) => {
		const row = line.split(",");
		return headers.reduce(
			(acc, header, i) => {
				acc[header] = row[i];
				return acc;
			},
			{} as Record<string, string>,
		);
	});

	const validated = csvSchema.parse(rows);

	return validated.map((row) => ({
		id: row["Team id"],
		division: row.Div,
	}));
}

function validateTeam(team: ParsedTeam, tournament: Tournament) {
	invariant(
		tournament.ctx.teams.some((t) => t.id === team.id),
		`Team with id ${team.id} not found in tournament`,
	);
}

const MIN_TEAMS_COUNT_PER_DIV = 6;
function validateDivs(teams: ParsedTeam[]) {
	const counts = teams.reduce(
		(acc, team) => {
			acc[team.division] = (acc[team.division] ?? 0) + 1;
			return acc;
		},
		{} as Record<string, number>,
	);

	for (const [div, count] of Object.entries(counts)) {
		invariant(
			count >= MIN_TEAMS_COUNT_PER_DIV,
			`Division ${div} has ${count} teams, expected at least ${MIN_TEAMS_COUNT_PER_DIV}`,
		);
	}
}

main();
