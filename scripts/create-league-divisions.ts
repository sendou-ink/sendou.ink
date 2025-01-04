// xxx: implement

import "dotenv/config";
import { z } from "zod";
import { ADMIN_ID } from "~/constants";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import invariant from "~/utils/invariant";

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

	const grouped = Object.groupBy(teams, (t) => t.division);

	for (const [div, _teams = []] of Object.entries(grouped)) {
		await CalendarRepository.create({
			authorId: tournament.ctx.author.id,
			bracketProgression: tournament.ctx.settings.bracketProgression,
			description: tournament.ctx.description,
			deadlines: tournament.ctx.settings.deadlines,
			discordInviteCode: "", // xxx: todo
			mapPickingStyle: tournament.ctx.mapPickingStyle,
			name: `${tournament.ctx.name} - Division ${div}`,
			organizationId: tournament.ctx.organization?.id ?? null,
			rules: tournament.ctx.rules,
			startTimes: [], // xxx: Todo:
			tags: null, // xxx: Todo:
			tournamentToCopyId: tournament.ctx.id,
			avatarImgId: undefined, // xxx: Todo:
			mapPoolMaps: [], // xxx: todo
			badges: [], // xxx: todo
			enableNoScreenToggle: tournament.ctx.settings.enableNoScreenToggle,
			enableSubs: tournament.ctx.settings.enableSubs,
			isInvitational: true,
			autonomousSubs: false,
			isRanked: tournament.ctx.settings.isRanked,
			minMembersPerTeam: tournament.ctx.settings.minMembersPerTeam,
			regClosesAt: tournament.ctx.settings.regClosesAt,
			requireInGameNames: tournament.ctx.settings.requireInGameNames,
			bracketUrl: "https://sendou.ink",
			isFullTournament: true,
			autoValidateAvatar: true,
			avatarFileName: undefined, // reuse from signup tournament
			// these come from progression
			swissGroupCount: undefined,
			swissRoundCount: undefined,
			teamsPerGroup: undefined,
			thirdPlaceMatch: undefined,
		});

		// xxx: then add teams
	}
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
